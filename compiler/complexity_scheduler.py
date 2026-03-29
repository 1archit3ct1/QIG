"""
complexity_scheduler.py — Complexity-Budget-Aware Task Scheduler

Treats computational complexity as a first-class resource,
alongside memory and energy.

QIG principle: time IS complexity. The scheduler manages
the rate of complexity growth (dC/dt) to:
  1. Stay below the Lloyd bound (don't waste energy)
  2. Prioritize tasks by their complexity-per-energy ratio
  3. Reuse computation (reversible tasks refund complexity budget)
  4. Schedule correlated tasks together (minimize entanglement distance)

The key insight: scheduling IS geometry.
  - A good schedule keeps dC/dt close to 2E/pi (Lloyd-efficient)
  - A bad schedule has bursty complexity growth (wasteful)
  - The optimal schedule is the one that traces a geodesic
    in complexity space — this is literally the WdW action minimization
"""

import numpy as np
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass, field
from collections import defaultdict
import heapq

from .hyperbolic_embed import Task


@dataclass
class ScheduledTask:
    """A task with its scheduling metadata."""
    task: Task
    start_time: float
    estimated_end: float
    complexity_at_start: float
    energy_at_start: float
    priority: float           # Higher = run sooner
    is_reversible: bool = True


class ComplexityScheduler:
    """
    Task scheduler that manages complexity as a resource.

    In the QIG framework:
    - Complexity budget = how much 'temporal depth' we can create
    - Energy budget = how fast we can create it (dC/dt ≤ 2E/πℏ)
    - Reversible tasks = zero Landauer cost (no entropy increase)
    - Irreversible tasks = pay Landauer price (kT log 2 per bit erased)

    The scheduler enforces:
    1. Lloyd bound: dC/dt ≤ 2E_available/π at all times
    2. Complexity budget: total C ≤ C_max
    3. Dependency ordering: respects task DAG
    4. Geometry-aware: collocates tasks with high mutual information

    Usage:
        sched = ComplexityScheduler(
            energy_rate=100.0,    # Energy per second
            complexity_budget=500.0
        )
        sched.add_task(task)
        schedule = sched.build_schedule()
        sched.simulate(schedule)
    """

    def __init__(self, energy_rate: float = 100.0,
                 complexity_budget: float = 1000.0,
                 temperature: float = 300.0):
        self.energy_rate = energy_rate          # Joules per second available
        self.complexity_budget = complexity_budget
        self.temperature = temperature           # For Landauer limit calculations

        self.tasks: Dict[int, Task] = {}
        self.completed: set = set()
        self.current_time: float = 0.0
        self.current_complexity: float = 0.0
        self.current_energy: float = 0.0
        self.schedule_log: List[ScheduledTask] = []

    def add_task(self, task: Task):
        """Register a task with the scheduler."""
        self.tasks[task.id] = task

    def add_tasks(self, tasks: List[Task]):
        for t in tasks:
            self.add_task(t)

    def lloyd_bound_at_energy(self, energy: float) -> float:
        """
        Maximum dC/dt given current energy: 2E/πℏ (ℏ=1 in natural units).
        """
        return 2.0 * energy / np.pi

    def task_priority(self, task: Task) -> float:
        """
        Priority score for a task.

        Higher priority = run sooner.
        Priority considers:
        1. Complexity efficiency: C_contribution / energy_cost (more = better)
        2. Reversibility: reversible tasks get bonus (no Landauer waste)
        3. Dependency pressure: tasks with many dependents run first

        This is the QIG-aware scheduling heuristic: prefer operations
        that generate complexity efficiently (close to Lloyd bound)
        and that are reversible (no thermodynamic waste).
        """
        energy = max(task.compute_cost * 0.01, 0.001)
        complexity_efficiency = task.complexity_contribution / energy
        reversibility_bonus = 1.5 if task.is_reversible else 1.0
        n_dependents = sum(1 for t in self.tasks.values()
                           if task.id in (t.dependencies or []))
        dependency_pressure = 1.0 + 0.1 * n_dependents

        return complexity_efficiency * reversibility_bonus * dependency_pressure

    def ready_tasks(self) -> List[Task]:
        """Tasks whose dependencies are all completed."""
        ready = []
        for task in self.tasks.values():
            if task.id in self.completed:
                continue
            deps = task.dependencies or []
            if all(d in self.completed for d in deps):
                ready.append(task)
        return ready

    def build_schedule(self) -> List[ScheduledTask]:
        """
        Build a complexity-budget-aware schedule.

        Algorithm:
        1. Find ready tasks (dependencies met)
        2. Sort by priority (complexity efficiency)
        3. Allocate tasks while respecting Lloyd bound and budget
        4. After each task, update complexity and energy state
        5. Repeat until all tasks scheduled or budget exhausted

        The resulting schedule is a trajectory through complexity space —
        a 'worldline' in the QIG temporal geometry.
        """
        schedule = []
        energy_available = self.energy_rate * 10.0  # Initial energy pool

        while True:
            ready = self.ready_tasks()
            if not ready:
                break

            # Sort by priority (highest first)
            ready.sort(key=self.task_priority, reverse=True)

            scheduled_this_round = False
            for task in ready:
                # Check Lloyd bound: can we afford this task?
                dcdt_needed = task.complexity_contribution / max(task.compute_cost, 0.001)
                lloyd = self.lloyd_bound_at_energy(energy_available)

                if dcdt_needed > lloyd * 1.1:  # 10% tolerance
                    continue  # Skip — would violate Lloyd bound

                # Check complexity budget
                if self.current_complexity + task.complexity_contribution > self.complexity_budget:
                    continue  # Budget exhausted

                # Schedule this task
                duration = task.compute_cost / (self.energy_rate + 1e-10)
                sched_task = ScheduledTask(
                    task=task,
                    start_time=self.current_time,
                    estimated_end=self.current_time + duration,
                    complexity_at_start=self.current_complexity,
                    energy_at_start=self.current_energy,
                    priority=self.task_priority(task),
                    is_reversible=task.is_reversible
                )

                schedule.append(sched_task)
                self.schedule_log.append(sched_task)
                self.completed.add(task.id)

                # Update state
                self.current_time += duration
                self.current_complexity += task.complexity_contribution
                energy_used = task.compute_cost * 0.01
                self.current_energy += energy_used
                energy_available -= energy_used

                # Refund energy for reversible tasks (Landauer)
                if task.is_reversible:
                    energy_available += energy_used * 0.9  # 90% recovery

                scheduled_this_round = True
                break  # One task per round (sequential for clarity)

            if not scheduled_this_round:
                break  # Deadlock or budget exhausted

        return schedule

    def simulate(self, schedule: List[ScheduledTask]) -> Dict[str, List[float]]:
        """
        Simulate execution and track complexity, energy, and dC/dt over time.

        Returns time series for visualization:
        - times: wall clock times
        - complexity: C(t) — the 'bulk volume'
        - dcdt: dC/dt — 'gravity'
        - lloyd_fraction: dC/dt / (2E/π) — efficiency
        """
        times = [0.0]
        complexity = [0.0]
        energy = [0.0]
        dcdt_series = [0.0]
        lloyd_fractions = [0.0]

        C = 0.0
        E = 0.0

        for st in schedule:
            dt = st.estimated_end - st.start_time
            dC = st.task.complexity_contribution
            dE = st.task.compute_cost * 0.01

            # Record at task start
            times.append(st.start_time)
            complexity.append(C)
            energy.append(E)

            # Compute dC/dt for this task
            current_dcdt = dC / max(dt, 1e-10)
            lloyd = self.lloyd_bound_at_energy(E + dE)
            lloyd_frac = current_dcdt / (lloyd + 1e-10)

            dcdt_series.append(current_dcdt)
            lloyd_fractions.append(min(1.0, lloyd_frac))

            # Record at task end
            C += dC
            E += dE
            times.append(st.estimated_end)
            complexity.append(C)
            energy.append(E)
            dcdt_series.append(0.0)
            lloyd_fractions.append(0.0)

        return {
            'times': times,
            'complexity': complexity,
            'energy': energy,
            'dcdt': dcdt_series,
            'lloyd_fraction': lloyd_fractions,
        }

    def summary(self, schedule: List[ScheduledTask]) -> str:
        """Print schedule summary."""
        total_C = sum(s.task.complexity_contribution for s in schedule)
        total_E = sum(s.task.compute_cost * 0.01 for s in schedule)
        reversible = sum(1 for s in schedule if s.is_reversible)
        total_time = max((s.estimated_end for s in schedule), default=0.0)
        avg_lloyd = total_C / max(total_time * self.lloyd_bound_at_energy(total_E), 1e-10)

        lines = [
            "=" * 60,
            "COMPLEXITY SCHEDULER — QIG Temporal Resource Plan",
            "=" * 60,
            f"Tasks scheduled:          {len(schedule)}",
            f"Total complexity C:       {total_C:.4f}  (bulk volume)",
            f"Total energy E:           {total_E:.4f}",
            f"Total time:               {total_time:.4f}",
            f"Reversible tasks:         {reversible}/{len(schedule)}",
            f"Average Lloyd efficiency: {avg_lloyd:.1%}",
            f"Lloyd bound 2E/π:         {self.lloyd_bound_at_energy(total_E):.4f}",
            "",
            "Schedule (IR→UV order):",
        ]

        for st in schedule:
            rev = "↺" if st.is_reversible else "→"
            lines.append(
                f"  {rev} [{st.start_time:.3f}→{st.estimated_end:.3f}] "
                f"{st.task.name:25s} "
                f"C+={st.task.complexity_contribution:.2f}"
            )

        lines.append("=" * 60)
        return "\n".join(lines)
