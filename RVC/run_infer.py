"""PyTorch 2.6+ 兼容性补丁：在 RVC 推理前运行"""
import sys
import os

# 将 torch.load 的默认 weights_only 设为 False
import torch
_original_load = torch.load
def _patched_load(f, *args, **kwargs):
    kwargs.setdefault('weights_only', False)
    return _original_load(f, *args, **kwargs)
torch.load = _patched_load

# 切换到 RVC 目录并执行 infer_cli
os.chdir(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.getcwd())

from tools import infer_cli
infer_cli.main()
