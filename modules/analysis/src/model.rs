use petgraph::Graph;
use serde::Serialize;
use std::{collections::HashMap, fmt};
use trustify_common::cpe::Cpe;
use trustify_common::purl::Purl;
use trustify_entity::relationship::Relationship;
use utoipa::ToSchema;

#[derive(Debug, Clone, PartialEq, Eq, ToSchema, serde::Serialize)]
pub struct AnalysisStatus {
    /// The number of SBOMs found in the database
    pub sbom_count: u32,
    /// The number of graphs loaded in memory
    pub graph_count: u32,
}

impl fmt::Display for AnalysisStatus {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "graph_count {}", self.graph_count)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, ToSchema, serde::Serialize)]
pub struct PackageNode {
    pub sbom_id: String,
    pub node_id: String,
    pub purl: Vec<Purl>,
    pub cpe: Vec<Cpe>,
    pub name: String,
    pub version: String,
    pub published: String,
    pub document_id: String,
    pub product_name: String,
    pub product_version: String,
}
impl fmt::Display for PackageNode {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{:?}", self.purl)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, ToSchema, serde::Serialize)]
pub struct AncNode {
    pub sbom_id: String,
    pub node_id: String,
    pub relationship: String,
    pub purl: Vec<Purl>,
    pub cpe: Vec<Cpe>,
    pub name: String,
    pub version: String,
}

impl fmt::Display for AncNode {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{:?}", self.purl)
    }
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct AncestorSummary {
    pub sbom_id: String,
    pub node_id: String,
    pub purl: Vec<Purl>,
    pub cpe: Vec<Cpe>,
    pub name: String,
    pub version: String,
    pub published: String,
    pub document_id: String,
    pub product_name: String,
    pub product_version: String,
    pub ancestors: Vec<AncNode>,
}

#[derive(Debug, Clone, PartialEq, Eq, ToSchema, serde::Serialize)]
pub struct DepNode {
    pub sbom_id: String,
    pub node_id: String,
    pub relationship: String,
    pub purl: Vec<Purl>,
    pub cpe: Vec<Cpe>,
    pub name: String,
    pub version: String,
    #[schema(no_recursion)]
    pub deps: Vec<DepNode>,
}
impl fmt::Display for DepNode {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{:?}", self.purl)
    }
}
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct DepSummary {
    pub sbom_id: String,
    pub node_id: String,
    pub purl: Vec<Purl>,
    pub cpe: Vec<Cpe>,
    pub name: String,
    pub version: String,
    pub published: String,
    pub document_id: String,
    pub product_name: String,
    pub product_version: String,
    pub deps: Vec<DepNode>,
}
#[derive(Debug)]
pub struct GraphMap {
    map: HashMap<String, Graph<PackageNode, Relationship, petgraph::Directed>>,
}

impl GraphMap {
    // Create a new instance of GraphMap
    pub fn new() -> Self {
        GraphMap {
            map: HashMap::new(),
        }
    }

    // Check if the map contains a key
    pub fn contains_key(&self, key: &str) -> bool {
        self.map.contains_key(key)
    }

    // Get the number of graphs in the map
    pub fn len(&self) -> usize {
        self.map.len()
    }

    // Check if the map is empty
    pub fn is_empty(&self) -> bool {
        self.map.is_empty()
    }

    // Add a new graph with the given key (write access)
    pub fn insert(
        &mut self,
        key: String,
        graph: Graph<PackageNode, Relationship, petgraph::Directed>,
    ) {
        self.map.insert(key, graph);
    }

    // Retrieve a reference to a graph by its key (read access)
    pub fn get(&self, key: &str) -> Option<&Graph<PackageNode, Relationship, petgraph::Directed>> {
        self.map.get(key)
    }

    // Retrieve all sbom ids(read access)
    pub fn sbom_ids(&self) -> Vec<String> {
        self.map.keys().cloned().collect()
    }

    // Clear all graphs from the map
    pub fn clear(&mut self) {
        self.map.clear();
    }
}

impl Default for GraphMap {
    fn default() -> Self {
        Self::new()
    }
}
