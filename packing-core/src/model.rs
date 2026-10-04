use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq)]
pub struct Dimensions {
    pub length: f64,
    pub width: f64,
    pub height: f64,
}

impl Dimensions {
    pub fn volume(self) -> f64 {
        self.length * self.width * self.height
    }
    pub fn face(self) -> f64 {
        (self.length * self.width)
            .max(self.length * self.height)
            .max(self.width * self.height)
    }
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Strategy {
    #[default]
    Compact,
    Stable,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Fragility {
    Low,
    Medium,
    High,
}
impl Fragility {
    pub fn rank(self) -> f64 {
        match self {
            Self::Low => 1.0,
            Self::Medium => 2.0,
            Self::High => 3.0,
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Product {
    pub id: String,
    pub brand: String,
    pub name: String,
    pub category: String,
    pub size: Dimensions,
    pub weight: f64,
    pub fragility: Fragility,
    pub color: String,
    pub note: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub price_yen: Option<f64>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Carton {
    pub id: String,
    pub code: String,
    pub label: String,
    pub service: String,
    pub inner: Dimensions,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub outer: Option<Dimensions>,
    pub max_weight: Option<f64>,
    pub volumetric_weight: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub price_yen: Option<f64>,
    pub note: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Cushion {
    pub id: String,
    pub name: String,
    pub side_padding: f64,
    pub top_padding: f64,
    pub bottom_padding: f64,
    pub stability_bonus: f64,
    pub void_fill_unit_volume: f64,
    pub note: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrderLine {
    pub product_id: String,
    pub quantity: usize,
    pub use_item_wrap: bool,
}

// Locale-sensitive ordering is supplied by JS, keeping Rust independent of Intl/ICU.
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Input {
    pub products: Vec<Product>,
    pub cartons: Vec<Carton>,
    pub cushions: Vec<Cushion>,
    pub order_lines: Vec<OrderLine>,
    #[serde(default)]
    pub strategy: Strategy,
    pub unit_order: Vec<String>,
    pub product_order: Vec<String>,
    #[serde(default)]
    pub limit: Option<usize>,
}

#[derive(Clone, Debug)]
pub struct Unit {
    pub product: usize,
    pub instance_id: String,
    pub wrap: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Placement {
    pub instance_id: String,
    pub product_id: String,
    pub name: String,
    pub brand: String,
    pub category: String,
    pub color: String,
    pub use_item_wrap: bool,
    pub content_size: Dimensions,
    pub x: f64,
    pub y: f64,
    pub z: f64,
    pub length: f64,
    pub width: f64,
    pub height: f64,
    pub weight: f64,
    pub layer_index: usize,
    pub row_index: usize,
}
impl Placement {
    pub fn size(&self) -> Dimensions {
        Dimensions {
            length: self.length,
            width: self.width,
            height: self.height,
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Layer {
    pub index: usize,
    pub z: f64,
    pub height: f64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VoidBlock {
    pub id: String,
    pub x: f64,
    pub y: f64,
    pub z: f64,
    pub length: f64,
    pub width: f64,
    pub height: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub layer_index: Option<usize>,
}
impl VoidBlock {
    pub fn volume(&self) -> f64 {
        self.length * self.width * self.height
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Recommendation {
    pub key: String,
    pub carton: Carton,
    pub cushion: Cushion,
    pub strategy: Strategy,
    pub score: f64,
    pub total_weight: f64,
    pub item_volume: f64,
    pub empty_volume: f64,
    pub fill_rate: f64,
    pub effective_fill_rate: f64,
    pub stability_score: f64,
    pub void_fill_units: f64,
    pub recommended_void_fill_volume: f64,
    pub bottom_fill_height: f64,
    pub top_void_fill_height: f64,
    pub top_empty_height: f64,
    pub unused_top_height: f64,
    pub unused_volume: f64,
    pub effective_inner: Dimensions,
    pub placements: Vec<Placement>,
    pub layers: Vec<Layer>,
    pub reasons: Vec<String>,
    pub void_fill_blocks: Vec<VoidBlock>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Item {
    pub product_id: String,
    pub brand: String,
    pub name: String,
    pub category: String,
    pub color: String,
    pub quantity: usize,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SplitBox {
    pub box_index: usize,
    pub recommendation: Recommendation,
    pub items: Vec<Item>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SplitRecommendation {
    pub key: String,
    pub strategy: Strategy,
    pub score: f64,
    pub box_count: usize,
    pub total_weight: f64,
    pub item_volume: f64,
    pub total_empty_volume: f64,
    pub total_recommended_void_fill_volume: f64,
    pub total_unused_volume: f64,
    pub fill_rate: f64,
    pub effective_fill_rate: f64,
    pub stability_score: f64,
    pub boxes: Vec<SplitBox>,
    pub reasons: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Output {
    pub recommendations: Vec<Recommendation>,
    pub split_recommendations: Vec<SplitRecommendation>,
}
