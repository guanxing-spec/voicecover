from flask import Flask, render_template, request, jsonify, send_file, make_response
import os
from config import UPLOAD_DIR, OUTPUT_DIR
from utils import get_voice_models, cleanup_old_files
from tasks import start_conversion, get_task_status

app = Flask(__name__)


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
        'data': {'file_path': filepath, 'filename': file.filename}
    })


@app.route('/convert', methods=['POST'])
def convert():
    data = request.get_json() or request.form
    file_path = data.get('file_path')
    model_name = data.get('model')
    pitch = int(data.get('pitch', 0))

    if not file_path or not model_name:
        return jsonify({'status': 'error', 'message': '缺少参数'}), 400

    if not os.path.exists(file_path):
        return jsonify({'status': 'error', 'message': '文件不存在'}), 404

    task_id = start_conversion(file_path, model_name, pitch)
    return jsonify({'status': 'success', 'data': {'task_id': task_id}})


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
    app.run(debug=True, host='0.0.0.0', port=5000)
