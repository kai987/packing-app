use crate::model::*;
use crate::{cmp, round};

#[derive(Clone)]
struct Row {
    y: f64,
    depth: f64,
    cursor: f64,
}
struct Frame {
    z: f64,
    height: f64,
    rows: Vec<Row>,
}
#[derive(Clone, Copy)]
struct Orientation {
    size: Dimensions,
    content: Dimensions,
}
#[derive(Clone, Copy)]
enum Mode {
    Row,
    NewRow,
    NewLayer,
}
struct Candidate {
    mode: Mode,
    layer: usize,
    row: usize,
    x: f64,
    y: f64,
    z: f64,
    orientation: Orientation,
    score: f64,
    delta: f64,
}
struct Tuning {
    layer: f64,
    footprint: f64,
    length: f64,
    width: f64,
    slack: f64,
    depth: f64,
    new_row: f64,
    new_layer: f64,
    same_layer: f64,
    same_row: f64,
    mixed: f64,
}
fn tuning(strategy: Strategy) -> Tuning {
    if strategy == Strategy::Stable {
        Tuning {
            layer: 180000.,
            footprint: 9.,
            length: 10.,
            width: 14.,
            slack: 6.,
            depth: 36.,
            new_row: 150000.,
            new_layer: 600000.,
            same_layer: 8500.,
            same_row: 5000.,
            mixed: 4200.,
        }
    } else {
        Tuning {
            layer: 150000.,
            footprint: 7.,
            length: 14.,
            width: 18.,
            slack: 8.,
            depth: 20.,
            new_row: 120000.,
            new_layer: 520000.,
            same_layer: 6500.,
            same_row: 3500.,
            mixed: 2400.,
        }
    }
}
fn fragility_penalty(fragility: Fragility, d: Dimensions, strategy: Strategy) -> f64 {
    let compact = strategy == Strategy::Compact;
    (d.length.max(d.width) - d.height).max(0.) * if compact { 14. } else { 16. } * fragility.rank()
        + d.length * d.width * if compact { 0.05 } else { 0.07 }
        - d.height * if compact { 11. } else { 9. }
}
fn support_penalty(fragility: Fragility, layer: usize, strategy: Strategy) -> f64 {
    let compact = strategy == Strategy::Compact;
    match fragility {
        Fragility::High => {
            if layer == 0 {
                if compact { 135000. } else { 260000. }
            } else if compact {
                20000.
            } else {
                8000.
            }
        }
        Fragility::Medium => layer as f64 * if compact { 45000. } else { 65000. },
        Fragility::Low => layer as f64 * if compact { 80000. } else { 110000. },
    }
}
fn orientations(
    product: &Product,
    wrap: bool,
    cushion: &Cushion,
    strategy: Strategy,
) -> Vec<Orientation> {
    let side = if wrap {
        round(cushion.side_padding * 0.55).clamp(2., 6.) * 2.
    } else {
        0.
    };
    let vertical = if wrap {
        round(cushion.top_padding.min(cushion.bottom_padding) * 0.5).clamp(2., 6.) * 2.
    } else {
        0.
    };
    let content = [product.size.length, product.size.width, product.size.height];
    let package = [content[0] + side, content[1] + side, content[2] + vertical];
    let mut options: Vec<Orientation> = Vec::new();
    for [l, w, h] in [
        [0, 1, 2],
        [0, 2, 1],
        [1, 0, 2],
        [1, 2, 0],
        [2, 0, 1],
        [2, 1, 0],
    ] {
        let o = Orientation {
            size: Dimensions {
                length: package[l],
                width: package[w],
                height: package[h],
            },
            content: Dimensions {
                length: content[l],
                width: content[w],
                height: content[h],
            },
        };
        // JS Map keeps the first key position but replaces its value on duplicate dimensions.
        if let Some(existing) = options.iter_mut().find(|old| old.size == o.size) {
            *existing = o;
        } else {
            options.push(o);
        }
    }
    options.sort_by(|a, b| {
        cmp(
            fragility_penalty(product.fragility, a.size, strategy),
            fragility_penalty(product.fragility, b.size, strategy),
        )
        .then_with(|| cmp(b.size.height, a.size.height))
        .then_with(|| cmp(a.size.length * a.size.width, b.size.length * b.size.width))
    });
    options
}
fn area(placements: &[Placement], layer: usize) -> f64 {
    placements
        .iter()
        .filter(|p| p.layer_index == layer)
        .map(|p| p.length * p.width)
        .sum()
}
fn supported(placements: &[Placement], layer: usize, x: f64, y: f64, d: Dimensions) -> bool {
    if layer == 0 {
        return true;
    }
    let footprint = d.length * d.width;
    let coverage: f64 = placements
        .iter()
        .filter(|p| p.layer_index == layer - 1)
        .map(|p| {
            let length = (x + d.length).min(p.x + p.length) - x.max(p.x);
            let width = (y + d.width).min(p.y + p.width) - y.max(p.y);
            length.max(0.) * width.max(0.)
        })
        .sum();
    coverage / footprint >= 0.72
        && area(placements, layer - 1) > area(placements, layer) + footprint
}
fn consider(best: &mut Option<Candidate>, candidate: Candidate) {
    if best
        .as_ref()
        .is_none_or(|current| candidate.score < current.score)
    {
        *best = Some(candidate);
    }
}
fn find_candidate(
    layers: &[Frame],
    placements: &[Placement],
    bounds: Dimensions,
    o: Orientation,
    product: &Product,
    strategy: Strategy,
    allow_new: bool,
) -> Option<Candidate> {
    let mut best = None;
    let t = tuning(strategy);
    let d = o.size;
    for (li, layer) in layers.iter().enumerate() {
        if d.height != layer.height {
            continue;
        }
        let layer_items: Vec<_> = placements.iter().filter(|p| p.layer_index == li).collect();
        let same_layer = layer_items
            .iter()
            .filter(|p| p.product_id == product.id)
            .count() as f64;
        let mixed = if !layer_items.is_empty() && same_layer == 0. {
            t.mixed
        } else {
            0.
        };
        let base = li as f64 * t.layer
            + if li == 0 {
                0.
            } else {
                d.length * d.width * t.footprint
            };
        let penalties = support_penalty(product.fragility, li, strategy)
            + fragility_penalty(product.fragility, d, strategy);
        for (ri, row) in layer.rows.iter().enumerate() {
            let same_row = layer_items
                .iter()
                .filter(|p| p.row_index == ri && p.product_id == product.id)
                .count() as f64;
            let delta = (d.width - row.depth).max(0.);
            let used_width = layer.rows.iter().map(|r| r.depth).sum::<f64>() + delta;
            if used_width <= bounds.width
                && row.cursor + d.length <= bounds.length
                && supported(placements, li, row.cursor, row.y, d)
            {
                let score = base
                    + (bounds.length - (row.cursor + d.length)) * t.length
                    + (row.depth.max(d.width) - d.width) * t.slack
                    + row.y * 2.
                    + delta * t.depth
                    + mixed
                    - (same_layer * t.same_layer + same_row * t.same_row)
                    + penalties;
                consider(
                    &mut best,
                    Candidate {
                        mode: Mode::Row,
                        layer: li,
                        row: ri,
                        x: row.cursor,
                        y: row.y,
                        z: layer.z,
                        orientation: o,
                        score,
                        delta,
                    },
                );
            }
        }
        let used_width = layer.rows.iter().map(|r| r.depth).sum::<f64>();
        if used_width + d.width <= bounds.width
            && d.length <= bounds.length
            && supported(placements, li, 0., used_width, d)
        {
            let score = base
                + t.new_row
                + (bounds.width - (used_width + d.width)) * t.width
                + (bounds.length - d.length) * t.length
                + used_width * 4.
                + mixed
                - same_layer * t.same_layer
                + penalties;
            consider(
                &mut best,
                Candidate {
                    mode: Mode::NewRow,
                    layer: li,
                    row: layer.rows.len(),
                    x: 0.,
                    y: used_width,
                    z: layer.z,
                    orientation: o,
                    score,
                    delta: 0.,
                },
            );
        }
    }
    let z = layers.last().map_or(0., |l| l.z + l.height + 10.);
    let li = layers.len();
    if allow_new
        && li < 2
        && z + d.height <= bounds.height
        && d.length <= bounds.length
        && d.width <= bounds.width
        && supported(placements, li, 0., 0., d)
    {
        let score = li as f64 * t.layer
            + if li == 0 {
                0.
            } else {
                d.length * d.width * t.footprint
            }
            + t.new_layer
            + (bounds.width - d.width) * t.width
            + (bounds.length - d.length) * t.length
            + support_penalty(product.fragility, li, strategy)
            + fragility_penalty(product.fragility, d, strategy);
        consider(
            &mut best,
            Candidate {
                mode: Mode::NewLayer,
                layer: li,
                row: 0,
                x: 0.,
                y: 0.,
                z,
                orientation: o,
                score,
                delta: 0.,
            },
        );
    }
    best
}
pub fn pack(
    units: &[Unit],
    input: &Input,
    bounds: Dimensions,
    cushion: &Cushion,
) -> Option<(Vec<Placement>, Vec<Layer>)> {
    let mut layers: Vec<Frame> = Vec::new();
    let mut placements: Vec<Placement> = Vec::new();
    for unit in units {
        let product = &input.products[unit.product];
        let options = orientations(product, unit.wrap, cushion, input.strategy);
        let mut best = None;
        for allow_new in [false, true] {
            for &o in &options {
                if let Some(candidate) = find_candidate(
                    &layers,
                    &placements,
                    bounds,
                    o,
                    product,
                    input.strategy,
                    allow_new,
                ) {
                    consider(&mut best, candidate);
                }
            }
            if best.is_some() {
                break;
            }
        }
        let c = best?;
        match c.mode {
            Mode::NewLayer => layers.push(Frame {
                z: c.z,
                height: c.orientation.size.height,
                rows: vec![Row {
                    y: 0.,
                    depth: c.orientation.size.width,
                    cursor: c.orientation.size.length,
                }],
            }),
            Mode::NewRow => layers[c.layer].rows.push(Row {
                y: c.y,
                depth: c.orientation.size.width,
                cursor: c.orientation.size.length,
            }),
            Mode::Row => {
                if c.delta > 0. {
                    let rows = &mut layers[c.layer].rows;
                    rows[c.row].depth += c.delta;
                    for row in rows.iter_mut().skip(c.row + 1) {
                        row.y += c.delta;
                    }
                    for p in &mut placements {
                        if p.layer_index == c.layer && p.row_index > c.row {
                            p.y += c.delta;
                        }
                    }
                }
                layers[c.layer].rows[c.row].cursor += c.orientation.size.length;
            }
        }
        placements.push(Placement {
            instance_id: unit.instance_id.clone(),
            product_id: product.id.clone(),
            name: product.name.clone(),
            brand: product.brand.clone(),
            category: product.category.clone(),
            color: product.color.clone(),
            use_item_wrap: unit.wrap,
            content_size: c.orientation.content,
            x: c.x,
            y: c.y,
            z: c.z,
            length: c.orientation.size.length,
            width: c.orientation.size.width,
            height: c.orientation.size.height,
            weight: product.weight,
            layer_index: c.layer,
            row_index: c.row,
        });
    }
    let used_length = placements.iter().map(|p| p.x + p.length).fold(0., f64::max);
    let used_width = placements.iter().map(|p| p.y + p.width).fold(0., f64::max);
    for p in &mut placements {
        p.x += (bounds.length - used_length).max(0.) / 2.;
        p.y += (bounds.width - used_width).max(0.) / 2.;
    }
    Some((
        placements,
        layers
            .into_iter()
            .enumerate()
            .map(|(index, l)| Layer {
                index,
                z: l.z,
                height: l.height,
            })
            .collect(),
    ))
}
pub fn void_blocks(
    bounds: Dimensions,
    placements: &[Placement],
    layers: &[Layer],
    top: f64,
) -> Vec<VoidBlock> {
    let mut blocks = Vec::new();
    let mut add = |id: String,
                   layer: Option<usize>,
                   x: f64,
                   y: f64,
                   z: f64,
                   length: f64,
                   width: f64,
                   height: f64| {
        if length > 0. && width > 0. && height > 0. {
            blocks.push(VoidBlock {
                id,
                layer_index: layer,
                x,
                y,
                z,
                length,
                width,
                height,
            });
        }
    };
    for layer in layers {
        let mut items: Vec<_> = placements
            .iter()
            .filter(|p| p.layer_index == layer.index)
            .collect();
        items.sort_by(|a, b| a.row_index.cmp(&b.row_index).then_with(|| cmp(a.x, b.x)));
        let mut rows: Vec<(usize, f64, f64, Vec<&Placement>)> = Vec::new();
        for p in items {
            if let Some(row) = rows.iter_mut().find(|r| r.0 == p.row_index) {
                row.2 = row.2.max(p.width);
                row.3.push(p);
            } else {
                rows.push((p.row_index, p.y, p.width, vec![p]));
            }
        }
        rows.sort_by(|a, b| cmp(a.1, b.1));
        for (_, y, depth, items) in &rows {
            let mut cursor = 0.;
            for p in items {
                if p.x > cursor {
                    add(
                        format!("{}-front-gap", p.instance_id),
                        Some(layer.index),
                        cursor,
                        *y,
                        layer.z,
                        p.x - cursor,
                        *depth,
                        layer.height,
                    );
                }
                if p.width < *depth {
                    add(
                        format!("{}-depth-gap", p.instance_id),
                        Some(layer.index),
                        p.x,
                        p.y + p.width,
                        layer.z,
                        p.length,
                        *depth - p.width,
                        layer.height,
                    );
                }
                cursor = p.x + p.length;
            }
            if cursor < bounds.length {
                add(
                    format!("layer-{}-row-{}-tail-gap", layer.index, y),
                    Some(layer.index),
                    cursor,
                    *y,
                    layer.z,
                    bounds.length - cursor,
                    *depth,
                    layer.height,
                );
            }
        }
        let mut cursor = 0.;
        for (_, y, depth, _) in rows {
            if y > cursor {
                add(
                    format!("layer-{}-row-gap-{}", layer.index, cursor),
                    Some(layer.index),
                    0.,
                    cursor,
                    layer.z,
                    bounds.length,
                    y - cursor,
                    layer.height,
                );
            }
            cursor = cursor.max(y + depth);
        }
        if cursor < bounds.width {
            add(
                format!("layer-{}-rear-gap", layer.index),
                Some(layer.index),
                0.,
                cursor,
                layer.z,
                bounds.length,
                bounds.width - cursor,
                layer.height,
            );
        }
    }
    let used_height = layers.iter().map(|l| l.z + l.height).fold(0., f64::max);
    add(
        "top-void-gap".into(),
        None,
        0.,
        0.,
        used_height,
        bounds.length,
        bounds.width,
        top.min((bounds.height - used_height).max(0.)),
    );
    blocks
}
pub fn score_profile(strategy: Strategy) -> (f64, f64, f64, f64) {
    if strategy == Strategy::Stable {
        (54., 0.55, 0.3, 4.)
    } else {
        (78., 0.2, 0.82, 1.)
    }
}
pub fn recommendations(units: &[Unit], input: &Input) -> Vec<Recommendation> {
    if units.is_empty() {
        return Vec::new();
    }
    let total_weight: f64 = units.iter().map(|u| input.products[u.product].weight).sum();
    let fragility = units
        .iter()
        .map(|u| input.products[u.product].fragility)
        .max_by(|a, b| cmp(a.rank(), b.rank()))
        .unwrap();
    let mut results = Vec::new();
    for carton in &input.cartons {
        if carton.max_weight.is_some_and(|max| total_weight > max) {
            continue;
        }
        for cushion in &input.cushions {
            let bottom = cushion.bottom_padding
                + if total_weight > 4500. {
                    8.
                } else if total_weight > 3000. {
                    6.
                } else if total_weight > 1800. {
                    4.
                } else if total_weight > 700. {
                    2.
                } else {
                    0.
                };
            let bounds = Dimensions {
                length: carton.inner.length - cushion.side_padding * 2.,
                width: carton.inner.width - cushion.side_padding * 2.,
                height: carton.inner.height - cushion.top_padding - bottom,
            };
            if bounds.length <= 0. || bounds.width <= 0. || bounds.height <= 0. {
                continue;
            }
            let Some((placements, layers)) = pack(units, input, bounds, cushion) else {
                continue;
            };
            let top_empty = (bounds.height
                - placements.iter().map(|p| p.z + p.height).fold(0., f64::max))
            .max(0.);
            let top_base: f64 = if input.strategy == Strategy::Compact {
                12.
            } else {
                18.
            } + if total_weight > 4000. {
                8.
            } else if total_weight > 2500. {
                4.
            } else {
                0.
            } + match fragility {
                Fragility::High => 6.,
                Fragility::Medium => 3.,
                Fragility::Low => 0.,
            };
            let top = top_base.max(cushion.top_padding).min(top_empty);
            let blocks = void_blocks(bounds, &placements, &layers, top);
            let item_volume = placements.iter().map(|p| p.size().volume()).sum::<f64>();
            let empty = (bounds.volume() - item_volume).max(0.);
            let fill = blocks.iter().map(|b| b.volume()).sum::<f64>();
            let effective_rate = item_volume / bounds.volume();
            let weighted_height = placements
                .iter()
                .map(|p| p.weight * ((p.z + p.height / 2.) / bounds.height))
                .sum::<f64>()
                / total_weight;
            let lower_weight = placements
                .iter()
                .filter(|p| p.z + p.height / 2. <= bounds.height / 2.)
                .map(|p| p.weight)
                .sum::<f64>();
            let stability = round(
                58. + cushion.stability_bonus + lower_weight / total_weight * 18.
                    - weighted_height * 22.
                    - (layers.len() - 1) as f64 * 5.
                    - ((0.58 - effective_rate) * 42.).max(0.),
            )
            .clamp(1., 99.);
            let protection = if input.strategy == Strategy::Stable || total_weight > 2500. {
                0.
            } else {
                let p: f64 = if cushion.stability_bonus >= 15. {
                    4.
                } else if cushion.stability_bonus >= 10. {
                    1.
                } else {
                    0.
                };
                if fragility == Fragility::High {
                    (p - 1.).max(0.)
                } else {
                    p
                }
            };
            let (fw, sw, ep, lp) = score_profile(input.strategy);
            let score = round(
                effective_rate * fw + stability * sw
                    - empty / 1_000_000. * ep
                    - (layers.len() - 1) as f64 * lp
                    - protection,
            );
            results.push(Recommendation {
                key: format!("{}:{}", carton.id, cushion.id),
                carton: carton.clone(),
                cushion: cushion.clone(),
                strategy: input.strategy,
                score,
                total_weight,
                item_volume,
                empty_volume: empty,
                fill_rate: item_volume / carton.inner.volume(),
                effective_fill_rate: effective_rate,
                stability_score: stability,
                void_fill_units: (fill / cushion.void_fill_unit_volume).ceil(),
                recommended_void_fill_volume: fill,
                bottom_fill_height: bottom,
                top_void_fill_height: top,
                top_empty_height: top_empty,
                unused_top_height: (top_empty - top).max(0.),
                unused_volume: (empty - fill).max(0.),
                effective_inner: bounds,
                placements,
                layers,
                reasons: Vec::new(),
                void_fill_blocks: blocks,
            });
        }
    }
    results.sort_by(|a, b| {
        cmp(b.score, a.score)
            .then_with(|| cmp(a.carton.inner.volume(), b.carton.inner.volume()))
            .then_with(|| cmp(b.stability_score, a.stability_score))
    });
    results
}
