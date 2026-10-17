"""
cuda_env_4q.py
--------------
Vectorized Parallel CUDA Quantum Circuit Environment for 4-Qubit QuantumRL.
Steps N=256 parallel environments simultaneously directly inside GPU VRAM via PyTorch.
"""

import math
import torch
import numpy as np
from typing import Dict, List, Optional, Tuple

try:
    from quantumrl.quantum_env_4q import QuantumCircuitEnv4Q, compute_von_neumann_entropy_4q
except ImportError:
    from quantum_env_4q import QuantumCircuitEnv4Q, compute_von_neumann_entropy_4q


class VectorQuantumEnvCUDA4Q:
    """
    Parallel CUDA Vectorized Quantum Environment for 4-Qubit System.
    Simultaneously steps N parallel environments (N=256) directly in GPU VRAM.
    """

    def __init__(self, config=None, num_envs: int = 256, device: str = 'cuda'):
        if config is None:
            try:
                from quantumrl.configs.config_4qubit import Config4Qubit
                config = Config4Qubit()
            except ImportError:
                from configs.config_4qubit import Config4Qubit
                config = Config4Qubit()

        self.config = config
        self.num_envs = num_envs
        self.device = torch.device(device if torch.cuda.is_available() else 'cpu')
        self.max_steps = getattr(config, 'MAX_STEPS', 50)
        self.fidelity_threshold = getattr(config, 'FIDELITY_THRESHOLD', 0.999999)
        self.gate_penalty = getattr(config, 'GATE_PENALTY', 0.001)

        # CPU env to extract action list & gate unitaries
        cpu_env = QuantumCircuitEnv4Q(config)
        self.action_list = cpu_env.action_list
        self.num_actions = len(self.action_list)
        assert self.num_actions == 344, f"Expected 344 actions, got {self.num_actions}"

        # Pre-computed (344, 16, 16) gate matrices as PyTorch complex64 tensor
        mats_np = cpu_env.gate_mats  # shape (344, 16, 16)
        self.action_mats = torch.tensor(mats_np, dtype=torch.complex64, device=self.device)

        # Environment state tensors on VRAM
        self.target_sv = torch.zeros((num_envs, 16, 1), dtype=torch.complex64, device=self.device)
        self.current_sv = torch.zeros((num_envs, 16, 1), dtype=torch.complex64, device=self.device)
        self.steps = torch.zeros(num_envs, dtype=torch.int32, device=self.device)
        self.prev_fidelity = torch.zeros(num_envs, dtype=torch.float32, device=self.device)

        # Episode milestone flags (256, 4) bool
        self.milestones = torch.zeros((num_envs, 4), dtype=torch.bool, device=self.device)

    @property
    def statevectors(self) -> torch.Tensor:
        return self.current_sv

    @property
    def fidelities(self) -> torch.Tensor:
        return self.prev_fidelity

    def _sample_haar_targets(self, count: int) -> torch.Tensor:
        """Sample Haar-random 4-qubit target statevectors directly in GPU VRAM."""
        z = torch.randn((count, 16, 2), dtype=torch.float32, device=self.device)
        z_c = torch.complex(z[:, :, 0], z[:, :, 1])
        norms = torch.linalg.vector_norm(z_c, dim=1, keepdim=True)
        psi = z_c / norms
        return psi.unsqueeze(-1)

    def _sample_targets(self, mask=None) -> None:
        if mask is None:
            mask = torch.ones(self.num_envs, dtype=torch.bool, device=self.device)
        count = int(mask.sum().item())
        if count == 0:
            return
        new_targets = self._sample_haar_targets(count)
        self.target_sv[mask] = new_targets

    def reset(self, target_svs=None) -> torch.Tensor:
        self.current_sv.zero_()
        self.current_sv[:, 0, 0] = 1.0 + 0j  # |0000> ground state
        self.steps.zero_()
        self.milestones.zero_()

        if target_svs is not None:
            self.target_sv.copy_(torch.as_tensor(target_svs, dtype=torch.complex64, device=self.device).view(-1, 16, 1))
        else:
            self._sample_targets()

        self.prev_fidelity = self._compute_fidelity()
        return self._encode_obs()

    def reset_envs(self, env_indices: torch.Tensor, target_svs=None) -> None:
        if len(env_indices) == 0:
            return
        mask = torch.zeros(self.num_envs, dtype=torch.bool, device=self.device)
        mask[env_indices] = True

        self.current_sv[mask] = 0.0
        self.current_sv[mask, 0, 0] = 1.0 + 0j  # |0000>
        self.steps[mask] = 0
        self.milestones[mask] = False

        if target_svs is not None:
            self.target_sv[mask] = torch.as_tensor(target_svs, dtype=torch.complex64, device=self.device).view(-1, 16, 1)
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
        return (dot.abs() ** 2).real

    def _encode_obs(self) -> torch.Tensor:
        # Obs shape: (N, 66)
        # Re(current)[16], Im(current)[16], Re(target)[16], Im(target)[16], fidelity[1], norm_step[1]
        curr_flat = self.current_sv.view(self.num_envs, 16)
        targ_flat = self.target_sv.view(self.num_envs, 16)

        curr_re = curr_flat.real
        curr_im = curr_flat.imag
        targ_re = targ_flat.real
        targ_im = targ_flat.imag

        fidelity = self._compute_fidelity().unsqueeze(-1)
        norm_step = (self.steps.float() / float(self.max_steps)).unsqueeze(-1)

        obs = torch.cat([curr_re, curr_im, targ_re, targ_im, fidelity, norm_step], dim=-1)
        return obs

    def step(self, actions: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor, Dict]:
        # actions: (num_envs,) int tensor on CUDA
        actions_tensor = torch.as_tensor(actions, dtype=torch.long, device=self.device)
        selected_mats = self.action_mats[actions_tensor]  # (num_envs, 16, 16)

        # Evolve state: current_sv = mat @ current_sv
        self.current_sv = torch.bmm(selected_mats, self.current_sv)
        self.steps += 1

        new_fidelity = self._compute_fidelity()
        fidelity_diff = new_fidelity - self.prev_fidelity
        rewards = fidelity_diff * 10.0 - self.gate_penalty

        # Milestones [0.90, 0.99, 0.999, 0.999999]
        m90 = (new_fidelity >= 0.90) & (~self.milestones[:, 0])
        m99 = (new_fidelity >= 0.99) & (~self.milestones[:, 1])
        m999 = (new_fidelity >= 0.999) & (~self.milestones[:, 2])
        m999999 = (new_fidelity >= self.fidelity_threshold) & (~self.milestones[:, 3])

        rewards[m90] += 1.0
        rewards[m99] += 5.0
        rewards[m999] += 10.0
        rewards[m999999] += 100.0

        self.milestones[:, 0] |= (new_fidelity >= 0.90)
        self.milestones[:, 1] |= (new_fidelity >= 0.99)
        self.milestones[:, 2] |= (new_fidelity >= 0.999)
        self.milestones[:, 3] |= (new_fidelity >= self.fidelity_threshold)

        success = new_fidelity >= self.fidelity_threshold
        truncated = (self.steps >= self.max_steps) & (~success)
        dones = success | truncated

        self.prev_fidelity = new_fidelity.clone()
        next_obs = self._encode_obs()

        # Reset done environments automatically
        done_indices = torch.nonzero(dones).view(-1)
        if len(done_indices) > 0:
            self.reset_envs(done_indices)

        info = {
            "successes": success,
            "dones": dones,
            "final_fidelities": new_fidelity
        }

        return next_obs, rewards, dones, info


if __name__ == '__main__':
    vec_env = VectorQuantumEnvCUDA4Q(num_envs=256)
    obs = vec_env.reset()
    assert obs.shape == (256, 66), f"Vector obs shape error: {obs.shape}"

    random_actions = torch.randint(0, 344, (256,), device=vec_env.device)
    n_obs, rewards, dones, info = vec_env.step(random_actions)
    assert n_obs.shape == (256, 66)
    assert rewards.shape == (256,)
    print(f"[OK] VectorQuantumEnvCUDA4Q initialized on {vec_env.device} and stepped 256 parallel envs successfully!")
