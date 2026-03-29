"""
entanglement.py — Entanglement Measures for QIG

Implements the information-theoretic quantities that define geometry
in the QIG framework.

Key equations:
  S(A) = -Tr(rho_A log rho_A)           [von Neumann entropy = boundary area]
  I(A:B) = S(A) + S(B) - S(AB)          [mutual info = inverse metric distance]
  S_A = Area(gamma_A) / 4G_N            [Ryu-Takayanagi: geometry IS entropy]
  E_N(A:B) = log ||rho^{T_B}||_1        [logarithmic negativity: entanglement witness]
"""

import numpy as np
from typing import List, Tuple, Optional
from dataclasses import dataclass


@dataclass
class EntanglementProfile:
    """Full entanglement characterization of a bipartition A|B."""
    subsystem_A: List[int]
    subsystem_B: List[int]
    entropy_A: float          # S(A) — boundary area in RT formula
    entropy_B: float          # S(B) — should equal S(A) for pure states
    entropy_AB: float         # S(AB) — total entropy
    mutual_info: float        # I(A:B) = S(A)+S(B)-S(AB) — inverse metric distance
    log_negativity: float     # E_N — entanglement witness (non-zero iff entangled)
    is_pure: bool
    is_entangled: bool


def von_neumann_entropy(rho: np.ndarray, base: float = 2.0) -> float:
    """
    S(rho) = -Tr(rho log rho)

    The fundamental quantity in QIG.
    In bits (base 2) by default.
    In nats (base e) for thermodynamic calculations.

    RT formula: S_A = Area(gamma_A) / 4G_N
    This function computes the LEFT side.
    """
    eigenvalues = np.linalg.eigvalsh(rho)
    eigenvalues = eigenvalues[eigenvalues > 1e-12]
    if base == np.e:
        return float(-np.sum(eigenvalues * np.log(eigenvalues)))
    return float(-np.sum(eigenvalues * np.log2(eigenvalues)))


def relative_entropy(rho: np.ndarray, sigma: np.ndarray) -> float:
    """
    D(rho || sigma) = Tr(rho (log rho - log sigma))

    Measures distinguishability between quantum states.
    Used in holographic entanglement of purification calculations.
    """
    from scipy.linalg import logm
    log_rho = logm(rho + 1e-12 * np.eye(len(rho)))
    log_sigma = logm(sigma + 1e-12 * np.eye(len(sigma)))
    return float(np.real(np.trace(rho @ (log_rho - log_sigma))))


def partial_trace_subsystem(rho: np.ndarray, keep: List[int],
                             n_systems: int, local_dim: int) -> np.ndarray:
    """
    Partial trace keeping only the subsystems in `keep`.

    Example: 4 qubits, keep=[0,2] traces out qubits 1 and 3.
    Returns reduced density matrix on subsystems in `keep`.
    """
    d = local_dim
    n = n_systems
    trace_out = sorted([i for i in range(n) if i not in keep], reverse=True)

    rho_reshaped = rho.reshape([d] * (2 * n))

    for sys in trace_out:
        n_current = rho_reshaped.ndim // 2
        rho_reshaped = np.trace(rho_reshaped,
                                axis1=sys,
                                axis2=sys + n_current)

    kept_dim = d ** len(keep)
    return rho_reshaped.reshape(kept_dim, kept_dim)


def mutual_information(rho_AB: np.ndarray,
                       subsys_A: List[int],
                       subsys_B: List[int],
                       n_systems: int,
                       local_dim: int) -> float:
    """
    I(A:B) = S(A) + S(B) - S(AB)

    THE metric in QIG: distance(i,j) ∝ 1/I(Q_i:Q_j)

    Physical meaning:
    - I=0: no correlation, infinite distance, disconnected geometry
    - I=max: maximum entanglement, minimum distance, highly curved geometry

    Quantum analog of: two points are close iff they share information.
    """
    rho_A = partial_trace_subsystem(rho_AB, subsys_A, n_systems, local_dim)
    rho_B = partial_trace_subsystem(rho_AB, subsys_B, n_systems, local_dim)
    rho_AB_sub = partial_trace_subsystem(rho_AB, subsys_A + subsys_B, n_systems, local_dim)

    S_A = von_neumann_entropy(rho_A)
    S_B = von_neumann_entropy(rho_B)
    S_AB = von_neumann_entropy(rho_AB_sub)

    return max(0.0, S_A + S_B - S_AB)


def logarithmic_negativity(rho: np.ndarray, dim_A: int) -> float:
    """
    E_N(A:B) = log2(||rho^{T_B}||_1)

    where rho^{T_B} is the partial transpose with respect to B,
    and ||·||_1 is the trace norm (sum of singular values).

    Properties:
    - E_N = 0 for separable states (not entangled)
    - E_N > 0 certifies entanglement
    - In holography: relates to the entanglement wedge cross-section
    """
    dim_B = rho.shape[0] // dim_A
    # Reshape for partial transpose
    rho_reshaped = rho.reshape(dim_A, dim_B, dim_A, dim_B)
    # Partial transpose on B: swap last two indices of B
    rho_pt = rho_reshaped.transpose(0, 3, 2, 1).reshape(dim_A * dim_B, dim_A * dim_B)

    eigenvalues = np.linalg.eigvalsh(rho_pt)
    trace_norm = np.sum(np.abs(eigenvalues))
    return float(np.log2(trace_norm))


def full_entanglement_profile(rho: np.ndarray,
                               subsys_A: List[int],
                               subsys_B: List[int],
                               n_systems: int,
                               local_dim: int) -> EntanglementProfile:
    """
    Complete entanglement characterization of the A|B bipartition.
    """
    rho_A = partial_trace_subsystem(rho, subsys_A, n_systems, local_dim)
    rho_B = partial_trace_subsystem(rho, subsys_B, n_systems, local_dim)
    rho_AB = partial_trace_subsystem(rho, subsys_A + subsys_B, n_systems, local_dim)

    S_A = von_neumann_entropy(rho_A)
    S_B = von_neumann_entropy(rho_B)
    S_AB = von_neumann_entropy(rho_AB)
    MI = max(0.0, S_A + S_B - S_AB)

    # Check purity: Tr(rho^2) ≈ 1 iff pure
    purity_AB = float(np.real(np.trace(rho_AB @ rho_AB)))
    is_pure = purity_AB > 0.99

    # Log negativity for entanglement witness
    dim_A = local_dim ** len(subsys_A)
    E_N = logarithmic_negativity(rho_AB, dim_A)
    is_entangled = E_N > 0.01

    return EntanglementProfile(
        subsystem_A=subsys_A,
        subsystem_B=subsys_B,
        entropy_A=S_A,
        entropy_B=S_B,
        entropy_AB=S_AB,
        mutual_info=MI,
        log_negativity=E_N,
        is_pure=is_pure,
        is_entangled=is_entangled
    )


def area_law_check(rho: np.ndarray, n_systems: int,
                   local_dim: int) -> Tuple[List[float], str]:
    """
    Verify the area law: S(A) should scale with |∂A| not |A|.

    For a 1D chain of n qubits:
    - Area law: S(A) ~ constant (bounded)
    - Volume law: S(A) ~ |A| (grows with region size)

    QIG requires area law — it's equivalent to the RT formula.
    If the state satisfies the area law, it can be efficiently
    represented as a tensor network (MERA).

    Returns entropy as function of subsystem size.
    """
    entropies = []
    for size in range(1, n_systems):
        subsys = list(range(size))
        rho_A = partial_trace_subsystem(rho, subsys, n_systems, local_dim)
        S = von_neumann_entropy(rho_A)
        entropies.append(S)

    # Check: does entropy saturate (area law) or grow linearly (volume law)?
    max_entropy = local_dim * n_systems  # theoretical max (volume law)
    half_point = entropies[n_systems // 2 - 1]
    saturation_ratio = half_point / max_entropy

    if saturation_ratio < 0.3:
        verdict = "AREA LAW ✓ — compatible with QIG / tensor network representation"
    elif saturation_ratio < 0.6:
        verdict = "MIXED — partial area law, intermediate entanglement"
    else:
        verdict = "VOLUME LAW — high entanglement, harder to represent as tensor network"

    return entropies, verdict


def rt_formula_check(boundary_entropy: float, bulk_area: float,
                     G_N: float = 1.0) -> Tuple[float, float, bool]:
    """
    Verify the Ryu-Takayanagi formula: S_boundary = Area(gamma) / 4G_N

    In a holographic toy model, check that the boundary entanglement entropy
    matches the area of the minimal bulk surface.

    Returns: (predicted_entropy, actual_entropy, passes)
    """
    predicted = bulk_area / (4 * G_N)
    passes = abs(predicted - boundary_entropy) / (boundary_entropy + 1e-10) < 0.05
    return predicted, boundary_entropy, passes


def page_curve(n_qubits: int, t_steps: int = 100) -> Tuple[List[float], List[float]]:
    """
    Simulate the Page curve for a system of n_qubits.

    The Page curve describes entropy of a subsystem as the total
    system evolves from a pure state through random unitary evolution:
    - Entropy grows initially (information appears lost)
    - Peaks at Page time t ~ n/2
    - Returns to zero (information is recovered — unitarity)

    This is the information-theoretic proof that black holes don't destroy
    information (island formula result).
    """
    times = []
    entropies = []

    # Start with a pure state |0...0>
    total_dim = 2 ** n_qubits
    psi = np.zeros(total_dim, dtype=complex)
    psi[0] = 1.0

    # Split into radiation (first half) and black hole (second half)
    n_rad = n_qubits // 2
    n_bh = n_qubits - n_rad

    rng = np.random.default_rng(42)

    for t in range(t_steps):
        # Apply random unitary (simulates black hole scrambling)
        # Use random Haar-measure unitary on the full system
        U = random_unitary(total_dim, rng)
        psi = U @ psi
        rho = np.outer(psi, psi.conj())

        # Compute entropy of radiation subsystem
        rad_subsys = list(range(n_rad))
        rho_rad = partial_trace_subsystem(rho, rad_subsys, n_qubits, 2)
        S_rad = von_neumann_entropy(rho_rad)

        times.append(t)
        entropies.append(S_rad)

    return times, entropies


def random_unitary(n: int, rng=None) -> np.ndarray:
    """Haar-random unitary matrix of dimension n."""
    if rng is None:
        rng = np.random.default_rng()
    # QR decomposition of random complex matrix gives Haar-random unitary
    Z = (rng.standard_normal((n, n)) + 1j * rng.standard_normal((n, n))) / np.sqrt(2)
    Q, R = np.linalg.qr(Z)
    # Fix phases to ensure Haar measure
    phases = np.diag(R) / np.abs(np.diag(R))
    return Q * phases
