# QIG Stack — Quantum Information Geometry Computing Framework

A proof-of-concept software stack implementing the architectural principles
derived from the Quantum Information Graph (QIG) hypothesis.

## Core Thesis

> Spacetime is the geometric shadow of a quantum computation.
> Spatial distance = mutual information. Volume = complexity. Gravity = dC/dt.

This stack operationalizes that dictionary for classical and hybrid systems.

---

## Stack Layout

```
qig_stack/
├── core/
│   ├── qig_graph.py           # Quantum Information Graph: nodes, edges, entanglement metric
│   ├── entanglement.py        # Mutual information, von Neumann entropy, entanglement graph
│   ├── complexity.py          # Circuit complexity tracking, Lloyd bound, dC/dt
│   └── holographic_code.py    # Toy holographic error-correcting code (HaPPY-inspired)
│
├── compiler/
│   ├── geometry_compiler.py   # Maps task DAGs onto QIG metric space
│   ├── complexity_scheduler.py# Complexity-budget-aware task scheduler
│   └── hyperbolic_embed.py    # Embeds dependency graphs in hyperbolic (AdS) geometry
│
├── runtime/
│   ├── qig_os.py              # QIG-inspired OS: processes as quantum states
│   ├── complexity_tracker.py  # Runtime complexity resource manager
│   └── holographic_memory.py  # Memory system where distance = code distance
│
├── hardware_sim/
│   ├── tensor_network_proc.py # Tensor Network Processor (TNP) simulator
│   ├── mera_circuit.py        # MERA circuit: builds holographic bulk from boundary
│   └── reversible_fabric.py   # Reversible computing fabric with complexity charges
│
├── demos/
│   ├── demo_geometry.py       # Visualize QIG metric emerging from entanglement
│   ├── demo_holographic.py    # Show bulk reconstruction from boundary data
│   ├── demo_complexity.py     # Track dC/dt during a computation
│   └── demo_compiler.py       # Compile a task graph onto hyperbolic geometry
│
├── tests/
│   ├── test_core.py
│   ├── test_compiler.py
│   └── test_runtime.py
│
├── requirements.txt
└── run_all_demos.py
```

---

## Quick Start

```bash
pip install -r requirements.txt
python run_all_demos.py
```

Or run individual demos:
```bash
python demos/demo_geometry.py      # Watch spatial geometry emerge from entanglement
python demos/demo_holographic.py   # Reconstruct bulk from boundary (AdS/CFT toy)
python demos/demo_complexity_compiler.py  # Complexity growth + hyperbolic compiler
```

### Linux/WSL Environment (Recommended for heavy simulation)

This repo includes a persistent Linux setup workflow:

```bash
# from repo root (inside WSL)
bash scripts/setup_linux_env.sh
source .venv-linux/bin/activate
bash scripts/run_linux_checks.sh
python run_all_demos.py
```

GPU note:
- Use WSL2 + NVIDIA drivers + CUDA-enabled Linux packages for acceleration.
- This repository setup is Linux-ready; GPU acceleration depends on your WSL GPU stack.

---

## Key Concepts Implemented

| QIG Principle | Implementation |
|---|---|
| Distance = mutual information | `entanglement.mutual_information()` → graph metric |
| Area = entanglement entropy | `holographic_code.boundary_entropy()` |
| Volume = complexity | `complexity.circuit_depth()` tracked per state |
| Gravity = dC/dt | `complexity_tracker.dcdt()` — complexity growth rate |
| Spacetime = QEC code | `holographic_code.HaPPYCode` toy model |
| MERA = AdS geometry | `mera_circuit.MERACircuit` builds hyperbolic bulk |
| Hyperbolic compiler | `hyperbolic_embed.HyperbolicEmbedder` |

---

## Mathematical Foundations

All implementations are grounded in verified physics:

- **S = A/4G_N** (Ryu-Takayanagi): boundary entropy = bulk area
- **C = V/G_N·l** (Complexity-Volume): bulk volume = circuit complexity  
- **dC/dt = 2E/πℏ** (Lloyd bound): complexity growth rate = 2 × energy / πℏ
- **β^G_μν = 0** ⟹ R_μν = 0 (String consistency ⟹ Einstein equations)
- **[X^i, X^j] ≠ 0** (BFSS): pre-geometric non-commutative algebra

---

## Research Directions This Enables

1. **Tensor Network Processing Units (TNPUs)** — AI inference on holographic substrates
2. **Holographic NoCs** — interconnects scaled by area not volume  
3. **Complexity-aware compilers** — minimize dC/dt for a given task graph
4. **QEC-native memory** — RAID-like redundancy with growing code distance
5. **Reversible computing fabric** — Landauer-limit schedulers with complexity charges
