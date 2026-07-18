import os
import sys

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
RVC_DIR = os.environ.get('RVC_DIR', os.path.join(BASE_DIR, '..', 'RVC'))
RVC_WEIGHTS_DIR = os.path.join(RVC_DIR, 'assets', 'weights')
RVC_INDICES_DIR = os.path.join(RVC_DIR, 'assets', 'indices')
RVC_LOGS_DIR = os.path.join(RVC_DIR, 'logs')
RVC_INFER_CLI = os.path.join(RVC_DIR, 'run_infer.py')
VENV_PYTHON = os.path.join(BASE_DIR, 'venv', 'Scripts', 'python.exe')
UPLOAD_DIR = os.path.join(BASE_DIR, 'static', 'uploads')
OUTPUT_DIR = os.path.join(BASE_DIR, 'outputs')
SEPARATION_DIR = os.path.join(BASE_DIR, 'separated')
MODELS_DIR = os.path.join(BASE_DIR, 'models')

for d in [UPLOAD_DIR, OUTPUT_DIR, SEPARATION_DIR, MODELS_DIR]:
    os.makedirs(d, exist_ok=True)
