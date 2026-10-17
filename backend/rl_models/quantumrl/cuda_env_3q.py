"""
cuda_env_3q.py
--------------
Vectorized Parallel CUDA Quantum Circuit Environment for 3-Qubit QuantumRL.
Steps N=256 parallel environments simultaneously directly inside GPU VRAM via PyTorch.
"""

import math
import torch
import numpy as np
from typing import Dict, List, Optional, Tuple

try:
    from quantumrl.quantum_env_3q import QuantumCircuitEnv3Q, compute_von_neumann_entropy
except ImportError:
    from quantum_env_3q import QuantumCircuitEnv3Q, compute_von_neumann_entropy



class VectorQuantumEnvCUDA3Q:
    """
    Parallel CUDA Vectorized Quantum Environment for 3-Qubit System.
    Simultaneously steps N parallel environments (N=256) directly in GPU VRAM.
    """

    def __init__(self, config, num_envs: int = 256, device: str = 'cuda'):
        self.config = config
        self.num_envs = num_envs
        self.device = torch.device(device)
        self.max_steps = config.MAX_STEPS
        self.fidelity_threshold = config.FIDELITY_THRESHOLD
        self.gate_penalty = config.GATE_PENALTY

        # CPU env to extract action list & gate unitaries
        cpu_env = QuantumCircuitEnv3Q(config)
        self.action_list = cpu_env.action_list
        self.num_actions = len(self.action_list)

        # Pre-computed (252, 8, 8) gate matrices as CUDA PyTorch complex64 tensor
        mats_np = cpu_env.gate_mats  # shape (252, 8, 8)
        self.action_mats = torch.tensor(mats_np, dtype=torch.complex64, device=self.device)

        # Environment state tensors on CUDA VRAM
        self.target_sv = torch.zeros((num_envs, 8, 1), dtype=torch.complex64, device=self.device)
        self.current_sv = torch.zeros((num_envs, 8, 1), dtype=torch.complex64, device=self.device)
        self.steps = torch.zeros(num_envs, dtype=torch.int32, device=self.device)
        self.prev_fidelity = torch.zeros(num_envs, dtype=torch.float32, device=self.device)

        # Episode milestone flags (256, 4) bool
        self.milestones = torch.zeros((num_envs, 4), dtype=torch.bool, device=self.device)

        # Curriculum state
        self.curriculum_phase: int = 1

    @property
    def statevectors(self) -> torch.Tensor:
        return self.current_sv

    @property
    def fidelities(self) -> torch.Tensor:
        return self.prev_fidelity



    def set_curriculum_phase(self, phase: int) -> None:

        self.curriculum_phase = phase

    def _sample_curriculum_targets(self, count: int) -> torch.Tensor:
        """Sample count 3-qubit Haar targets respecting curriculum entropy constraint."""
        targets = np.zeros((count, 8, 1), dtype=np.complex64)
        collected = 0

        while collected < count:
            z = (np.random.normal(size=(8,)) + 1j * np.random.normal(size=(8,))) / np.sqrt(2.0)
            psi = (z / np.linalg.norm(z)).astype(np.complex128)

            entropy = compute_von_neumann_entropy(psi)

            # Check phase entropy constraint
            accept = False
            if self.curriculum_phase == 1:
                accept = (entropy < 0.5)
            elif self.curriculum_phase == 2:
                accept = (entropy < 0.8) or (np.random.rand() < 0.30)
            elif self.curriculum_phase == 3:
                accept = (entropy < 1.0) or (np.random.rand() < 0.60)
            else:  # Phase 4
                accept = True

            if accept:
                targets[collected, :, 0] = psi.astype(np.complex64)
                collected += 1

        return torch.tensor(targets, dtype=torch.complex64, device=self.device)

    def _sample_targets(self, mask=None) -> None:
        if mask is None:
            mask = torch.ones(self.num_envs, dtype=torch.bool, device=self.device)
        count = int(mask.sum().item())
        if count == 0:
            return
        new_targets = self._sample_curriculum_targets(count)
        self.target_sv[mask] = new_targets

    def reset(self, target_svs=None) -> torch.Tensor:
        self.current_sv.zero_()
        self.current_sv[:, 0, 0] = 1.0 + 0j  # |000> ground state
        self.steps.zero_()
        self.milestones.zero_()

        if target_svs is not None:
            self.target_sv.copy_(torch.as_tensor(target_svs, dtype=torch.complex64, device=self.device).view(-1, 8, 1))
        else:
            self._sample_targets()

        self.prev_fidelity = self._compute_fidelity()
        return self._encode_obs()

    def reset_batch(self, target_svs=None) -> torch.Tensor:
        return self.reset(target_svs)

    def reset_envs(self, env_indices: torch.Tensor, target_svs=None) -> None:
        if len(env_indices) == 0:
            return
        mask = torch.zeros(self.num_envs, dtype=torch.bool, device=self.device)
        mask[env_indices] = True

        self.current_sv[mask] = 0.0
        self.current_sv[mask, 0, 0] = 1.0 + 0j  # |000>
        self.steps[mask] = 0
        self.milestones[mask] = False

        if target_svs is not None:
            self.target_sv[mask] = torch.as_tensor(target_svs, dtype=torch.complex64, device=self.device).view(-1, 8, 1)
        else:
            self._sample_targets(mask)

        # Re-compute fidelity for reset envs
        dot_product = torch.bmm(
            self.target_sv[mask].conj().transpose(1, 2),
            self.current_sv[mask]
        ).squeeze(-1).squeeze(-1)
        self.prev_fidelity[mask] = (dot_product.abs() ** 2).real


    def _compute_fidelity(self) -> torch.Tensor:
        # F = | <target | current> |^2
        target_h = self.target_sv.transpose(1, 2).conj()
        dot = torch.bmm(target_h, self.current_sv).view(-1)
        return torch.abs(dot) ** 2

    def _encode_obs(self) -> torch.Tensor:
        curr_r = self.current_sv.real.squeeze(2)  # (N, 8)
        curr_i = self.current_sv.imag.squeeze(2)  # (N, 8)
        tgt_r  = self.target_sv.real.squeeze(2)   # (N, 8)
        tgt_i  = self.target_sv.imag.squeeze(2)   # (N, 8)
        fid    = self.prev_fidelity.unsqueeze(1) # (N, 1)
        st_ratio = (self.steps.float() / self.max_steps).unsqueeze(1) # (N, 1)

        obs = torch.cat([curr_r, curr_i, tgt_r, tgt_i, fid, st_ratio], dim=1) # (N, 34)
        return obs

    def step(self, actions: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor, torch.Tensor, Dict]:
        """
        Step all N parallel environments simultaneously on CUDA GPU.
        actions : CUDA LongTensor of shape (num_envs,)
        """
        self.steps += 1

        # Gather discrete 8x8 action matrices for all N environments
        U_batch = self.action_mats[actions]  # (N, 8, 8)

        # Batch matrix product on CUDA VRAM: (N, 8, 8) @ (N, 8, 1) -> (N, 8, 1)
        self.current_sv = torch.bmm(U_batch, self.current_sv)

        curr_fidelity = self._compute_fidelity()
        delta_f = curr_fidelity - self.prev_fidelity

        # Dense reward
        rewards = 12.0 * delta_f - self.gate_penalty

        # Milestone bonuses
        m50 = (curr_fidelity >= 0.50) & (~self.milestones[:, 0])
        m75 = (curr_fidelity >= 0.75) & (~self.milestones[:, 1])
        m90 = (curr_fidelity >= 0.90) & (~self.milestones[:, 2])
        m999 = (curr_fidelity >= 0.999) & (~self.milestones[:, 3])

        rewards += m50.float() * 1.5
        rewards += m75.float() * 3.0
        rewards += m90.float() * 8.0
        rewards += m999.float() * 15.0

        self.milestones[:, 0] |= m50
        self.milestones[:, 1] |= m75
        self.milestones[:, 2] |= m90
        self.milestones[:, 3] |= m999

        # Stagnation penalty
        stag = (self.steps > 12) & (curr_fidelity < 0.30)
        rewards -= stag.float() * 0.5

        # Terminated
        terminated = curr_fidelity >= self.fidelity_threshold
        rewards += terminated.float() * 30.0

        truncated = self.steps >= self.max_steps
        dones = terminated | truncated

        self.prev_fidelity = curr_fidelity
        obs = self._encode_obs()

        if dones.any():
            reset_mask = dones
            self.current_sv[reset_mask] = 0.0
            self.current_sv[reset_mask, 0, 0] = 1.0 + 0j
            self.steps[reset_mask] = 0
            self.milestones[reset_mask] = False
            self._sample_targets(reset_mask)
            self.prev_fidelity[reset_mask] = self._compute_fidelity()[reset_mask]

        return obs, rewards, dones, {'fidelity': curr_fidelity}


CUDAQuantumEnv3Q = VectorQuantumEnvCUDA3Q
