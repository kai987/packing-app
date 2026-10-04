use crate::layout::{recommendations, score_profile};
use crate::model::*;
use crate::{cmp, locale_cmp, round};
use std::collections::HashMap;

type Group = Vec<Unit>;
type Grouping = Vec<Group>;
fn weight(group: &[Unit], input: &Input) -> f64 {
    group.iter().map(|u| input.products[u.product].weight).sum()
}
fn volume(group: &[Unit], input: &Input) -> f64 {
    group
        .iter()
        .map(|u| input.products[u.product].size.volume())
        .sum()
}
fn counts(group: &[Unit], input: &Input) -> Vec<(String, usize)> {
    let mut counts: Vec<(String, usize)> = Vec::new();
    for u in group {
        let id = &input.products[u.product].id;
        if let Some(count) = counts.iter_mut().find(|(key, _)| key == id) {
            count.1 += 1;
        } else {
            counts.push((id.clone(), 1));
        }
    }
    counts.sort_by_key(|(id, _)| {
        input
            .product_order
            .iter()
            .position(|key| key == id)
            .unwrap_or(usize::MAX)
    });
    counts
}
fn signature(group: &[Unit], input: &Input) -> String {
    counts(group, input)
        .iter()
        .map(|(id, n)| format!("{id}:{n}"))
        .collect::<Vec<_>>()
        .join(",")
}
fn group_signature(groups: &[Group], input: &Input) -> String {
    let mut signatures: Vec<_> = groups.iter().map(|g| signature(g, input)).collect();
    signatures.sort();
    signatures.join("|")
}
fn normalize(groups: &mut Grouping, input: &Input) {
    for group in groups.iter_mut() {
        group.sort_by_key(|u| {
            input
                .unit_order
                .iter()
                .position(|key| key == &u.instance_id)
                .unwrap_or(usize::MAX)
        });
    }
    groups.sort_by(|a, b| {
        cmp(volume(b, input), volume(a, input))
            .then_with(|| cmp(weight(b, input), weight(a, input)))
            .then_with(|| locale_cmp(&signature(a, input), &signature(b, input)))
    });
}
fn grouping_score(groups: &[Group], input: &Input) -> f64 {
    let spread = |values: Vec<f64>| {
        values.iter().copied().fold(f64::NEG_INFINITY, f64::max)
            - values.iter().copied().fold(f64::INFINITY, f64::min)
    };
    spread(groups.iter().map(|g| volume(g, input)).collect()) / 10000.
        + spread(groups.iter().map(|g| weight(g, input)).collect()) / 50.
        + spread(groups.iter().map(|g| g.len() as f64).collect()) * 10.
}
fn partitions(group: &[Unit], input: &Input) -> Vec<Grouping> {
    let mut results = Vec::new();
    if group.len() < 2 {
        return results;
    }
    if group.len() <= 12 {
        for mask in 1..(1usize << (group.len() - 1)) {
            let mut left = Vec::new();
            let mut right = vec![group.last().unwrap().clone()];
            for (i, unit) in group.iter().take(group.len() - 1).enumerate() {
                if mask & (1 << i) != 0 {
                    left.push(unit.clone());
                } else {
                    right.push(unit.clone());
                }
            }
            results.push(vec![left, right]);
        }
    } else {
        let mut sorted = group.to_vec();
        sorted.sort_by(|a, b| {
            cmp(
                input.products[b.product].size.volume(),
                input.products[a.product].size.volume(),
            )
        });
        for strategy in 0..3 {
            let mut left = Vec::new();
            let mut right = Vec::new();
            for unit in &sorted {
                let assign = match strategy {
                    0 => volume(&left, input) <= volume(&right, input),
                    1 => weight(&left, input) <= weight(&right, input),
                    _ => input.products[unit.product].fragility == Fragility::High,
                };
                if assign {
                    left.push(unit.clone());
                } else {
                    right.push(unit.clone());
                }
            }
            if left.is_empty() {
                left.push(sorted[0].clone());
                right.remove(0);
            }
            if right.is_empty() {
                right.push(sorted[0].clone());
                left.remove(0);
            }
            results.push(vec![left, right]);
        }
    }
    let mut seen = std::collections::HashSet::new();
    results.retain(|g| seen.insert(group_signature(g, input)));
    results.sort_by(|a, b| {
        cmp(grouping_score(a, input), grouping_score(b, input))
            .then_with(|| locale_cmp(&group_signature(a, input), &group_signature(b, input)))
    });
    results
}
fn groupings(units: &[Unit], count: usize, input: &Input) -> Vec<Grouping> {
    let mut first = vec![units.to_vec()];
    normalize(&mut first, input);
    let mut frontier = vec![first];
    for _ in 1..count {
        let mut next: Vec<Grouping> = Vec::new();
        let mut keys = HashMap::new();
        for grouping in &frontier {
            for (i, group) in grouping.iter().enumerate() {
                for partition in partitions(group, input).into_iter().take(6) {
                    let mut candidate = grouping[..i].to_vec();
                    candidate.extend(partition);
                    candidate.extend_from_slice(&grouping[i + 1..]);
                    normalize(&mut candidate, input);
                    let key = group_signature(&candidate, input);
                    if let Some(&index) = keys.get(&key) {
                        next[index] = candidate;
                    } else {
                        keys.insert(key, next.len());
                        next.push(candidate);
                    }
                }
            }
        }
        next.sort_by(|a, b| cmp(grouping_score(a, input), grouping_score(b, input)));
        next.truncate(24);
        frontier = next;
        if frontier.is_empty() {
            break;
        }
    }
    frontier.into_iter().filter(|g| g.len() == count).collect()
}
fn items(group: &[Unit], input: &Input) -> Vec<Item> {
    let mut items = Vec::new();
    for (id, quantity) in counts(group, input) {
        let p = input.products.iter().find(|p| p.id == id).unwrap();
        items.push(Item {
            product_id: id,
            brand: p.brand.clone(),
            name: p.name.clone(),
            category: p.category.clone(),
            color: p.color.clone(),
            quantity,
        });
    }
    items.sort_by(|a, b| locale_cmp(&a.name, &b.name));
    items
}
fn combined(mut boxes: Vec<SplitBox>, strategy: Strategy) -> SplitRecommendation {
    boxes.sort_by(|a, b| {
        cmp(
            b.recommendation.carton.inner.volume(),
            a.recommendation.carton.inner.volume(),
        )
        .then_with(|| cmp(b.recommendation.total_weight, a.recommendation.total_weight))
    });
    for (i, b) in boxes.iter_mut().enumerate() {
        b.box_index = i + 1;
    }
    let sum = |field: fn(&Recommendation) -> f64| {
        boxes.iter().map(|b| field(&b.recommendation)).sum::<f64>()
    };
    let total_weight = sum(|r| r.total_weight);
    let item_volume = sum(|r| r.item_volume);
    let effective_volume = sum(|r| r.effective_inner.volume());
    let carton_volume = sum(|r| r.carton.inner.volume());
    let total_empty_volume = sum(|r| r.empty_volume);
    let stability_score = if total_weight > 0. {
        round(sum(|r| r.stability_score * r.total_weight) / total_weight)
    } else {
        0.
    };
    let effective_fill_rate = if effective_volume > 0. {
        item_volume / effective_volume
    } else {
        0.
    };
    let fill_rate = if carton_volume > 0. {
        item_volume / carton_volume
    } else {
        0.
    };
    let (fw, sw, ep, _) = score_profile(strategy);
    let score = round(
        effective_fill_rate * fw + stability_score * sw
            - total_empty_volume / 1_000_000. * ep
            - (boxes.len() - 1) as f64 * 1.6,
    );
    let key = boxes
        .iter()
        .map(|b| {
            let mut signatures = b
                .items
                .iter()
                .map(|i| format!("{}:{}", i.product_id, i.quantity))
                .collect::<Vec<_>>();
            signatures.sort();
            format!(
                "{}:{}:{}",
                b.recommendation.carton.id,
                b.recommendation.cushion.id,
                signatures.join(",")
            )
        })
        .collect::<Vec<_>>()
        .join("|");
    SplitRecommendation {
        key,
        strategy,
        score,
        box_count: boxes.len(),
        total_weight,
        item_volume,
        total_empty_volume,
        total_recommended_void_fill_volume: sum(|r| r.recommended_void_fill_volume),
        total_unused_volume: sum(|r| r.unused_volume),
        fill_rate,
        effective_fill_rate,
        stability_score,
        boxes,
        reasons: Vec::new(),
    }
}
pub fn recommend_split(units: &[Unit], input: &Input) -> Vec<SplitRecommendation> {
    if units.len() < 2 {
        return Vec::new();
    }
    let mut results: Vec<SplitRecommendation> = Vec::new();
    let mut result_keys: HashMap<String, usize> = HashMap::new();
    let mut cache: HashMap<String, Vec<Recommendation>> = HashMap::new();
    for count in 2..=5.min(units.len()) {
        for grouping in groupings(units, count, input) {
            let sets: Vec<Vec<Recommendation>> = grouping
                .iter()
                .map(|group| {
                    // Include order, identity and wrap state: count-only caching can change layouts.
                    let key = group
                        .iter()
                        .map(|u| format!("{}:{}:{}", u.product, u.instance_id, u.wrap))
                        .collect::<Vec<_>>()
                        .join("|");
                    cache
                        .entry(key)
                        .or_insert_with(|| {
                            recommendations(group, input).into_iter().take(2).collect()
                        })
                        .clone()
                })
                .collect();
            if sets.iter().any(|set| set.is_empty()) {
                continue;
            }
            for mask in 0..(1usize << sets.len()) {
                // Equivalent to JS's depth-first Cartesian product (last set varies fastest).
                let choices: Vec<_> = sets
                    .iter()
                    .enumerate()
                    .map(|(i, set)| (mask >> (sets.len() - 1 - i)) & 1.min(set.len() - 1))
                    .collect();
                // Skip duplicate combinations when a set contains only one recommendation.
                if sets
                    .iter()
                    .enumerate()
                    .any(|(i, set)| set.len() == 1 && (mask >> (sets.len() - 1 - i)) & 1 != 0)
                {
                    continue;
                }
                let boxes = sets
                    .iter()
                    .enumerate()
                    .map(|(i, set)| SplitBox {
                        box_index: i + 1,
                        recommendation: set[choices[i]].clone(),
                        items: items(&grouping[i], input),
                    })
                    .collect();
                let recommendation = combined(boxes, input.strategy);
                if let Some(&i) = result_keys.get(&recommendation.key) {
                    if recommendation.score > results[i].score {
                        results[i] = recommendation;
                    }
                } else {
                    result_keys.insert(recommendation.key.clone(), results.len());
                    results.push(recommendation);
                }
            }
        }
    }
    results.sort_by(|a, b| {
        cmp(b.score, a.score)
            .then_with(|| cmp(b.effective_fill_rate, a.effective_fill_rate))
            .then_with(|| a.box_count.cmp(&b.box_count))
            .then_with(|| cmp(a.total_empty_volume, b.total_empty_volume))
    });
    results
}
