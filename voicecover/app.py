from flask import Flask, render_template, request, jsonify, send_file, make_response
import os
from config import UPLOAD_DIR, OUTPUT_DIR, SEPARATION_DIR
from utils import get_voice_models, cleanup_old_files
from tasks import start_conversion, get_task_status, start_separation_task, get_separation_task_status

app = Flask(__name__)

ALLOWED_PATHS = [
    os.path.abspath(UPLOAD_DIR),
    os.path.abspath(SEPARATION_DIR),
    os.path.abspath(OUTPUT_DIR),
]


def _is_safe_path(path):
    """验证文件路径在允许的目录内，防止路径穿越"""
    real = os.path.abspath(os.path.realpath(path))
    return any(real.startswith(base + os.sep) or real == base for base in ALLOWED_PATHS)


@app.route('/')
def index():
    models = get_voice_models()
    return render_template('index.html', models=models)


@app.route('/models', methods=['GET'])
def list_models():
    return jsonify({'status': 'success', 'data': get_voice_models()})


@app.route('/upload', methods=['POST'])
def upload():
    if 'audio' not in request.files:
        return jsonify({'status': 'error', 'message': '没有上传文件'}), 400

    file = request.files['audio']
    if file.filename == '':
        return jsonify({'status': 'error', 'message': '文件名为空'}), 400

    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ['.mp3', '.wav', '.flac', '.m4a']:
        return jsonify({'status': 'error', 'message': '不支持的格式'}), 400

    filename = f"{os.urandom(4).hex()}{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)
    file.save(filepath)

    return jsonify({
        'status': 'success',
        'data': {'file_path': filepath, 'filename': file.filename, 'url': f'/static/uploads/{filename}'}
    })


@app.route('/convert', methods=['POST'])
def convert():
    data = request.get_json() or request.form
    file_path = data.get('file_path')
    model_name = data.get('model')
    pitch = int(data.get('pitch', 0))
    vocal_path = data.get('vocal_path')
    output_format = data.get('format', 'mp3').lower()

    if not file_path or not model_name:
        return jsonify({'status': 'error', 'message': '缺少参数'}), 400

    if not os.path.exists(file_path):
        return jsonify({'status': 'error', 'message': '文件不存在'}), 404

    if not _is_safe_path(file_path):
        return jsonify({'status': 'error', 'message': '非法的文件路径'}), 400

    if output_format not in ('wav', 'mp3', 'flac'):
        output_format = 'mp3'

    if vocal_path and not _is_safe_path(vocal_path):
        return jsonify({'status': 'error', 'message': '非法的音频路径'}), 400

    task_id = start_conversion(file_path, model_name, pitch, vocal_path=vocal_path, output_format=output_format)
    return jsonify({'status': 'success', 'data': {'task_id': task_id}})


@app.route('/separate', methods=['POST'])
def separate():
    data = request.get_json() or request.form
    file_path = data.get('file_path')
    sep_model = data.get('sep_model', 'htdemucs')
    output_format = data.get('output_format', 'WAV').upper()

    if not file_path:
        return jsonify({'status': 'error', 'message': '缺少参数'}), 400

    if not os.path.exists(file_path):
        return jsonify({'status': 'error', 'message': '文件不存在'}), 404

    if not _is_safe_path(file_path):
        return jsonify({'status': 'error', 'message': '非法的文件路径'}), 400

    if sep_model not in ('htdemucs', 'kim_vocal_2'):
        return jsonify({'status': 'error', 'message': '不支持的分离模型'}), 400

    if output_format not in ('WAV', 'MP3', 'FLAC'):
        return jsonify({'status': 'error', 'message': '不支持的输出格式'}), 400

    task_id = start_separation_task(file_path, model_type=sep_model, output_format=output_format)
    return jsonify({'status': 'success', 'data': {'task_id': task_id}})


@app.route('/separation-status/<task_id>', methods=['GET'])
def separation_status(task_id):
    return jsonify({'status': 'success', 'data': get_separation_task_status(task_id)})


@app.route('/separation-download/<task_id>/<stem_type>', methods=['GET'])
def separation_download(task_id, stem_type):
    info = get_separation_task_status(task_id)
    if info.get('status') != 'completed':
        return jsonify({'status': 'error', 'message': '分离未完成'}), 400

    stem_path = info.get('vocal_path') if stem_type == 'vocal' else info.get('inst_path')
    if not stem_path or not os.path.exists(stem_path):
        return jsonify({'status': 'error', 'message': '文件不存在'}), 404

    response = make_response(send_file(stem_path, as_attachment=False))
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    return response


@app.route('/status/<task_id>', methods=['GET'])
def status(task_id):
    return jsonify({'status': 'success', 'data': get_task_status(task_id)})


@app.route('/download/<task_id>', methods=['GET'])
def download(task_id):
    info = get_task_status(task_id)
    if info.get('status') != 'completed':
        return jsonify({'status': 'error', 'message': '任务未完成'}), 400

    output_path = info.get('output_path')
    if not output_path or not os.path.exists(output_path):
        return jsonify({'status': 'error', 'message': '文件不存在'}), 404

    response = make_response(send_file(output_path, as_attachment=True))
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response


@app.route('/cleanup', methods=['POST'])
def manual_cleanup():
    cleanup_old_files(UPLOAD_DIR, days=0)
    cleanup_old_files(OUTPUT_DIR, days=0)
    return jsonify({'status': 'success', 'message': '清理完成'})


if __name__ == '__main__':
    app.run(debug=True, use_reloader=False, host='0.0.0.0', port=5000)
