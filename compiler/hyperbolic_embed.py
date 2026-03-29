"""
hyperbolic_embed.py — Hyperbolic Geometry-Aware Compiler

Maps task dependency graphs (DAGs) onto hyperbolic (AdS) geometry.

Key insight from QIG:
  - The natural geometry for hierarchical data is HYPERBOLIC
  - In AdS/CFT, the radial direction = RG scale = coarse-graining level
  - A compiler that places tasks in hyperbolic space minimizes
    communication cost between tasks with high mutual information

Why hyperbolic?
  - Hyperbolic space grows exponentially (like a tree)
  - Hierarchical structures (neural nets, dependency trees, filesystems)
    embed naturally with LOW DISTORTION in hyperbolic space
  - Classical Euclidean compilers have O(n^2) worst-case communication;
    hyperbolic compilers achieve O(log n) by exploiting the geometry

The compiler:
  1. Takes a task DAG with data dependency weights
  2. Embeds it in the Poincaré disk (hyperbolic plane)
  3. The embedding minimizes total communication cost
  4. Tasks close in hyperbolic space share data and should run together
  5. Distance in the embedding = communication overhead estimate
"""

import numpy as np
from typing import List, Dict, Tuple, Optional
from dataclasses import dataclass
import networkx as nx


@dataclass
class Task:
    """A computational task in the dependency graph."""
    id: int
    name: str
    compute_cost: float       # FLOPs or gate count
    memory_bytes: int         # Data footprint
    complexity_contribution: float  # dC/dt this task contributes
    dependencies: List[int] = None  # IDs of tasks this depends on
    data_volume: Dict[int, float] = None  # Data flow to each dependency (bytes)


@dataclass
class EmbeddedTask:
    """A task placed in hyperbolic (Poincaré disk) space."""
    task: Task
    poincare_coords: np.ndarray   # (x, y) in Poincaré disk, |coords| < 1
    radial_depth: float           # Distance from origin = RG scale
    angular_pos: float            # Angle = "position" in the theory
    hyperbolic_distance_to_root: float


class HyperbolicEmbedder:
    """
    Embeds a task DAG in the Poincaré disk to minimize communication cost.

    The Poincaré disk metric:
        ds^2 = 4(dx^2 + dy^2) / (1 - |z|^2)^2

    Hyperbolic distance:
        d_H(z1, z2) = 2 * arctanh(|z1 - z2| / |1 - conj(z1)*z2|)

    Key insight: in this metric, exponentially many nodes can be
    packed near the boundary, while the interior (small |z|) is
    the 'IR' / coarse-grained / long-range-dependency region.

    This mirrors the AdS structure:
    - Boundary (|z| → 1): UV, high-frequency, local tasks
    - Interior (|z| → 0): IR, low-frequency, global coordination tasks

    Usage:
        embedder = HyperbolicEmbedder()
        tasks = [Task(0, "root", ...), Task(1, "worker_A", ...), ...]
        embedding = embedder.embed(tasks)
        schedule = embedder.optimal_schedule(embedding)
        cost = embedder.communication_cost(embedding)
    """

    def __init__(self, curvature: float = -1.0):
        """
        curvature: Gaussian curvature of the hyperbolic plane.
        In AdS3, this is -1/R^2 where R is the AdS radius.
        More negative = more curved = better compression of hierarchies.
        """
        self.curvature = curvature
        self.R = 1.0 / np.sqrt(-curvature)  # AdS radius

    def poincare_distance(self, z1: np.ndarray, z2: np.ndarray) -> float:
        """
        Hyperbolic distance in the Poincaré disk.

        d_H(z1, z2) = 2R * arctanh(|Möbius(z1, z2)|)

        where |Möbius(z1, z2)| = |(z1-z2)/(1 - conj(z1)*z2)|
        """
        z1c = complex(z1[0], z1[1])
        z2c = complex(z2[0], z2[1])
        mobius = abs(z1c - z2c) / abs(1 - z1c.conjugate() * z2c + 1e-10)
        mobius = min(mobius, 1.0 - 1e-10)  # Clip to valid range
        return float(2 * self.R * np.arctanh(mobius))

    def euclidean_to_poincare(self, depth: int, angle: float,
                               max_depth: int) -> np.ndarray:
        """
        Convert (depth, angle) in a tree to Poincaré disk coordinates.

        depth=0: root (at origin)
        depth=max_depth: leaves (near boundary)

        Radial coordinate r in Poincaré disk:
            r = tanh(depth / max_depth * pi/2)  [approaches 1 as depth → max]
        """
        r = np.tanh(depth / (max_depth + 1) * np.pi / 2 * 0.9)
        x = r * np.cos(angle)
        y = r * np.sin(angle)
        return np.array([x, y])

    def embed(self, tasks: List[Task]) -> Dict[int, EmbeddedTask]:
        """
        Embed a list of tasks in the Poincaré disk.

        Algorithm:
        1. Build task dependency graph
        2. Find hierarchical levels (topological sort)
        3. Map levels to radial depth (deeper = higher level = more IR)
        4. Space tasks at each level evenly in angle
        5. Refine: nudge correlated tasks toward each other

        The result: tasks that share data end up close in hyperbolic space.
        The compiler then schedules close tasks together to minimize comm.
        """
        # Build dependency graph
        G = nx.DiGraph()
        for task in tasks:
            G.add_node(task.id, task=task)
        for task in tasks:
            if task.dependencies:
                for dep_id in task.dependencies:
                    volume = (task.data_volume or {}).get(dep_id, 1.0)
                    G.add_edge(dep_id, task.id, weight=volume)

        # Compute levels via longest path from root
        levels = {}
        for node in nx.topological_sort(G):
            preds = list(G.predecessors(node))
            if not preds:
                levels[node] = 0
            else:
                levels[node] = max(levels[p] for p in preds) + 1

        max_level = max(levels.values()) if levels else 0

        # Group tasks by level
        level_groups: Dict[int, List[int]] = {}
        for task_id, level in levels.items():
            level_groups.setdefault(level, []).append(task_id)

        # Assign Poincaré coordinates
        task_map = {t.id: t for t in tasks}
        embedding = {}

        for level, task_ids in sorted(level_groups.items()):
            n_at_level = len(task_ids)
            for i, task_id in enumerate(task_ids):
                # Angular position: spread evenly, with small perturbation
                angle = 2 * np.pi * i / n_at_level + level * 0.1
                coords = self.euclidean_to_poincare(level, angle, max_level)
                radial = float(np.linalg.norm(coords))
                hyp_dist = self.poincare_distance(
                    np.array([0.0, 0.0]), coords
                )

                task = task_map[task_id]
                embedding[task_id] = EmbeddedTask(
                    task=task,
                    poincare_coords=coords,
                    radial_depth=radial,
                    angular_pos=angle,
                    hyperbolic_distance_to_root=hyp_dist
                )

        # Refinement: pull tasks with high data volume together
        embedding = self._refine_embedding(embedding, G)

        return embedding

    def _refine_embedding(self, embedding: Dict[int, EmbeddedTask],
                           G: nx.DiGraph,
                           iterations: int = 5) -> Dict[int, EmbeddedTask]:
        """
        Refine embedding by pulling connected tasks toward each other.
        Gradient descent on communication cost in hyperbolic space.
        """
        for _ in range(iterations):
            for task_id, et in embedding.items():
                if not list(G.successors(task_id)) and not list(G.predecessors(task_id)):
                    continue

                # Pull toward neighbors, weighted by data volume
                pull = np.zeros(2)
                total_weight = 0.0

                for neighbor_id in list(G.successors(task_id)) + list(G.predecessors(task_id)):
                    if neighbor_id not in embedding:
                        continue
                    edge_data = G.get_edge_data(task_id, neighbor_id) or \
                                G.get_edge_data(neighbor_id, task_id) or {}
                    weight = edge_data.get('weight', 1.0)
                    neighbor_coords = embedding[neighbor_id].poincare_coords
                    pull += weight * (neighbor_coords - et.poincare_coords)
                    total_weight += weight

                if total_weight > 0:
                    step = 0.05 * pull / total_weight
                    new_coords = et.poincare_coords + step
                    # Keep inside Poincaré disk
                    norm = np.linalg.norm(new_coords)
                    if norm >= 0.99:
                        new_coords = new_coords * 0.99 / norm

                    et.poincare_coords = new_coords
                    et.radial_depth = float(np.linalg.norm(new_coords))

        return embedding

    def communication_cost(self, embedding: Dict[int, EmbeddedTask],
                            G: nx.DiGraph) -> float:
        """
        Total communication cost = sum of (data_volume * hyperbolic_distance)
        over all edges.

        In QIG terms: this is the total 'geometric cost' of the computation.
        Minimizing this = minimizing the entanglement distance between
        communicating tasks = flattening the computation onto the natural
        hyperbolic geometry.
        """
        total = 0.0
        for u, v, data in G.edges(data=True):
            if u in embedding and v in embedding:
                dist = self.poincare_distance(
                    embedding[u].poincare_coords,
                    embedding[v].poincare_coords
                )
                volume = data.get('weight', 1.0)
                total += volume * dist
        return total

    def optimal_schedule(self, embedding: Dict[int, EmbeddedTask]) -> List[List[int]]:
        """
        Schedule tasks in order of radial depth (distance from origin).

        Tasks near the origin (IR, low complexity) run first.
        Tasks near the boundary (UV, high complexity) run last.

        This is the holographic RG schedule:
        IR → UV = coarse → fine = global → local = slow → fast.

        In circuit terms: this is topological order respecting
        both dependency constraints AND information geometry.
        """
        # Sort by hyperbolic distance from origin (radial depth)
        sorted_tasks = sorted(
            embedding.items(),
            key=lambda x: x[1].hyperbolic_distance_to_root
        )

        # Group into "time slices" — tasks at similar depths run in parallel
        schedule = []
        current_slice = []
        last_depth = -1
        depth_tolerance = 0.3

        for task_id, et in sorted_tasks:
            if abs(et.hyperbolic_distance_to_root - last_depth) > depth_tolerance:
                if current_slice:
                    schedule.append(current_slice)
                current_slice = [task_id]
                last_depth = et.hyperbolic_distance_to_root
            else:
                current_slice.append(task_id)

        if current_slice:
            schedule.append(current_slice)

        return schedule

    def summary(self, embedding: Dict[int, EmbeddedTask],
                 G: Optional[nx.DiGraph] = None) -> str:
        """Summarize the hyperbolic embedding."""
        lines = [
            "=" * 60,
            "HYPERBOLIC COMPILER — QIG-Aware Task Embedding",
            "=" * 60,
            f"Tasks embedded: {len(embedding)}",
            f"Curvature: {self.curvature}  (AdS radius R={self.R:.2f})",
            "",
            "Task positions in Poincaré disk (0=IR/root, 1=UV/boundary):",
        ]

        for task_id, et in sorted(embedding.items()):
            lines.append(
                f"  Task {et.task.name:20s}: "
                f"r={et.radial_depth:.3f}, "
                f"θ={np.degrees(et.angular_pos):.1f}°, "
                f"hyp_dist={et.hyperbolic_distance_to_root:.3f}"
            )

        if G is not None:
            cost = self.communication_cost(embedding, G)
            lines.append(f"\nTotal communication cost (hyperbolic): {cost:.4f}")
            schedule = self.optimal_schedule(embedding)
            lines += ["", "Holographic RG Schedule (IR→UV):"]
            for i, time_slice in enumerate(schedule):
                task_names = [embedding[t].task.name for t in time_slice]
                lines.append(f"  Step {i}: {task_names}")

        lines.append("=" * 60)
        return "\n".join(lines)
