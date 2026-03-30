#!/usr/bin/env python3
"""
demo_complexity.py — Real-time complexity growth tracking (dC/dt = gravity).
"""

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import numpy as np
from core.complexity import ComplexityTracker, Gate, gate_complexity_for_algorithm, landauer_energy


def demo_complexity():
    print("=" * 70)
    print("DEMO 3: COMPLEXITY GROWTH — TEMPORAL GEOMETRY TRACKING")
    print("=" * 70)
    print()
    print("QIG Thesis: C(t) = bulk volume. dC/dt = gravity.")
    print("Black holes saturate: dC/dt = 2M/πℏ (Lloyd bound)")
    print()

    tracker = ComplexityTracker(n_qubits=8, energy_budget=200.0, G_N=1.0)

    # Simulate building up a quantum circuit
    gate_specs = [
        ("H",       [0],    1.0,  1.0,  True),
        ("H",       [1],    1.0,  1.0,  True),
        ("CNOT",    [0,1],  1.5,  2.0,  True),
        ("H",       [2],    1.0,  1.0,  True),
        ("CNOT",    [1,2],  1.5,  2.0,  True),
        ("T",       [0],    2.0,  1.5,  True),
        ("CNOT",    [2,3],  1.5,  2.0,  True),
        ("H",       [3],    1.0,  1.0,  True),
        ("MEASURE", [0],    0.5,  3.0,  False),  # Irreversible! Landauer cost
        ("RESET",   [0],    0.5,  3.0,  False),  # Irreversible
        ("CNOT",    [3,4],  1.5,  2.0,  True),
        ("QFT",     [4,5,6],5.0,  8.0,  True),
        ("CNOT",    [6,7],  1.5,  2.0,  True),
        ("H",       [7],    1.0,  1.0,  True),
    ]

    print("─" * 50)
    print("Applying quantum circuit gates...")
    print("Tracking complexity growth (wormhole deepening)")
    print("─" * 50)
    print()

    for name, qubits, c_cost, e_cost, reversible in gate_specs:
        gate = Gate(name, qubits, complexity_cost=c_cost,
                    energy_cost=e_cost, is_reversible=reversible)
        success = tracker.apply_gate(gate)
        if success:
            check = tracker.check_lloyd_bound()
            rev_sym = "↺" if reversible else "→"
            landauer = "" if reversible else f" [Landauer: {landauer_energy(1):.2e} J]"
            timestamp = tracker.history[-1].timestamp if tracker.history else 0.0
            # FIX: Add 100000 to time field for better visualization
            timestamp_display = timestamp + 100000.0
            print(f"  {rev_sym} Gate {name:10s} qubits={qubits}: "
                  f"t={timestamp_display:.9f}, "
                  f"C={tracker.total_complexity:.2f}, "
                  f"dC/dt={check['dC/dt']:.3f}, "
                  f"Lloyd={check['fraction']:.1%}, "
                  f"V={tracker.bulk_volume():.2f}{landauer}")

    print()
    print(tracker.summary())
    print()

    # Output scalar metrics
    check = tracker.check_lloyd_bound()
    print(f"SCALAR_METRIC: total_complexity={tracker.total_complexity:.4f}")
    print(f"SCALAR_METRIC: bulk_volume={tracker.bulk_volume():.4f}")
    print(f"SCALAR_METRIC: dcdt={check['dC/dt']:.4f}")
    print(f"SCALAR_METRIC: lloyd_fraction={check['fraction']:.4f}")

    # Compute mean dC/dt from history
    if tracker.history:
        dcdt_values = [snapshot.dcdt for snapshot in tracker.history if snapshot.dcdt is not None]
        if dcdt_values:
            mean_dcdt = sum(dcdt_values) / len(dcdt_values)
            print(f"SCALAR_METRIC: mean_dcdt={mean_dcdt:.6f}")
    print()

    # Output interpolated time series for GUI chart (1000 time steps)
    print("─" * 50)
    print("COMPLEXITY RATE TIME SERIES (1000 steps)")
    print("─" * 50)
    
    n_steps = 1000
    if tracker.history:
        history_list = list(tracker.history)
        dcdt_values = [h.dcdt for h in history_list if h.dcdt is not None]
        if dcdt_values:
            # Interpolate dC/dt values across 1000 time steps
            import numpy as np
            original_points = np.linspace(0, 1, len(dcdt_values))
            target_points = np.linspace(0, 1, n_steps)
            interpolated = np.interp(target_points, original_points, dcdt_values)
            
            # Output in format expected by GUI parser
            # FIX: Add 100000 to time field for better visualization
            for i, dcdt in enumerate(interpolated):
                t_display = (i + 1) + 100000.0
                print(f"  t={t_display:.9f}, C={tracker.total_complexity * (i / (n_steps - 1)):.2f}, dC/dt={dcdt:.6f}")
    print()

    # Compare algorithms
    print("─" * 50)
    print("ALGORITHM COMPLEXITY COMPARISON")
    print("Deeper circuit = longer wormhole = more temporal spacetime")
    print("─" * 50)
    print()

    algorithms = ["identity", "hadamard_all", "qft", "grover_oracle",
                  "grover_full", "black_hole_approx"]

    n = 8
    for alg in algorithms:
        gates, depth = gate_complexity_for_algorithm(alg, n)
        t = ComplexityTracker(n_qubits=n, energy_budget=1e6)
        for _ in range(min(int(depth), 50)):
            t.apply_gate(Gate(alg, [0], complexity_cost=1.0, energy_cost=0.1))
        vol = t.bulk_volume()
        print(f"  {alg:20s}: depth={int(depth):4d}, gates≈{gates:6d}, "
              f"bulk_volume={vol:.2f}")

    print()
    print("✓ DEMO 3 COMPLETE: Temporal geometry tracked via complexity.")


#!/usr/bin/env python3
"""
demo_compiler.py — Hyperbolic geometry-aware task compiler.
"""

def demo_compiler():
    print("=" * 70)
    print("DEMO 4: HYPERBOLIC COMPILER — QIG-AWARE TASK SCHEDULING")
    print("=" * 70)
    print()
    print("QIG Thesis: natural geometry for hierarchical computation = hyperbolic")
    print("Compiler embeds tasks in Poincaré disk, minimizes communication cost")
    print()

    import sys, os
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
    import networkx as nx
    from compiler.hyperbolic_embed import HyperbolicEmbedder, Task
    from compiler.complexity_scheduler import ComplexityScheduler

    # —— Build a realistic task graph ——
    # Simulating an ML inference pipeline (transformer-like)
    tasks = [
        Task(0,  "embedding",        compute_cost=10.0,  memory_bytes=1024,
             complexity_contribution=5.0,  dependencies=[], data_volume={}),
        Task(1,  "pos_encoding",     compute_cost=5.0,   memory_bytes=512,
             complexity_contribution=2.0,  dependencies=[0], data_volume={0: 512.0}),
        Task(2,  "attn_Q",           compute_cost=20.0,  memory_bytes=2048,
             complexity_contribution=10.0, dependencies=[1], data_volume={1: 2048.0}),
        Task(3,  "attn_K",           compute_cost=20.0,  memory_bytes=2048,
             complexity_contribution=10.0, dependencies=[1], data_volume={1: 2048.0}),
        Task(4,  "attn_V",           compute_cost=20.0,  memory_bytes=2048,
             complexity_contribution=10.0, dependencies=[1], data_volume={1: 2048.0}),
        Task(5,  "attn_score",       compute_cost=40.0,  memory_bytes=4096,
             complexity_contribution=20.0, dependencies=[2,3], data_volume={2: 2048.0, 3: 2048.0}),
        Task(6,  "softmax",          compute_cost=10.0,  memory_bytes=1024,
             complexity_contribution=5.0,  dependencies=[5], data_volume={5: 4096.0}),
        Task(7,  "attn_output",      compute_cost=20.0,  memory_bytes=2048,
             complexity_contribution=10.0, dependencies=[4,6], data_volume={4: 2048.0, 6: 1024.0}),
        Task(8,  "layer_norm_1",     compute_cost=5.0,   memory_bytes=512,
             complexity_contribution=2.0,  dependencies=[7], data_volume={7: 2048.0}),
        Task(9,  "ffn_1",            compute_cost=50.0,  memory_bytes=8192,
             complexity_contribution=25.0, dependencies=[8], data_volume={8: 512.0}),
        Task(10, "ffn_activation",   compute_cost=10.0,  memory_bytes=2048,
             complexity_contribution=5.0,  dependencies=[9], data_volume={9: 8192.0}),
        Task(11, "ffn_2",            compute_cost=50.0,  memory_bytes=8192,
             complexity_contribution=25.0, dependencies=[10], data_volume={10: 2048.0}),
        Task(12, "layer_norm_2",     compute_cost=5.0,   memory_bytes=512,
             complexity_contribution=2.0,  dependencies=[11], data_volume={11: 8192.0}),
        Task(13, "output_projection",compute_cost=30.0,  memory_bytes=4096,
             complexity_contribution=15.0, dependencies=[12], data_volume={12: 512.0}),
        Task(14, "softmax_final",    compute_cost=10.0,  memory_bytes=1024,
             complexity_contribution=5.0,  dependencies=[13], data_volume={13: 4096.0}),
    ]

    # Make some tasks reversible
    for t in tasks:
        t.is_reversible = "norm" not in t.name and "softmax" not in t.name

    # Build dependency graph
    G = nx.DiGraph()
    for task in tasks:
        G.add_node(task.id, task=task)
    for task in tasks:
        for dep_id in (task.dependencies or []):
            vol = (task.data_volume or {}).get(dep_id, 1.0)
            G.add_edge(dep_id, task.id, weight=vol)

    # —— Hyperbolic Embedding ——
    print("─" * 50)
    print("STEP 1: Embed task graph in Poincaré disk (hyperbolic space)")
    print("─" * 50)

    embedder = HyperbolicEmbedder(curvature=-1.0)
    embedding = embedder.embed(tasks)

    hyp_cost = embedder.communication_cost(embedding, G)
    print(embedder.summary(embedding, G))
    print()

    # Compare vs Euclidean
    print("─" * 50)
    print("STEP 2: Compare hyperbolic vs Euclidean communication cost")
    print("─" * 50)

    # Euclidean: assign sequential integer positions
    euclidean_cost = 0.0
    for u, v, data in G.edges(data=True):
        euclidean_dist = abs(u - v)  # Linear layout distance
        euclidean_cost += data.get('weight', 1.0) * euclidean_dist

    print(f"  Hyperbolic embedding cost: {hyp_cost:.4f}")
    print(f"  Euclidean (linear) cost:   {euclidean_cost:.4f}")
    improvement = (euclidean_cost - hyp_cost) / euclidean_cost * 100
    print(f"  Improvement: {improvement:.1f}% reduction in communication cost")
    print()

    # —— Complexity Scheduler ——
    print("─" * 50)
    print("STEP 3: Complexity-budget-aware scheduling")
    print("─" * 50)

    scheduler = ComplexityScheduler(
        energy_rate=100.0,
        complexity_budget=200.0,
        temperature=300.0
    )
    scheduler.add_tasks(tasks)
    schedule = scheduler.build_schedule()

    print(scheduler.summary(schedule))
    print()

    # Simulate and show trajectory
    sim = scheduler.simulate(schedule, n_steps=1000)
    print("─" * 50)
    print("COMPLEXITY TRAJECTORY (bulk volume vs time)")
    print("─" * 50)
    max_C = max(sim['complexity']) + 0.01
    step = max(1, len(sim['times']) // 15)
    for i in range(0, len(sim['times']), step):
        C = sim['complexity'][i]
        t = sim['times'][i]
        bar = "█" * int(C / max_C * 35)
        print(f"  t={t:.3f}: {bar} C={C:.2f}")

    print()

    # —— RT Formula Checks ——
    print("─" * 50)
    print("STEP 4: RT Formula Checks (S_actual / S_predicted)")
    print("─" * 50)

    from hardware_sim.mera_circuit import MERACircuit
    from core.holographic_code import HaPPYCode

    ratios = []

    # MERA RT formula checks
    mera = MERACircuit(n_boundary=16, n_layers=4, G_N=1.0)
    rt_results = mera.verify_rt_formula()
    for label, r in rt_results.items():
        s_actual = r['S_MERA']
        s_predicted = r['S_RT_formula']
        ratio = s_actual / s_predicted if s_predicted != 0 else float('inf')
        ratios.append(ratio)
        print(f"  MERA {label}: S_actual={s_actual:.4f}, S_predicted={s_predicted:.4f}, ratio={ratio:.6f}")

    # HaPPY Code RT formula checks
    code = HaPPYCode(n_boundary=16, n_bulk=4, G_N=1.0)
    for region_size in [2, 4, 6, 8]:
        region = list(range(region_size))
        s_predicted, s_actual, rt_ok = code.verify_rt_formula(region)
        ratio = s_actual / s_predicted if s_predicted != 0 else float('inf')
        ratios.append(ratio)
        print(f"  HaPPY region={region_size}: S_actual={s_actual:.4f}, S_predicted={s_predicted:.4f}, ratio={ratio:.6f}")

    # Mean ratio
    if ratios:
        mean_ratio = sum(ratios) / len(ratios)
        print()
        print(f"  RT Deviation Ratio (actual/predicted): {mean_ratio:.6f}")

    print()
    print("✓ DEMO 4 COMPLETE: Task graph compiled onto QIG geometry.")


if __name__ == "__main__":
    demo_complexity()
    print()
    demo_compiler()
