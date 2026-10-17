"""
cuda_env_5q.py
--------------
Vectorized Parallel CUDA Quantum Circuit Environment for 5-Qubit QuantumRL.
Steps N=256 parallel environments simultaneously directly inside GPU VRAM via PyTorch.
"""

import math
import torch
import numpy as np
from typing import Dict, List, Optional, Tuple

try:
    from quantumrl.quantum_env_5q import QuantumCircuitEnv5Q, compute_von_neumann_entropy_5q
except ImportError:
    from quantum_env_5q import QuantumCircuitEnv5Q, compute_von_neumann_entropy_5q


class VectorQuantumEnvCUDA5Q:
    """
    Parallel CUDA Vectorized Quantum Environment for 5-Qubit System.
    Simultaneously steps N parallel environments (N=256) directly in GPU VRAM.
    """

    def __init__(self, config=None, num_envs: int = 256, device: str = 'cuda'):
        if config is None:
            try:
                from quantumrl.configs.config_5qubit import Config5Qubit
                config = Config5Qubit()
            except ImportError:
                from configs.config_5qubit import Config5Qubit
                config = Config5Qubit()

        self.config = config
        self.num_envs = num_envs
        self.device = torch.device(device if torch.cuda.is_available() else 'cpu')
        self.max_steps = getattr(config, 'MAX_STEPS', 60)
        self.fidelity_threshold = getattr(config, 'FIDELITY_THRESHOLD', 0.999999)
        self.gate_penalty = getattr(config, 'GATE_PENALTY', 0.0006)

        # CPU env to extract action list & gate unitaries
        cpu_env = QuantumCircuitEnv5Q(config)
        self.action_list = cpu_env.action_list
        self.num_actions = len(self.action_list)
        assert self.num_actions == 440, f"Expected 440 actions, got {self.num_actions}"

        # Pre-computed (440, 32, 32) gate matrices as PyTorch complex64 tensor
        mats_np = cpu_env.gate_mats  # shape (440, 32, 32)
        self.action_mats = torch.tensor(mats_np, dtype=torch.complex64, device=self.device)

        # Environment state tensors on VRAM
        self.target_sv = torch.zeros((num_envs, 32, 1), dtype=torch.complex64, device=self.device)
        self.current_sv = torch.zeros((num_envs, 32, 1), dtype=torch.complex64, device=self.device)
        self.steps = torch.zeros(num_envs, dtype=torch.int32, device=self.device)
        self.prev_fidelity = torch.zeros(num_envs, dtype=torch.float32, device=self.device)

        # Episode milestone flags (256, 6) bool: 0.40, 0.60, 0.75, 0.90, 0.999, 0.999999
        self.milestones = torch.zeros((num_envs, 6), dtype=torch.bool, device=self.device)

    @property
    def statevectors(self) -> torch.Tensor:
        return self.current_sv

    @property
    def fidelities(self) -> torch.Tensor:
        return self.prev_fidelity

    def _sample_haar_targets(self, count: int) -> torch.Tensor:
        """Sample Haar-random 5-qubit target statevectors directly in GPU VRAM."""
        z = torch.randn((count, 32, 2), dtype=torch.float32, device=self.device)
        z_c = torch.complex(z[:, :, 0], z[:, :, 1])
        norms = torch.linalg.vector_norm(z_c, dim=1, keepdim=True)
        psi = z_c / norms
        return psi.unsqueeze(-1)

    def _sample_targets(self, mask=None) -> None:
        if mask is None:
            count = self.num_envs
            new_targets = self._sample_haar_targets(count)
            self.target_sv.copy_(new_targets)
        elif isinstance(mask, torch.Tensor) and mask.dtype == torch.bool:
            count = int(mask.sum().item())
            if count == 0:
                return
            new_targets = self._sample_haar_targets(count)
            self.target_sv[mask] = new_targets
        else:
            count = len(mask)
            if count == 0:
                return
            new_targets = self._sample_haar_targets(count)
            self.target_sv[mask] = new_targets

    def reset(self, target_svs=None) -> torch.Tensor:
        self.current_sv.zero_()
        self.current_sv[:, 0, 0] = 1.0 + 0j  # |00000> ground state
        self.steps.zero_()
        self.milestones.zero_()

        if target_svs is not None:
            self.target_sv.copy_(torch.as_tensor(target_svs, dtype=torch.complex64, device=self.device).view(-1, 32, 1))
        else:
            self._sample_targets()

        self.prev_fidelity = self._compute_fidelity()
        return self._encode_obs()

    def reset_envs(self, env_indices: torch.Tensor, target_svs=None) -> None:
        if len(env_indices) == 0:
            return
        self.current_sv[env_indices] = 0.0 + 0j
        self.current_sv[env_indices, 0, 0] = 1.0 + 0j
        self.steps[env_indices] = 0
        self.milestones[env_indices] = False

        if target_svs is not None:
            self.target_sv[env_indices] = torch.as_tensor(target_svs, dtype=torch.complex64, device=self.device).view(-1, 32, 1)
        else:
            self._sample_targets(mask=env_indices)

        self.prev_fidelity[env_indices] = self._compute_fidelity(mask=env_indices)

    def _compute_fidelity(self, mask=None) -> torch.Tensor:
        """F = |vdot(target, current)|^2 across batch."""
        if mask is None:
            t_sv = self.target_sv.squeeze(-1)
            c_sv = self.current_sv.squeeze(-1)
        else:
            t_sv = self.target_sv[mask].squeeze(-1)
            c_sv = self.current_sv[mask].squeeze(-1)

        # PyTorch vdot conjugates first argument: <t_sv|c_sv>
        inner_prod = torch.sum(torch.conj(t_sv) * c_sv, dim=1)
        return torch.square(torch.abs(inner_prod))

    def step(self, actions: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor]:

        actions_tensor = torch.as_tensor(actions, dtype=torch.long, device=self.device)
        selected_mats = self.action_mats[actions_tensor]  # (N, 32, 32)

        # Batched state propagation: sv = U @ sv
        self.current_sv = torch.bmm(selected_mats, self.current_sv)

        # Normalize
        norms = torch.linalg.vector_norm(self.current_sv.squeeze(-1), dim=1, keepdim=True).unsqueeze(-1)
        self.current_sv = self.current_sv / torch.clamp(norms, min=1e-12)

        self.steps += 1

        curr_fidelity = self._compute_fidelity()
        delta_F = curr_fidelity - self.prev_fidelity

        # Base reward
        reward = 12.0 * delta_F - self.gate_penalty

        # Milestones: 0.40, 0.60, 0.75, 0.90, 0.999, 0.999999
        m040 = (curr_fidelity >= 0.40) & (~self.milestones[:, 0])
        m060 = (curr_fidelity >= 0.60) & (~self.milestones[:, 1])
        m075 = (curr_fidelity >= 0.75) & (~self.milestones[:, 2])
        m090 = (curr_fidelity >= 0.90) & (~self.milestones[:, 3])
        m999 = (curr_fidelity >= 0.999) & (~self.milestones[:, 4])
        m999999 = (curr_fidelity >= self.fidelity_threshold) & (~self.milestones[:, 5])

        reward += m040.float() * 2.0
        reward += m060.float() * 1.5
        reward += m075.float() * 3.0
        reward += m090.float() * 8.0
        reward += m999.float() * 15.0
        reward += m999999.float() * 30.0

        self.milestones[:, 0] |= m040
        self.milestones[:, 1] |= m060
        self.milestones[:, 2] |= m075
        self.milestones[:, 3] |= m090
        self.milestones[:, 4] |= m999
        self.milestones[:, 5] |= m999999

        # Stagnation penalty (-0.5 if t > 20 and F < 0.15)
        stagnant = (self.steps > 20) & (curr_fidelity < 0.15)
        reward -= stagnant.float() * 0.5

        terminated = curr_fidelity >= self.fidelity_threshold
        truncated = self.steps >= self.max_steps
        dones = terminated | truncated

        self.prev_fidelity = curr_fidelity
        obs = self._encode_obs()

        return obs, reward, dones, curr_fidelity

    def _encode_obs(self) -> torch.Tensor:

        curr_r = self.current_sv.squeeze(-1).real
        curr_i = self.current_sv.squeeze(-1).imag
        targ_r = self.target_sv.squeeze(-1).real
        targ_i = self.target_sv.squeeze(-1).imag

        fid = self.prev_fidelity.unsqueeze(-1)
        step_ratio = (self.steps.float() / self.max_steps).unsqueeze(-1)

        return torch.cat([curr_r, curr_i, targ_r, targ_i, fid, step_ratio], dim=1)
