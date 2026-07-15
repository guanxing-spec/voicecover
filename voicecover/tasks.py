import threading
import subprocess
import uuid
import os
from config import RVC_DIR, RVC_INFER_CLI, VENV_PYTHON, RVC_WEIGHTS_DIR, RVC_INDICES_DIR, RVC_LOGS_DIR, OUTPUT_DIR
from utils import preprocess_audio, cleanup_old_files

task_store = {}


def run_task(task_id, input_path, model_name, pitch=0):
    try:
        task_store[task_id] = {
            'status': 'preprocessing',
            'progress': 10,
            'message': '音频预处理中...',
            'output_path': None,
            'error': None
        }

        processed = input_path.rsplit('.', 1)[0] + '_16k.wav'
        preprocess_audio(input_path, processed)

        output_path = os.path.join(OUTPUT_DIR, f"{task_id}.wav")

        index_path = None
        for p in [
            os.path.join(RVC_INDICES_DIR, f"{model_name}.index"),
            os.path.join(RVC_LOGS_DIR, model_name, f"{model_name}.index"),
            os.path.join(RVC_LOGS_DIR, model_name, "added.index"),
        ]:
            if os.path.exists(p):
                index_path = p
                break

        pth_name = model_name if model_name.endswith('.pth') else f"{model_name}.pth"
        cmd = [
            VENV_PYTHON, RVC_INFER_CLI,
            '--input_path', processed,
            '--opt_path', output_path,
            '--model_name', pth_name,
            '--f0up_key', str(pitch),
            '--index_rate', '0.66',
            '--f0method', 'harvest',
            '--filter_radius', '3',
        ]
        if index_path:
            cmd.extend(['--index_path', index_path])

        task_store[task_id].update({
            'status': 'converting',
            'progress': 30,
            'message': 'AI翻唱中，请稍候...'
        })

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=1800, cwd=RVC_DIR)

        if result.returncode != 0:
            raise Exception(result.stderr)

        task_store[task_id].update({
            'status': 'completed',
            'progress': 100,
            'message': '翻唱完成！',
            'output_path': output_path
        })

        if os.path.exists(processed):
            os.remove(processed)
        cleanup_old_files(OUTPUT_DIR)

    except subprocess.TimeoutExpired:
        task_store[task_id].update({
            'status': 'failed',
            'message': '转换超时，请重试',
            'error': 'timeout'
        })
    except Exception as e:
        task_store[task_id].update({
            'status': 'failed',
            'message': f'转换失败: {str(e)}',
            'error': str(e)
        })


def start_conversion(input_path, model_name, pitch=0):
    task_id = str(uuid.uuid4())
    task_store[task_id] = {
        'status': 'queued',
        'progress': 0,
        'message': '排队中...',
        'output_path': None,
        'error': None
    }

    t = threading.Thread(target=run_task, args=(task_id, input_path, model_name, pitch))
    t.daemon = True
    t.start()

    return task_id


def get_task_status(task_id):
    return task_store.get(task_id, {
        'status': 'not_found',
        'message': '任务不存在'
    })
