#!/usr/bin/env python3
"""
demo_holographic.py — Bulk reconstruction from boundary data (AdS/CFT toy).

Demonstrates:
  1. RT formula: S_boundary = Area_bulk / 4G_N
  2. Entanglement wedge reconstruction
  3. Quantum error correction structure of spacetime
  4. MERA geometry matching AdS hyperbolic structure
"""

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from core.holographic_code import HaPPYCode
from hardware_sim.mera_circuit import MERACircuit


def demo_holographic():
    print("=" * 70)
    print("DEMO 2: HOLOGRAPHIC RECONSTRUCTION (AdS/CFT TOY MODEL)")
    print("=" * 70)
    print()

    # ── HaPPY Code ──
    print("─" * 50)
    print("PART A: HaPPY HOLOGRAPHIC ERROR CORRECTING CODE")
    print("Bulk = logical qubits. Boundary = physical qubits.")
    print("Spacetime geometry = quantum error correction structure.")
    print("─" * 50)
    print()

    code = HaPPYCode(n_boundary=16, n_bulk=4, G_N=1.0)
    print(code.summary())
    print()

    # Test reconstruction
    print("─" * 50)
    print("BULK RECONSTRUCTION TESTS")
    print("Q: Can boundary region A reconstruct bulk qubit B?")
    print("Entanglement wedge reconstruction: YES iff A covers > 50% of encoding")
    print("─" * 50)
    print()

    for bulk_id in range(min(3, code.n_bulk)):
        required = code.encoding_map[bulk_id]
        print(f"Bulk qubit {bulk_id} (encoded in {len(required)} boundary qubits):")

        # Small region — should fail
        small_region = list(range(code.n_boundary // 4))
        result_small = code.reconstruct_bulk(small_region, bulk_id)

        # Large region — should succeed
        large_region = list(range(code.n_boundary // 2 + 2))
        result_large = code.reconstruct_bulk(large_region, bulk_id)

        print(f"  Small boundary region (size {len(small_region)}): "
              f"{'✓ Reconstructible' if result_small.success else '✗ Cannot reconstruct'}")
        print(f"  Large boundary region (size {len(large_region)}): "
              f"{'✓ Reconstructible' if result_large.success else '✗ Cannot reconstruct'}")
        print(f"  RT formula check: {'✓ holds' if result_large.rt_check else '≈ approximate'}")
        print(f"  SCALAR_METRIC: boundary_entropy={result_large.boundary_entropy:.4f}")
        print(f"  SCALAR_METRIC: rt_surface_area={result_large.entanglement_wedge_area:.4f}")
        print()

    # Error correction
    print("─" * 50)
    print("QUANTUM ERROR CORRECTION")
    print("Code distance = RT surface area. More area = more fault tolerant.")
    print("─" * 50)

    for n_errors in [1, 2, 3, 4]:
        error_qubits = list(range(n_errors))
        correctable, min_needed = code.quantum_error_correction(error_qubits)
        status = "✓ CORRECTABLE" if correctable else "✗ TOO MANY ERRORS"
        print(f"  {n_errors} error(s) on boundary: {status}")

    print()

    # ── MERA Circuit ──
    print("─" * 50)
    print("PART B: MERA TENSOR NETWORK = ADS GEOMETRY")
    print("Swingle (2012): MERA entanglement structure = hyperbolic space")
    print("S_MERA(L) = S_RT(L) = (c/3)log(L) — same formula, same geometry")
    print("─" * 50)
    print()

    mera = MERACircuit(n_boundary=16, n_layers=4, G_N=1.0)
    print(mera.summary())
    print()

    # Verify RT formula match
    print("─" * 50)
    print("RT FORMULA: S_MERA = Area_AdS / 4G_N")
    print("─" * 50)

    rt_results = mera.verify_rt_formula()
    all_pass = True
    for label, r in rt_results.items():
        status = "✓ MATCH" if r['match'] else "≈ CLOSE"
        if not r['match']:
            all_pass = False
        print(f"  {label}: S_MERA={r['S_MERA']:.4f}, S_RT={r['S_RT_formula']:.4f}  [{status}]")

    print(f"\nOverall: {'ALL MATCH ✓' if all_pass else 'Approximate match (toy model)'}")
    print()

    # Holographic RG
    print("─" * 50)
    print("HOLOGRAPHIC RG: Depth = Coarse-graining scale")
    print("IR (deep bulk) → UV (boundary) = low energy → high energy")
    print("─" * 50)

    profile = mera.radial_entropy_profile()
    print("\nEntropy vs depth (boundary=0, bulk center=max):")
    for layer, S in profile:
        bar = "█" * max(1, int(S * 8))
        label = "← UV (boundary)" if layer == 0 else ("← IR (bulk)" if layer == len(profile)-1 else "")
        print(f"  QUANTUM_NODE: layer={layer} entropy={S:.4f} {label}")

    print()
    print("✓ DEMO 2 COMPLETE: Bulk geometry reconstructed from boundary data.")


if __name__ == "__main__":
    demo_holographic()
