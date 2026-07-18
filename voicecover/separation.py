import os
import gc
import threading
import torch
import numpy as np
import soundfile as sf
from demucs.pretrained import get_model
from demucs.apply import apply_model
from config import MODELS_DIR, UPLOAD_DIR, SEPARATION_DIR
from utils import cleanup_old_files

# GPU 互斥锁：防止分离和翻唱同时加载模型到显存
# 任何 GPU 操作（包括子进程 RVC 推理）必须先获取此锁
gpu_lock = threading.Lock()

separation_store = {}

# 使用 HuggingFace Hub 缓存到项目本地目录
os.environ.setdefault('HF_ENDPOINT', 'https://hf-mirror.com')
CACHE_DIR = os.path.join(MODELS_DIR, 'hub')
os.makedirs(CACHE_DIR, exist_ok=True)
os.environ['HUGGINGFACE_HUB_CACHE'] = CACHE_DIR

KIM_VOCAL_2_PATH = os.path.join(MODELS_DIR, 'weights', 'vocals_mel_band_roformer.ckpt')


def _wav_to_format(wav_path, target_format, sr=None):
    """将 WAV 文件转换为目标格式，返回新路径。如果已是 WAV 则直接返回原路径。"""
    target_format = target_format.upper()
    if target_format == 'WAV' or wav_path is None:
        return wav_path
    base, _ = os.path.splitext(wav_path)
    new_path = base + '.' + target_format.lower()
    if os.path.exists(new_path):
        return new_path
    import subprocess as _sp
    cmd = ['ffmpeg', '-y', '-i', wav_path]
    if sr:
        cmd.extend(['-ar', str(sr)])
    if target_format == 'MP3':
        cmd.extend(['-b:a', '192k'])
    cmd.append(new_path)
    _sp.run(cmd, capture_output=True, text=True, timeout=120)
    return new_path if os.path.exists(new_path) else wav_path


def run_separation_htdemucs(task_id, input_path, separation_dir, base_name, output_format='WAV'):
    """使用 HTDemucs 进行人声分离（4 音轨合成人声 + 伴奏）"""
    separation_store[task_id].update({
        'status': 'waiting',
        'progress': 0,
        'message': '等待 GPU 资源中...',
    })
    if not gpu_lock.acquire(timeout=300):
        raise TimeoutError('等待 GPU 超时（5分钟），请重试')
    try:
        return _run_separation_htdemucs_locked(task_id, input_path, separation_dir, base_name, output_format)
    finally:
        gpu_lock.release()


def _run_separation_htdemucs_locked(task_id, input_path, separation_dir, base_name, output_format='WAV'):
    """实际执行 HTDemucs 分离（已持有 gpu_lock）"""
    separation_store[task_id].update({
        'status': 'loading_model',
        'progress': 5,
        'message': '加载 HTDemucs 模型中...',
    })

    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    model = get_model(name='htdemucs')
    model.to(device)
    model.eval()

    separation_store[task_id].update({
        'status': 'separating',
        'progress': 30,
        'message': 'HTDemucs 分离人声与伴奏中...',
    })

    wav, sr = sf.read(input_path)
    wav = wav.T

    if wav.shape[0] > 2:
        wav = wav[:2]
    elif wav.shape[0] == 1:
        wav = np.concatenate([wav, wav], axis=0)

    wav_tensor = torch.from_numpy(wav).float().unsqueeze(0).to(device)

    with torch.no_grad():
        sources = apply_model(model, wav_tensor, shifts=1, split=True, overlap=0.25, progress=True)

    sources = sources[0].cpu().numpy()

    stem_names = model.sources if hasattr(model, 'sources') else ['bass', 'drums', 'other', 'vocals']

    vocals_idx = stem_names.index('vocals') if 'vocals' in stem_names else 3
    vocals = sources[vocals_idx]

    other_idxs = [i for i, s in enumerate(stem_names) if s != 'vocals']
    instrumental = np.sum([sources[i] for i in other_idxs], axis=0)

    vocal_path = os.path.join(separation_dir, f'{base_name}_Vocals.wav')
    inst_path = os.path.join(separation_dir, f'{base_name}_Instrumental.wav')

    sf.write(vocal_path, vocals.T, sr)
    sf.write(inst_path, instrumental.T, sr)

    del model, wav_tensor, sources
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()

    if output_format != 'WAV':
        vocal_path = _wav_to_format(vocal_path, output_format, sr)
        inst_path = _wav_to_format(inst_path, output_format, sr)

    return vocal_path, inst_path


def run_separation_kim_vocal_2(task_id, input_path, separation_dir, base_name, output_format='WAV'):
    """使用 Kim Vocal 2 (UVR) 进行人声分离（2 音轨）"""
    separation_store[task_id].update({
        'status': 'waiting',
        'progress': 0,
        'message': '等待 GPU 资源中...',
    })
    if not gpu_lock.acquire(timeout=300):
        raise TimeoutError('等待 GPU 超时（5分钟），请重试')
    try:
        return _run_separation_kim_vocal_2_locked(task_id, input_path, separation_dir, base_name, output_format)
    finally:
        gpu_lock.release()


def _run_separation_kim_vocal_2_locked(task_id, input_path, separation_dir, base_name, output_format='WAV'):
    """实际执行 Kim Vocal 2 分离（已持有 gpu_lock）—— 正版 Mel-Band-RoFormer 228M 参数"""
    from audio_separator.separator import Separator

    separation_store[task_id].update({
        'status': 'loading_model',
        'progress': 5,
        'message': '加载 Kim Vocal 2（Mel-Band-RoFormer）模型中...',
    })

    weights_dir = os.path.dirname(KIM_VOCAL_2_PATH)
    separator = Separator(
        model_file_dir=weights_dir,
        output_dir=separation_dir,
        output_format=output_format,
        normalization_threshold=0.9,
        amplification_threshold=0.0,
        use_soundfile=False,
        sample_rate=44100,
    )

    separator.load_model('vocals_mel_band_roformer.ckpt')

    separation_store[task_id].update({
        'status': 'separating',
        'progress': 30,
        'message': 'Kim Vocal 2 分离人声与伴奏中...',
    })

    output_files = separator.separate(input_path)

    # Mel-Band-RoFormer 输出命名: {orig}_(vocals)_{model}.wav, {orig}_(other)_{model}.wav
    vocal_path = None
    inst_path = None
    for f in output_files:
        lower = f.lower()
        if '_(vocals)_' in lower or lower.endswith('(vocals).wav'):
            vocal_path = f
        elif '_(other)_' in lower or lower.endswith('(other).wav') or '_(instrumental)_' in lower or '_(no_vocal)_' in lower:
            inst_path = f

    # 如果没按预期匹配到，从返回列表中推断
    if vocal_path is None and len(output_files) >= 1:
        vocal_path = output_files[0]
    if inst_path is None and len(output_files) >= 2:
        inst_path = output_files[1] if output_files[1] != vocal_path else output_files[0]

    # 确保路径是绝对路径
    if vocal_path and not os.path.isabs(vocal_path):
        vocal_path = os.path.join(separation_dir, vocal_path)
    if inst_path and not os.path.isabs(inst_path):
        inst_path = os.path.join(separation_dir, inst_path)

    del separator
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()

    return vocal_path, inst_path


def run_separation(task_id, input_path, separation_dir, model_type='htdemucs', output_format='WAV'):
    try:
        base_name = os.path.splitext(os.path.basename(input_path))[0]

        if model_type == 'kim_vocal_2':
            vocal_path, inst_path = run_separation_kim_vocal_2(task_id, input_path, separation_dir, base_name, output_format)
        else:
            vocal_path, inst_path = run_separation_htdemucs(task_id, input_path, separation_dir, base_name, output_format)

        if not vocal_path or not inst_path:
            raise RuntimeError('分离完成但未找到输出文件')

        separation_store[task_id].update({
            'status': 'completed',
            'progress': 100,
            'message': '分离完成！',
            'vocal_path': vocal_path,
            'inst_path': inst_path,
        })

        # 清理旧上传文件和分离文件（分离文件保留1天供下载）
        cleanup_old_files(UPLOAD_DIR, days=7)
        cleanup_old_files(SEPARATION_DIR, days=1)

    except Exception as e:
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        separation_store[task_id].update({
            'status': 'failed',
            'progress': 0,
            'message': f'分离失败: {str(e)}',
            'error': str(e),
        })


def get_separation_status(task_id):
    return separation_store.get(task_id, {
        'status': 'not_found',
        'message': '任务不存在',
    })
