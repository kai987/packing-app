mod layout;
mod model;
mod split;
use model::*;
use std::cmp::Ordering;
use wasm_bindgen::prelude::*;

fn cmp(a: f64, b: f64) -> Ordering {
    a.partial_cmp(&b).unwrap_or(Ordering::Equal)
}
// JS Math.round rounds negative half values toward positive infinity.
fn round(value: f64) -> f64 {
    let floor = value.floor();
    if value - floor < 0.5 {
        floor
    } else {
        floor + 1.0
    }
}

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_name=String)]
    type IntlString;
    #[wasm_bindgen(method,js_name=localeCompare)]
    fn locale_compare(this: &IntlString, other: &str) -> i32;
}
fn locale_cmp(a: &str, b: &str) -> Ordering {
    #[cfg(target_arch = "wasm32")]
    {
        let value: IntlString = JsValue::from_str(a).unchecked_into();
        value.locale_compare(b).cmp(&0)
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        a.cmp(b)
    }
}
fn expand(input: &Input) -> Vec<Unit> {
    let mut units = Vec::new();
    for line in &input.order_lines {
        if let Some(product) = input.products.iter().rposition(|p| p.id == line.product_id) {
            for index in 0..line.quantity {
                units.push(Unit {
                    product,
                    instance_id: format!("{}-{}", line.product_id, index + 1),
                    wrap: line.use_item_wrap,
                });
            }
        }
    }
    units.sort_by(|a, b| {
        let a = &input.products[a.product];
        let b = &input.products[b.product];
        cmp(b.size.face(), a.size.face())
            .then_with(|| cmp(b.size.volume(), a.size.volume()))
            .then_with(|| cmp(b.weight, a.weight))
            .then_with(|| cmp(a.fragility.rank(), b.fragility.rank()))
    });
    units
}
fn positive(d: Dimensions) -> bool {
    d.length.is_finite()
        && d.width.is_finite()
        && d.height.is_finite()
        && d.length > 0.
        && d.width > 0.
        && d.height > 0.
}
fn validate(input: &Input) -> Result<(), String> {
    if input
        .order_lines
        .iter()
        .try_fold(0usize, |sum, line| sum.checked_add(line.quantity))
        .is_none_or(|total| total > 10000)
    {
        return Err("Order exceeds 10000 items".into());
    }
    if input
        .products
        .iter()
        .any(|p| !positive(p.size) || !p.weight.is_finite() || p.weight <= 0.)
    {
        return Err("Products require positive dimensions and weight".into());
    }
    if input.cartons.iter().any(|c| !positive(c.inner)) {
        return Err("Cartons require positive dimensions".into());
    }
    if input.cushions.iter().any(|c| {
        c.side_padding < 0.
            || c.top_padding < 0.
            || c.bottom_padding < 0.
            || c.void_fill_unit_volume <= 0.
    }) {
        return Err("Invalid cushion profile".into());
    }
    Ok(())
}
pub fn compute_json(json: &str) -> Result<String, String> {
    let input: Input = serde_json::from_str(json).map_err(|e| e.to_string())?;
    validate(&input)?;
    let units = expand(&input);
    let mut recommendations = layout::recommendations(&units, &input);
    let mut split_recommendations = split::recommend_split(&units, &input);
    if let Some(limit) = input.limit {
        recommendations.truncate(limit);
        split_recommendations.truncate(limit);
    }
    serde_json::to_string(&Output {
        recommendations,
        split_recommendations,
    })
    .map_err(|e| e.to_string())
}
#[wasm_bindgen]
pub fn compute(json: &str) -> Result<String, JsValue> {
    compute_json(json).map_err(|e| JsValue::from_str(&e))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn js_rounding() {
        assert_eq!(round(-1.5), -1.);
        assert_eq!(round(1.5), 2.);
    }
    #[test]
    fn rejects_invalid_json() {
        assert!(compute_json("{}").is_err());
    }
    #[test]
    fn wrapping_rotates_with_content() {
        let input:Input=serde_json::from_str(r##"{"products":[{"id":"p","brand":"b","name":"p","category":"c","size":{"length":100,"width":80,"height":60},"weight":100,"fragility":"low","color":"#fff","note":""}],"cartons":[{"id":"c","code":"c","label":"c","service":"s","inner":{"length":78,"width":96,"height":122},"maxWeight":null,"volumetricWeight":1500,"note":""}],"cushions":[{"id":"a","name":"a","sidePadding":5,"topPadding":8,"bottomPadding":8,"stabilityBonus":8,"voidFillUnitVolume":300000,"note":""}],"orderLines":[{"productId":"p","quantity":1,"useItemWrap":true}],"unitOrder":["p-1"],"productOrder":["p"]}"##).unwrap();
        let plans = layout::recommendations(&expand(&input), &input);
        assert_eq!(plans.len(), 1);
        let p = &plans[0].placements[0];
        assert_eq!((p.length, p.width, p.height), (68., 86., 106.));
        assert_eq!(
            p.content_size,
            Dimensions {
                length: 60.,
                width: 80.,
                height: 100.
            }
        );
    }
}
