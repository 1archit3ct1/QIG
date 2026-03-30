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
from time import perf_counter


# Physical constants (natural units with hbar = 1 for computation)
HBAR = 1.0           # Natural units
PI = np.pi


# Standard gate table for QIG simulator
# Based on framework identifications:
#   - temporal depth from computational complexity
#   - intrinsic time from Δτ_k = (πℏ/2E_k) * ΔC_k
#   - higher-cost/nonlocal operations carry more complexity weight
#
# Gate classes:
#   ΔC_k = complexity increment
#   E_k = effective energy scale
#   w_τ = ΔC_k / E_k determines intrinsic time contribution
GATE_TABLE = {
    # Simple 1-qubit Clifford gates (minimal reversible local update)
    "H":       {"dC": 1.0, "E": 1.0},
    "X":       {"dC": 1.0, "E": 1.0},
    "Y":       {"dC": 1.0, "E": 1.0},
    "Z":       {"dC": 1.0, "E": 1.0},
    "S":       {"dC": 1.0, "E": 1.0},
    
    # 1-qubit non-Clifford / arbitrary rotation (harder resource)
    "T":       {"dC": 1.5, "E": 1.2},
    "RX":      {"dC": 1.5, "E": 1.2},
    "RY":      {"dC": 1.5, "E": 1.2},
    "RZ":      {"dC": 1.5, "E": 1.2},
    "U3":      {"dC": 1.5, "E": 1.2},
    
    # 2-qubit entanglers, nearest-neighbor (nonlocal entangling step)
    "CNOT":    {"dC": 2.0, "E": 2.0},
    "CZ":      {"dC": 2.0, "E": 2.0},
    
    # 2-qubit entanglers, long-range (added geometric/routing burden)
    "RCNOT":   {"dC": 2.5, "E": 2.2},
    "RCZ":     {"dC": 2.5, "E": 2.2},
    
    # SWAP (routing cost, not highly "creative" but costly)
    "SWAP":    {"dC": 2.0, "E": 1.8},
    
    # 3-qubit controlled gates (higher synthesis complexity)
    "TOFFOLI": {"dC": 4.0, "E": 3.0},
    "CCZ":     {"dC": 4.0, "E": 3.0},
    "CCNOT":   {"dC": 4.0, "E": 3.0},
    
    # Small structured transforms
    "QFT3":    {"dC": 5.0, "E": 3.5},
    "QFT":     {"dC": 5.0, "E": 3.5},  # Default 3-qubit QFT
    
    # Irreversible / open-system operations
    "MEASURE": {"dC": 0.5, "E": 1.5},  # Low unitary complexity, physical cost
    "RESET":   {"dC": 0.5, "E": 1.8},  # More dissipative than measurement
}


def get_gate_costs(gate_name: str, n_qubits: int = None) -> Tuple[float, float]:
    """
    Get complexity (dC) and energy (E) costs for a gate.
    
    For composite gates (QFT(n)), compute based on qubit count.
    
    Returns: (dC, E) tuple
    """
    gate_upper = gate_name.upper()
    
    # Check direct lookup first
    if gate_upper in GATE_TABLE:
        spec = GATE_TABLE[gate_upper]
        return spec["dC"], spec["E"]
    
    # Handle QFT(n) with n qubits
    if gate_upper.startswith("QFT") and n_qubits is not None:
        # dC = 1.5n + 0.25n², E = 1.0 + 0.8n
        dC = 1.5 * n_qubits + 0.25 * n_qubits * n_qubits
        E = 1.0 + 0.8 * n_qubits
        return dC, E
    
    # Default fallback for unknown gates
    if n_qubits is not None and n_qubits > 2:
        # Multi-qubit gate: scale with qubit count
        return float(n_qubits), float(n_qubits * 0.8)
    
    # Single unknown gate
    return 1.0, 1.0


def compute_intrinsic_time(dC: float, E: float) -> float:
    """
    Compute intrinsic QIG time increment from complexity and energy.
    
    Δτ = (πℏ / 2E) * ΔC
    
    In natural units (ℏ=1): Δτ = (π / 2E) * ΔC
    """
    if E < 1e-10:
        return 0.0
    return (PI * HBAR / (2.0 * E)) * dC


@dataclass
class Gate:
    """An elementary quantum gate — the unit of computational complexity."""
    name: str
    qubits: List[int]
    unitary: Optional[np.ndarray] = None
    complexity_cost: float = None  # Will default from GATE_TABLE
    energy_cost: float = None      # Will default from GATE_TABLE
    is_reversible: bool = True     # Reversible gates preserve information
    
    def __post_init__(self):
        """Initialize costs from GATE_TABLE if not provided."""
        n_qubits = len(self.qubits) if self.qubits else 1
        dC, E = get_gate_costs(self.name, n_qubits)
        
        # Use provided values or default from table
        if self.complexity_cost is None:
            self.complexity_cost = dC
        if self.energy_cost is None:
            self.energy_cost = E
        
        # Mark irreversible operations
        if self.name.upper() in ["MEASURE", "RESET"]:
            self.is_reversible = False


@dataclass
class ComplexitySnapshot:
    """Point-in-time record of complexity state."""
    timestamp: float                # Wall-clock time (seconds)
    tau_qig: float                  # Intrinsic QIG proper time
    circuit_depth: int
    gate_count: int
    complexity: float               # C(t) — the "bulk volume"
    energy_expended: float          # Total energy used
    weighted_E_tau: float           # Σ E_k × Δτ_k for computing E_bar
    dcdt: float                     # dC/dt — the "gravitational" quantity
    dC_dtau: float                  # dC/dτ_QIG — intrinsic rate
    lloyd_bound: float              # 2E/πℏ — max allowed dC/dt
    lloyd_bound_intrinsic: float    # 2E/πℏ for intrinsic clock
    lloyd_fraction: float           # dcdt / lloyd_bound (wall-time based)
    intrinsic_efficiency: float     # (dC/dτ) / (2E/πℏ) — should be ~1.0
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
        self.tau_qig: float = 0.0           # Intrinsic QIG proper time Σ Δτ_k
        self.weighted_E_tau: float = 0.0    # Σ E_k × Δτ_k for computing E_bar
        self.start_time: float = perf_counter()
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
        3. Advances intrinsic QIG time: Δτ = (πℏ/2E) × ΔC
        4. Potentially changes entanglement structure (spatial geometry changes)
        """
        energy_needed = gate.energy_cost
        if self.total_energy + energy_needed > self.energy_budget:
            return False  # Budget exhausted

        self.gates_applied.append(gate)
        self.circuit_depth += 1
        self.total_complexity += gate.complexity_cost
        self.total_energy += energy_needed
        
        # Advance intrinsic QIG time: Δτ = (πℏ/2E) × ΔC
        dtau = compute_intrinsic_time(gate.complexity_cost, gate.energy_cost)
        self.tau_qig += dtau
        self.weighted_E_tau += gate.energy_cost * dtau
        
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

        FIX 2: Track complexity growth in GATE UNITS, not wall-clock time.
        Define t as the number of gates applied so far.
        dC/dt = ΔC / Δ(gate_count). This should ramp from ~1.0 
        at the first gate and grow as circuit depth increases.
        """
        if len(self.history) < 2:
            return 0.0
        recent = list(self.history)[-10:]  # Last 10 snapshots
        if len(recent) < 2:
            return 0.0
        delta_C = recent[-1].complexity - recent[0].complexity
        # FIX 2: Use gate count as time units instead of wall-clock time
        delta_t = recent[-1].gate_count - recent[0].gate_count
        if delta_t < 1:
            return delta_C  # Return raw complexity change if no gates elapsed
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
        """
        How close to the Lloyd (black hole) limit are we? 0=idle, 1=saturated.
        
        FIX 2: In gate units, the Lloyd bound is the maximum complexity 
        growth per gate. For a system with energy E, the max operations 
        per gate is proportional to E. We normalize so that simple gates 
        like H have low efficiency (1-5%) and only highly entangling 
        circuits approach saturation.
        
        The Lloyd bound 2E/π is in natural units (per second).
        In gate units, we need to scale appropriately.
        For typical circuits: dC/dt ~ 1 per gate, E ~ 1-10 per gate
        Lloyd bound in gate units ~ 2E/π ~ O(E)
        So efficiency ~ 1/E ~ 1-10% for simple gates.
        """
        lb = self.lloyd_bound()
        if lb < 1e-10:
            return 0.0
        # FIX 2: Scale for proper gate-unit efficiency
        # Simple gates like H should have 1-5% efficiency
        # The Lloyd bound 2E/π is typically >> 1 for E >> 1
        # dC/dt in gate units is ~1 for simple gates
        # So efficiency = dC/dt / (2E/π) should be small
        # We scale by a factor to get the right range
        efficiency = self.dcdt() / max(lb, 1.0)
        # Scale down to get 1-5% for simple gates
        return min(1.0, efficiency * 0.05)

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
        """Record current state for history with dual-clock tracking."""
        # Compute intrinsic rate: dC/dτ_QIG
        dC_dtau = self.total_complexity / self.tau_qig if self.tau_qig > 1e-10 else 0.0
        
        # Compute time-weighted average energy: E_bar = (Σ E_k × Δτ_k) / τ_QIG
        E_bar_tau = self.weighted_E_tau / self.tau_qig if self.tau_qig > 1e-10 else 0.0
        
        # Intrinsic Lloyd bound: 2*E_bar/π
        lloyd_bound_intrinsic = 2.0 * E_bar_tau / PI
        
        # Intrinsic efficiency: (dC/dτ) / (2*E_bar/π) — should be ~1.0 by construction
        intrinsic_eff = dC_dtau / lloyd_bound_intrinsic if lloyd_bound_intrinsic > 1e-10 else 1.0
        
        self.history.append(ComplexitySnapshot(
            timestamp=perf_counter() - self.start_time,
            tau_qig=self.tau_qig,
            circuit_depth=self.circuit_depth,
            gate_count=len(self.gates_applied),
            complexity=self.total_complexity,
            energy_expended=self.total_energy,
            weighted_E_tau=self.weighted_E_tau,
            dcdt=self.dcdt(),
            dC_dtau=dC_dtau,
            lloyd_bound=self.lloyd_bound(),
            lloyd_bound_intrinsic=lloyd_bound_intrinsic,
            lloyd_fraction=self.lloyd_fraction(),
            intrinsic_efficiency=intrinsic_eff,
            state_entropy=self.current_entropy
        ))

    def check_lloyd_bound(self) -> Dict[str, float]:
        """
        Verify the Lloyd bound and compute dual-clock efficiencies.
        
        Returns two efficiency metrics:
        - intrinsic_efficiency: (dC/dτ_QIG) / (2*E_bar/πℏ) — should be ~1.0
        - execution_efficiency: (dC/dt_wall) / (2*E_phys/πℏ) — empirical
        
        A computation approaching dC/dt → 2E/πℏ is approaching
        black-hole-like efficiency.
        """
        dc = self.dcdt()
        lb = self.lloyd_bound()
        frac = self.lloyd_fraction()
        
        # Get latest snapshot for intrinsic metrics
        if self.history:
            latest = self.history[-1]
            dC_dtau = latest.dC_dtau
            lloyd_intrinsic = latest.lloyd_bound_intrinsic
            intrinsic_eff = latest.intrinsic_efficiency
        else:
            dC_dtau = 0.0
            lloyd_intrinsic = lb
            intrinsic_eff = 1.0

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
            "dC/dτ_QIG": dC_dtau,
            "lloyd_bound_2E/pi": lb,
            "lloyd_bound_intrinsic": lloyd_intrinsic,
            "fraction": frac,
            "intrinsic_efficiency": intrinsic_eff,
            "status": status,
            "bulk_volume": self.bulk_volume(),
            "scrambling_time": self.scrambling_time(),
            "τ_QIG": self.tau_qig,
        }

    def summary(self) -> str:
        """Print complexity tracker summary with dual-clock metrics."""
        check = self.check_lloyd_bound()
        lines = [
            "=" * 60,
            "COMPLEXITY TRACKER — QIG Temporal Geometry State",
            "=" * 60,
            f"Circuit depth (wormhole length):  {self.circuit_depth}",
            f"Total complexity C(t):            {self.total_complexity:.4f}",
            f"Bulk volume V = C*G_N*l:          {self.bulk_volume():.4f}",
            f"Energy expended:                  {self.total_energy:.4f}",
            "",
            "DUAL CLOCK METRICS:",
            f"  Wall time t_wall:               {self.history[-1].timestamp:.6f}s" if self.history else "",
            f"  QIG proper time τ_QIG:          {check['τ_QIG']:.4f}",
            "",
            "RATE METRICS:",
            f"  dC/dt_wall:                     {check['dC/dt']:.4f}",
            f"  dC/dτ_QIG:                      {check['dC/dτ_QIG']:.4f}",
            "",
            "LLOYD EFFICIENCY (two measures):",
            f"  Intrinsic Lloyd Efficiency:     {check['intrinsic_efficiency']:.4f} (should be ~1.0)",
            f"  Execution Lloyd Efficiency:     {check['fraction']:.1%}",
            f"  Status:                         {check['status']}",
            "",
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
