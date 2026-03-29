"""
complexity.py — Computational Complexity Tracker

Implements the complexity side of the QIG dictionary:
  C = V / (G_N * l_AdS)         [Complexity-Volume conjecture]
  dC/dt = 2E / (pi * hbar)      [Lloyd bound — saturated by black holes]

The core claim: TEMPORAL DEPTH of spacetime = COMPUTATIONAL COMPLEXITY.
The wormhole interior is long because the computation is deep.
Gravity is dC/dt.

This module tracks:
  - Circuit complexity of quantum states
  - Complexity growth rate (the "gravitational" quantity)
  - Lloyd bound verification
  - Complexity budget resource management for the scheduler
"""

import numpy as np
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass, field
from collections import deque
import time


# Physical constants (natural units with hbar = 1 for computation)
HBAR = 1.0           # Natural units
PI = np.pi


@dataclass
class Gate:
    """An elementary quantum gate — the unit of computational complexity."""
    name: str
    qubits: List[int]
    unitary: Optional[np.ndarray] = None
    complexity_cost: float = 1.0    # Default: each gate adds 1 to complexity
    energy_cost: float = 1.0        # Energy consumed (for Lloyd bound tracking)
    is_reversible: bool = True      # Reversible gates preserve information


@dataclass
class ComplexitySnapshot:
    """Point-in-time record of complexity state."""
    timestamp: float
    circuit_depth: int
    gate_count: int
    complexity: float               # C(t) — the "bulk volume"
    energy_expended: float          # Total energy used
    dcdt: float                     # dC/dt — the "gravitational" quantity
    lloyd_bound: float              # 2E/pi*hbar — max allowed dC/dt
    lloyd_fraction: float           # dcdt / lloyd_bound — how close to BH behavior
    state_entropy: float            # Current entanglement entropy


class ComplexityTracker:
    """
    Tracks computational complexity as a first-class resource.

    In the QIG framework, this is tracking the TEMPORAL GEOMETRY.
    Each gate added deepens the "wormhole" — extends the interior spacetime.
    dC/dt = 2E/pi*hbar at saturation (black hole = maximal computer).

    Usage:
        tracker = ComplexityTracker(n_qubits=4, energy_budget=100.0)
        tracker.apply_gate(Gate("H", [0], complexity_cost=1.0))
        tracker.apply_gate(Gate("CNOT", [0,1], complexity_cost=1.5))
        print(tracker.dcdt())          # Current complexity growth rate
        print(tracker.bulk_volume())   # Emergent spacetime interior volume
        tracker.check_lloyd_bound()    # Are we near black hole efficiency?
    """

    def __init__(self, n_qubits: int, energy_budget: float = 1000.0,
                 G_N: float = 1.0, l_AdS: float = 1.0):
        self.n_qubits = n_qubits
        self.energy_budget = energy_budget
        self.G_N = G_N
        self.l_AdS = l_AdS

        self.gates_applied: List[Gate] = []
        self.circuit_depth: int = 0
        self.total_complexity: float = 0.0
        self.total_energy: float = 0.0
        self.start_time: float = time.time()
        self.history: deque = deque(maxlen=1000)
        self.current_entropy: float = 0.0

        # Snapshot at t=0
        self._record_snapshot()

    def apply_gate(self, gate: Gate) -> bool:
        """
        Apply a gate. Returns False if energy budget exceeded.

        Each gate:
        1. Increases circuit depth (temporal geometry deepens)
        2. Consumes energy (tracked against Lloyd bound)
        3. Potentially changes entanglement structure (spatial geometry changes)
        """
        energy_needed = gate.energy_cost
        if self.total_energy + energy_needed > self.energy_budget:
            return False  # Budget exhausted

        self.gates_applied.append(gate)
        self.circuit_depth += 1
        self.total_complexity += gate.complexity_cost
        self.total_energy += energy_needed
        self._record_snapshot()
        return True

    def apply_circuit(self, gates: List[Gate]) -> int:
        """Apply a sequence of gates. Returns number successfully applied."""
        applied = 0
        for gate in gates:
            if self.apply_gate(gate):
                applied += 1
            else:
                break
        return applied

    def dcdt(self) -> float:
        """
        dC/dt — the complexity growth rate.

        QIG interpretation: THIS IS GRAVITY.
        A region with high dC/dt has high energy density → curves spacetime.
        dC/dt = 2E/πℏ at Lloyd bound (black hole regime).

        Computed as: delta_C / delta_t over recent window.
        """
        if len(self.history) < 2:
            return 0.0
        recent = list(self.history)[-10:]  # Last 10 snapshots
        if len(recent) < 2:
            return 0.0
        delta_C = recent[-1].complexity - recent[0].complexity
        delta_t = recent[-1].timestamp - recent[0].timestamp
        if delta_t < 1e-9:
            return 0.0
        return delta_C / delta_t

    def lloyd_bound(self) -> float:
        """
        2E / (π ℏ) — Maximum computation rate for given energy.

        Lloyd (2000): No physical system can perform more than 2E/πℏ
        elementary operations per second.

        Black holes SATURATE this bound — they are the maximally
        efficient computers in the universe. dC/dt = 2M/πℏ.

        In our units (ℏ=1): lloyd_bound = 2*E/π
        """
        return 2.0 * self.total_energy / PI

    def lloyd_fraction(self) -> float:
        """How close to the Lloyd (black hole) limit are we? 0=idle, 1=saturated."""
        lb = self.lloyd_bound()
        if lb < 1e-10:
            return 0.0
        return min(1.0, self.dcdt() / lb)

    def bulk_volume(self) -> float:
        """
        V_bulk = C * G_N * l_AdS  [inverse of CV conjecture]

        The emergent bulk spacetime volume corresponding to current complexity.
        As complexity grows, the interior spacetime deepens.
        This is the wormhole growing — the Einstein-Rosen bridge extending.
        """
        return self.total_complexity * self.G_N * self.l_AdS

    def complexity_density(self, spatial_volume: float) -> float:
        """
        Complexity per unit spatial volume — analogous to energy density.
        High complexity density → strong gravitational field (high curvature).
        """
        if spatial_volume < 1e-10:
            return 0.0
        return self.total_complexity / spatial_volume

    def scrambling_time(self) -> float:
        """
        t_scramble ~ (1/E) * log(S)

        The time for quantum information to become maximally mixed
        across the system — when the black hole has 'scrambled' all input.
        After this point, information is not lost but requires
        exponentially many operations to extract (Page curve regime).
        """
        if self.current_entropy < 1e-10 or self.total_energy < 1e-10:
            return float('inf')
        return np.log(max(1.0, self.current_entropy)) / self.total_energy

    def page_time_estimate(self) -> float:
        """
        t_Page ~ S * t_scramble

        The time when the Page curve peaks and information starts
        coming out of the black hole (complexity starts being recoverable).
        """
        return self.current_entropy * self.scrambling_time()

    def complexity_budget_remaining(self) -> float:
        """How much complexity we can still generate before energy runs out."""
        energy_remaining = self.energy_budget - self.total_energy
        # Assume average gate cost
        if len(self.gates_applied) > 0:
            avg_cost = self.total_complexity / len(self.gates_applied)
            avg_energy = self.total_energy / len(self.gates_applied)
            if avg_energy > 0:
                return energy_remaining * (avg_cost / avg_energy)
        return energy_remaining  # Default: 1 complexity per energy unit

    def update_entropy(self, entropy: float):
        """Update the current entanglement entropy (from spatial geometry tracker)."""
        self.current_entropy = entropy
        if self.history:
            self.history[-1].state_entropy = entropy

    def _record_snapshot(self):
        """Record current state for history."""
        self.history.append(ComplexitySnapshot(
            timestamp=time.time() - self.start_time,
            circuit_depth=self.circuit_depth,
            gate_count=len(self.gates_applied),
            complexity=self.total_complexity,
            energy_expended=self.total_energy,
            dcdt=self.dcdt(),
            lloyd_bound=self.lloyd_bound(),
            lloyd_fraction=self.lloyd_fraction(),
            state_entropy=self.current_entropy
        ))

    def check_lloyd_bound(self) -> Dict[str, float]:
        """
        Verify the Lloyd bound is not violated.
        A computation approaching dC/dt → 2E/πℏ is approaching
        black-hole-like efficiency.
        """
        dc = self.dcdt()
        lb = self.lloyd_bound()
        frac = self.lloyd_fraction()

        status = "IDLE"
        if frac > 0.9:
            status = "BLACK HOLE REGIME (near Lloyd saturation)"
        elif frac > 0.5:
            status = "HIGH EFFICIENCY"
        elif frac > 0.1:
            status = "MODERATE EFFICIENCY"
        elif frac > 0.0:
            status = "LOW EFFICIENCY"

        return {
            "dC/dt": dc,
            "lloyd_bound_2E/pi": lb,
            "fraction": frac,
            "status": status,
            "bulk_volume": self.bulk_volume(),
            "scrambling_time": self.scrambling_time(),
        }

    def summary(self) -> str:
        """Print complexity tracker summary."""
        check = self.check_lloyd_bound()
        lines = [
            "=" * 60,
            "COMPLEXITY TRACKER — QIG Temporal Geometry State",
            "=" * 60,
            f"Circuit depth (wormhole length):  {self.circuit_depth}",
            f"Total complexity C(t):            {self.total_complexity:.4f}",
            f"Bulk volume V = C*G_N*l:          {self.bulk_volume():.4f}",
            f"Energy expended:                  {self.total_energy:.4f}",
            f"Complexity growth rate dC/dt:     {check['dC/dt']:.4f}",
            f"Lloyd bound 2E/π:                 {check['lloyd_bound_2E/pi']:.4f}",
            f"Efficiency (Lloyd fraction):      {check['fraction']:.1%}",
            f"Status:                           {check['status']}",
            f"Entanglement entropy:             {self.current_entropy:.4f}",
            f"Scrambling time estimate:         {check['scrambling_time']:.4f}",
            "=" * 60,
        ]
        return "\n".join(lines)


def gate_complexity_for_algorithm(algorithm: str, n: int) -> Tuple[int, float]:
    """
    Standard circuit complexity for common algorithms.
    Returns (gate_count, circuit_depth).

    These are the 'temporal depths' of different computations —
    how deep the corresponding 'wormhole' needs to be.
    """
    complexities = {
        "identity":          (0, 0),
        "hadamard_all":      (n, 1),                      # Parallel H on all qubits
        "qft":               (n * (n-1) // 2, n),          # Quantum Fourier Transform
        "grover_oracle":     (n, int(np.log2(n))),          # Grover oracle
        "grover_full":       (int(np.sqrt(2**n)) * n, int(np.sqrt(2**n))),  # Full Grover
        "random_circuit":    (n * 20, 20),                  # Random depth-20 circuit
        "black_hole_approx": (n * n, n),                    # Near-maximal scrambling
    }
    gates, depth = complexities.get(algorithm, (n, 1))
    return gates, float(depth)


def landauer_energy(n_bits_erased: int, temperature: float = 300.0) -> float:
    """
    Landauer's principle: erasing 1 bit costs at least k_B * T * ln(2) energy.

    In the QIG framework, information erasure corresponds to
    increasing entropy in a non-unitary (irreversible) operation.
    Reversible computation avoids this cost entirely.

    k_B = 1.380649e-23 J/K
    """
    k_B = 1.380649e-23
    return n_bits_erased * k_B * temperature * np.log(2)
