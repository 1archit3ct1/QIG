#!/usr/bin/env python3
"""
demo_geometry.py — Watch spatial geometry emerge from entanglement.

Demonstrates the core QIG thesis:
  SPATIAL DISTANCE = 1 / MUTUAL INFORMATION

Starting from a product state (no entanglement):
  - All distances are infinite → disconnected geometry

Progressively entangling subsystems:
  - Distances shrink as entanglement grows
  - Geometry 'crystallizes' from quantum correlations

This is Van Raamsdonk's insight made computational:
  - Build up spacetime with quantum entanglement
  - Disentangle = spacetime falls apart
"""

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import numpy as np
from core.qig_graph import QIGGraph, maximally_entangled_state, product_state
from core.entanglement import area_law_check, page_curve


def demo_geometry():
    print("=" * 70)
    print("DEMO 1: SPATIAL GEOMETRY EMERGING FROM ENTANGLEMENT")
    print("=" * 70)
    print()
    print("QIG Thesis: distance(i,j) = 1 / mutual_information(Q_i, Q_j)")
    print("More entanglement = closer in geometry = richer spacetime")
    print()

    n = 4  # 4-qubit system

    # ── Phase 1: Product state (no entanglement) ──
    print("─" * 50)
    print("Phase 1: PRODUCT STATE (zero entanglement)")
    print("Van Raamsdonk: 'Disentangle the CFT → spacetime tears apart'")
    print("─" * 50)

    graph = QIGGraph(n_nodes=n, local_dim=2)
    graph.set_state(product_state(n))
    metric = graph.compute_metric()

    print(f"Total entanglement: {graph.total_entanglement():.6f}")
    print("Pairwise distances (large = far apart = disconnected geometry):")
    for i in range(n):
        for j in range(i+1, n):
            mi = graph.mutual_information(i, j)
            d = graph.metric_distance(i, j)
            print(f"  QUANTUM_NODE: Q{i}↔Q{j} mutual_info={mi:.6f} distance={d:.2f}")

    print()

    # ── Phase 2: Bell pairs (partial entanglement) ──
    print("─" * 50)
    print("Phase 2: BELL PAIRS (partial entanglement)")
    print("─" * 50)

    # Create Bell pairs: (Q0,Q1) and (Q2,Q3)
    bell = np.array([1, 0, 0, 1], dtype=complex) / np.sqrt(2)
    rho_bell = np.outer(bell, bell.conj())
    rho_4 = np.kron(rho_bell, rho_bell)
    graph.set_state(rho_4)
    metric = graph.compute_metric()

    print(f"SCALAR_METRIC: total_entanglement={graph.total_entanglement():.4f}")
    for i in range(n):
        for j in range(i+1, n):
            mi = graph.mutual_information(i, j)
            d = graph.metric_distance(i, j)
            nearby = "★ CLOSE (entangled)" if mi > 0.5 else "  far"
            print(f"  QUANTUM_NODE: Q{i}↔Q{j} mutual_info={mi:.4f} distance={d:.4f}  {nearby}")

    print()

    # ── Phase 3: GHZ state (maximal entanglement) ──
    print("─" * 50)
    print("Phase 3: GHZ STATE (maximal entanglement)")
    print("'Build up spacetime with quantum entanglement'")
    print("─" * 50)

    graph.set_state(maximally_entangled_state(n, d=2))
    metric = graph.compute_metric()

    print(f"SCALAR_METRIC: total_entanglement={graph.total_entanglement():.4f}")
    for i in range(n):
        for j in range(i+1, n):
            mi = graph.mutual_information(i, j)
            d = graph.metric_distance(i, j)
            print(f"  QUANTUM_NODE: Q{i}↔Q{j} mutual_info={mi:.4f} distance={d:.4f}")

    print()
    print(graph.summary())
    print()

    # ── Area law check ──
    print("─" * 50)
    print("AREA LAW CHECK (required for tensor network / QIG representation)")
    print("─" * 50)

    for label, rho in [("Product", product_state(n)),
                        ("GHZ", maximally_entangled_state(n, d=2))]:
        graph.set_state(rho)
        entropies, verdict = area_law_check(rho, n, 2)
        print(f"\n{label} state:")
        print(f"  Entropy profile: {[f'{s:.3f}' for s in entropies]}")
        print(f"  {verdict}")

    print()

    # ── Page curve ──
    print("─" * 50)
    print("PAGE CURVE SIMULATION")
    print("Entropy of radiation subsystem during black hole evaporation")
    print("Information IS preserved (unitarity). Island formula recovers it.")
    print("─" * 50)

    times, entropies = page_curve(n_qubits=6, t_steps=80)
    peak_t = times[entropies.index(max(entropies))]
    peak_S = max(entropies)
    final_S = entropies[-1]

    print(f"SCALAR_METRIC: page_time={peak_t}")
    print(f"SCALAR_METRIC: peak_entropy={peak_S:.4f}")
    print(f"SCALAR_METRIC: final_entropy={final_S:.4f}")
    print(f"Information recovery: {'YES ✓' if final_S < peak_S * 0.8 else 'PARTIAL'}")

    # ASCII plot
    print("\nPage curve (entropy of radiation vs time):")
    max_S = max(entropies) + 0.01
    for i in range(0, len(times), len(times)//20):
        t = times[i]
        S = entropies[i]
        bar_len = int(S / max_S * 40)
        bar = "█" * bar_len
        print(f"  QUANTUM_NODE: t={t:3d} entropy={S:.3f}")

    print("\n✓ DEMO 1 COMPLETE: Geometry emerges from entanglement.")


if __name__ == "__main__":
    demo_geometry()
