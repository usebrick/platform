// Synthetic Rust fixture for the `dead/unused-import` rule's Rust path.
//
// Three intentional imports:
//   - `HashMap` is imported and used (a reference in `build_map`).
//   - `VecDeque` is imported but never used — the rule's primary
//     target. This is the canonical "AI-iteration rot" smell:
//     the model added the import when scaffolding a feature, then
//     rewrote the body to use a different data structure (here
//     `std::vec::Vec`).
//   - `BTreeMap` is also imported but never used — second target.
//
// Imports of `std::collections::{A, B}` (use-list form) are tracked
// per-specifier by the tree-sitter walker; the unused-specifier rule
// should fire on `VecDeque` and `BTreeMap`, not on `HashMap`.

use std::collections::{HashMap, VecDeque, BTreeMap};
use std::sync::Arc;
use crate::utils::{helper_one, helper_two};

pub fn build_map() -> HashMap<String, u32> {
    let mut m = HashMap::new();
    m.insert("k".to_string(), 1);
    m
}

pub fn helper_one() {}

pub fn unused_public() {}
