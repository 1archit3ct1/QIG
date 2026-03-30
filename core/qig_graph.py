"""
qig_graph.py — Quantum Information Graph

The fundamental data structure of the QIG hypothesis.
A graph where nodes are quantum subsystems and edge weights
are derived from mutual information (entanglement).

In the QIG framework:
  - Nodes = quantum systems Q_i with local Hilbert spaces
  - Edge weight(i,j) = f(I(Q_i : Q_j))^{-1}  → metric distance
  - The graph metric IS spatial geometry

This module implements the QIG as a classical simulation using
density matrices and exact entropy calculations.
"""

import numpy as np
from typing import Optional, Dict, Tuple, List
import networkx as nx
from dataclasses import dataclass, field


@dataclass
class QIGNode:
    """A node in the Quantum Information Graph — one quantum subsystem Q_i."""
    id: int
    label: str
    dim: int                          # Local Hilbert space dimension
    position: Optional[np.ndarray] = None   # Emergent position (computed, not input)
    complexity: float = 0.0           # Accumulated circuit complexity at this node


class QIGGraph:
    """
    The Quantum Information Graph.

    Core principle: geometry is not input. It EMERGES from the
    entanglement structure of the quantum state.

    Usage:
        graph = QIGGraph(n_nodes=8, local_dim=2)
        graph.set_state(rho)              # Set joint density matrix
        graph.compute_metric()            # Derive geometry from entanglement
        dist = graph.distance(0, 3)       # Distance = f(mutual info)^{-1}
        graph.embed_geometry()            # Place nodes in emergent 2D space
    """

    def __init__(self, n_nodes: int, local_dim: int = 2):
        self.n_nodes = n_nodes
        self.local_dim = local_dim
        self.total_dim = local_dim ** n_nodes
        self.nodes = [QIGNode(id=i, label=f"Q{i}", dim=local_dim)
                      for i in range(n_nodes)]

        # Joint density matrix — the fundamental object
        # Default: random pure state
        self.rho: np.ndarray = self._random_pure_state()

        # Computed geometry
        self.metric: Optional[np.ndarray] = None       # n x n distance matrix
        self.graph: nx.Graph = nx.Graph()
        self._build_graph_structure()

    def _random_pure_state(self) -> np.ndarray:
        """Random pure state density matrix on full Hilbert space."""
        psi = np.random.randn(self.total_dim) + 1j * np.random.randn(self.total_dim)
        psi /= np.linalg.norm(psi)
        rho = np.outer(psi, psi.conj())
        return rho

    def set_state(self, rho: np.ndarray):
        """Set the joint quantum state. Shape: (total_dim, total_dim)."""
        assert rho.shape == (self.total_dim, self.total_dim), \
            f"Expected shape ({self.total_dim}, {self.total_dim}), got {rho.shape}"
        self.rho = rho
        self.metric = None  # Invalidate cached metric

    def set_product_state(self, single_qubit_states: List[np.ndarray]):
        """Set a product (unentangled) state — maximum metric distance."""
        rho = single_qubit_states[0]
        for state in single_qubit_states[1:]:
            rho = np.kron(rho, state)
        self.set_state(rho)

    def partial_trace(self, keep: List[int]) -> np.ndarray:
        """
        Trace out all subsystems except those in `keep`.
        Returns reduced density matrix on the kept subsystems.
        """
        d = self.local_dim
        n = self.n_nodes
        trace_out = [i for i in range(n) if i not in sorted(keep)]

        rho = self.rho.reshape([d] * (2 * n))

        # Trace out each subsystem not in keep (iterate in reverse to preserve indices)
        for sys in sorted(trace_out, reverse=True):
            # Contract index sys with its copy (sys + n)
            rho = np.trace(rho, axis1=sys, axis2=sys + rho.ndim // 2)

        kept_dim = d ** len(keep)
        return rho.reshape(kept_dim, kept_dim)

    def von_neumann_entropy(self, subsystem: List[int]) -> float:
        """
        S(A) = -Tr(rho_A log rho_A)

        The fundamental measure of entanglement in QIG.
        In the RT formula: S_A = Area(gamma_A) / 4G_N
        """
        rho_A = self.partial_trace(subsystem)
        eigenvalues = np.linalg.eigvalsh(rho_A)
        eigenvalues = eigenvalues[eigenvalues > 1e-12]  # numerical zero cutoff
        return float(-np.sum(eigenvalues * np.log2(eigenvalues)))

    def mutual_information(self, i: int, j: int) -> float:
        """
        I(Q_i : Q_j) = S(Q_i) + S(Q_j) - S(Q_i ∪ Q_j)

        This IS the metric in QIG:
          - High mutual info → small distance (close in information space)
          - Zero mutual info → infinite distance (disconnected geometry)

        Physical meaning: how much knowing Q_i reduces uncertainty about Q_j.
        """
        S_i = self.von_neumann_entropy([i])
        S_j = self.von_neumann_entropy([j])
        S_ij = self.von_neumann_entropy([i, j])
        return float(max(0.0, S_i + S_j - S_ij))

    def metric_distance(self, i: int, j: int, epsilon: float = 1e-6) -> float:
        """
        d_QIG(i, j) = 1 / (I(Q_i : Q_j) + epsilon)

        The emergent metric distance. Small mutual information = large distance.
        This is the Gromov-Hausdorff metric that converges to the Riemannian
        metric in the continuum limit (N → ∞).

        epsilon prevents division by zero for unentangled subsystems.
        """
        mi = self.mutual_information(i, j)
        return 1.0 / (mi + epsilon)

    def compute_metric(self) -> np.ndarray:
        """
        Compute the full n×n metric distance matrix.
        This IS the spatial geometry — not assumed, but derived.
        """
        # FIX: Add MI threshold filter - only compute distances for entangled pairs
        MI_THRESHOLD = 1e-6  # filter out product state distances
        
        n = self.n_nodes
        D = np.zeros((n, n))
        
        # Initialize distances to infinity for disconnected pairs
        D[:] = np.inf
        np.fill_diagonal(D, 0.0)
        
        for i in range(n):
            for j in range(i + 1, n):
                mi = self.mutual_information(i, j)
                if mi > MI_THRESHOLD:  # only compute distance for entangled pairs
                    d = self.metric_distance(i, j)
                    D[i, j] = d
                    D[j, i] = d
                    # Update graph edge weights if edge exists
                    if self.graph.has_edge(i, j):
                        self.graph[i][j]['weight'] = d
                        self.graph[i][j]['mutual_info'] = mi
        self.metric = D

        return D

    def _build_graph_structure(self):
        """Build the underlying networkx graph with edges only for entangled pairs."""
        # FIX: Add MI threshold filter - only add edges with real entanglement
        MI_THRESHOLD = 1e-6  # filter out product state distances
        
        self.graph.add_nodes_from(range(self.n_nodes))
        for i in range(self.n_nodes):
            for j in range(i + 1, self.n_nodes):
                mi = self.mutual_information(i, j)
                if mi > MI_THRESHOLD:  # only add edges with real entanglement
                    self.graph.add_edge(i, j, weight=1.0, mutual_info=mi)
                # zero-MI pairs simply don't get an edge — no 10^6 distance edges

    def geodesic_distance(self, i: int, j: int) -> float:
        """Shortest path distance in the QIG metric (graph geodesic)."""
        if self.metric is None:
            self.compute_metric()
        try:
            return nx.shortest_path_length(self.graph, i, j, weight='weight')
        except nx.NetworkXNoPath:
            return float('inf')

    def embed_geometry(self) -> np.ndarray:
        """
        Embed the QIG metric into 2D Euclidean space using MDS.
        Returns array of shape (n_nodes, 2) — the emergent spatial positions.

        This is the classical shadow of the full quantum geometry.
        """
        from sklearn.manifold import MDS
        if self.metric is None:
            self.compute_metric()

        mds = MDS(n_components=2, dissimilarity='precomputed',
                  random_state=42, normalized_stress='auto')
        positions = mds.fit_transform(self.metric)

        for i, node in enumerate(self.nodes):
            node.position = positions[i]

        return positions

    def entanglement_entropy_profile(self) -> Dict[str, float]:
        """
        Compute entanglement entropy for all single-node subsystems.
        High entropy → node is highly entangled with the rest.
        In the RT formula, this contributes to boundary area.
        """
        return {
            f"S(Q{i})": self.von_neumann_entropy([i])
            for i in range(self.n_nodes)
        }

    def total_entanglement(self) -> float:
        """
        Total entanglement across all pairs — a scalar measure of
        how 'curved' the emergent geometry is.

        More entanglement = richer geometry = more spacetime connectivity.
        Less entanglement = flatter geometry = disconnected spacetime regions.
        (cf. Van Raamsdonk: disentangle the CFT → the bulk falls apart)
        """
        total = 0.0
        for i in range(self.n_nodes):
            for j in range(i + 1, self.n_nodes):
                total += self.mutual_information(i, j)
        return total

    def summary(self) -> str:
        """Print a summary of the QIG state."""
        if self.metric is None:
            self.compute_metric()

        lines = [
            f"QIG Summary: {self.n_nodes} nodes, local_dim={self.local_dim}",
            f"Total Hilbert space dimension: {self.total_dim}",
            f"Total entanglement (geometry richness): {self.total_entanglement():.4f}",
            "",
            "Entanglement entropy per node (boundary area contribution):",
        ]
        for label, entropy in self.entanglement_entropy_profile().items():
            lines.append(f"  {label} = {entropy:.4f} bits")

        lines += [
            "",
            "Metric distance matrix (distance = 1/mutual_info):",
            np.array2string(self.metric, precision=2, suppress_small=True)
        ]
        return "\n".join(lines)


def maximally_entangled_state(n: int, d: int = 2) -> np.ndarray:
    """
    Create a GHZ-like maximally entangled state for n qudits.
    Maximum entanglement → minimum QIG metric distances → maximum geometry richness.
    """
    total_dim = d ** n
    # GHZ state: (|00...0> + |11...1> + ... + |dd...d>) / sqrt(d)
    psi = np.zeros(total_dim, dtype=complex)
    for k in range(d):
        idx = sum(k * d**i for i in range(n))
        psi[idx] = 1.0 / np.sqrt(d)
    return np.outer(psi, psi.conj())


def product_state(n: int, d: int = 2) -> np.ndarray:
    """
    Create a product (unentangled) state.
    Zero entanglement → infinite QIG distances → disconnected geometry.
    Demonstrates Van Raamsdonk: remove entanglement, spacetime falls apart.
    """
    single = np.zeros((d, d), dtype=complex)
    single[0, 0] = 1.0
    rho = single
    for _ in range(n - 1):
        rho = np.kron(rho, single)
    return rho
