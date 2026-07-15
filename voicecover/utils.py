import subprocess
import os
import time

FILE_RETENTION_DAYS = 7


def preprocess_audio(input_path, output_path):
    """ffmpeg转码为16kHz单声道WAV"""
    cmd = [
        'ffmpeg', '-y', '-i', input_path,
        '-ac', '1', '-ar', '16000', '-sample_fmt', 's16',
        output_path
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise Exception(f"ffmpeg失败: {result.stderr}")
    return output_path


# 文件名 -> 显示名 映射
VOICE_NAME_MAP = {
    'spongebob': '海绵宝宝',
    'patrick': '派大星',
    'squidward': '章鱼哥',
    'justin_bieber': '贾斯汀比伯',
    'female_elegant': '御姐',
    'qiqi': '绮绮',
    'wuwu': '雾雾',
    'azi': '阿梓',
}

REVERSE_NAME_MAP = {v: k for k, v in VOICE_NAME_MAP.items()}


def get_voice_models():
    """扫描RVC/assets/weights/下的.pth文件"""
    from config import RVC_WEIGHTS_DIR, RVC_INDICES_DIR, RVC_LOGS_DIR

    models = []
    if not os.path.exists(RVC_WEIGHTS_DIR):
        return models

    for f in os.listdir(RVC_WEIGHTS_DIR):
        if not f.endswith('.pth'):
            continue

        name = f.replace('.pth', '')

        display_name = VOICE_NAME_MAP.get(name, name)

        index_path = None
        for p in [
            os.path.join(RVC_INDICES_DIR, f"{name}.index"),
            os.path.join(RVC_LOGS_DIR, name, f"{name}.index"),
            os.path.join(RVC_LOGS_DIR, name, "added.index"),
        ]:
            if os.path.exists(p):
                index_path = p
                break

        models.append({
            'display_name': display_name,
            'name': name,
            'has_index': index_path is not None
        })

    return models


def cleanup_old_files(directory, days=FILE_RETENTION_DAYS):
    """清理超过保留时间的文件"""
    now = time.time()
    max_age = days * 24 * 3600
    for filename in os.listdir(directory):
        filepath = os.path.join(directory, filename)
        if os.path.isfile(filepath) and now - os.path.getmtime(filepath) > max_age:
            os.remove(filepath)
