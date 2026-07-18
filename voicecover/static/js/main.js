let selectedVoice = null;
let uploadedFile = null;
let currentTaskId = null;
let pollInterval = null;
let separationTaskId = null;
let separatedVocalPath = null;
let separatedInstPath = null;
let sepPollInterval = null;

// ===== 上传区交互 =====
const dropZone = document.getElementById('dropZone');
const audioInput = document.getElementById('audioInput');

dropZone.addEventListener('click', () => audioInput.click());

dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
});

audioInput.addEventListener('change', (e) => {
    if (e.target.files.length) handleFile(e.target.files[0]);
});

async function handleFile(file) {
    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
        alert('文件超过 50MB 限制');
        return;
    }

    const formData = new FormData();
    formData.append('audio', file);

    try {
        const res = await fetch('/upload', { method: 'POST', body: formData });
        const data = await res.json();

        if (data.status === 'success') {
            uploadedFile = data.data;
            document.getElementById('fileName').textContent =
                `${file.name} (${(file.size / 1024 / 1024).toFixed(1)}MB)`;
            document.getElementById('fileInfo').classList.remove('hidden');
            // 显示原音频播放器
            const player = document.getElementById('originalPlayer');
            player.src = data.data.url;
            document.getElementById('originalPlayerWrapper').classList.remove('hidden');
            resetSeparation();
            updateSeparateButton();
            updateConvertButton();
        } else {
            alert('上传失败: ' + data.message);
        }
    } catch (err) {
        alert('上传失败: 网络错误');
    }
}

function removeFile() {
    uploadedFile = null;
    document.getElementById('fileInfo').classList.add('hidden');
    document.getElementById('originalPlayerWrapper').classList.add('hidden');
    document.getElementById('originalPlayer').src = '';
    document.getElementById('audioInput').value = '';
    resetSeparation();
    updateConvertButton();
}

function resetSeparation() {
    if (sepPollInterval) {
        clearInterval(sepPollInterval);
        sepPollInterval = null;
    }
    separationTaskId = null;
    separatedVocalPath = null;
    separatedInstPath = null;
    document.getElementById('sepProgressSection').classList.add('hidden');
    document.getElementById('sepResultSection').classList.add('hidden');
    document.getElementById('separateBtn').disabled = true;
}

// ===== 音色选择 =====
function selectVoice(card) {
    document.querySelectorAll('.voice-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    selectedVoice = card.dataset.name;
    updateConvertButton();
}

function updateConvertButton() {
    const btn = document.getElementById('convertBtn');
    btn.disabled = !(uploadedFile && selectedVoice);
}

function updateSeparateButton() {
    document.getElementById('separateBtn').disabled = !uploadedFile;
}

// 分离模型选择高亮
document.addEventListener('DOMContentLoaded', () => {
    initPagination();
    document.querySelectorAll('.sep-model-option').forEach(el => {
        const radio = el.querySelector('input[type="radio"]');
        if (radio && radio.checked) el.classList.add('selected');
        el.addEventListener('click', () => {
            document.querySelectorAll('.sep-model-option').forEach(o => o.classList.remove('selected'));
            el.classList.add('selected');
        });
    });
});

// ===== 高级设置 =====
function updatePitchLabel() {
    document.getElementById('pitchLabel').textContent = document.getElementById('pitch').value;
}

function setPitch(val) {
    document.getElementById('pitch').value = val;
    updatePitchLabel();
}

// ===== 人声分离 =====
async function startSeparate() {
    if (!uploadedFile) return;

    if (sepPollInterval) {
        clearInterval(sepPollInterval);
        sepPollInterval = null;
    }

    const btn = document.getElementById('separateBtn');
    btn.disabled = true;
    btn.textContent = '⏳ 分离中...';

    // 获取选中的分离模型和输出格式
    const sepModelRadio = document.querySelector('input[name="sep_model"]:checked');
    const sepModel = sepModelRadio ? sepModelRadio.value : 'htdemucs';
    const fmtRadio = document.querySelector('input[name="sep_output_format"]:checked');
    const outputFormat = fmtRadio ? fmtRadio.value : 'WAV';

    // 隐藏旧结果
    document.getElementById('sepResultSection').classList.add('hidden');
    document.getElementById('sepProgressSection').classList.remove('hidden');
    separationTaskId = null;

    try {
        const res = await fetch('/separate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                file_path: uploadedFile.file_path,
                sep_model: sepModel,
                output_format: outputFormat
            })
        });

        const data = await res.json();
        if (data.status !== 'success') {
            alert('启动分离失败: ' + data.message);
            btn.disabled = false;
            btn.textContent = '🎛️ 分离人声与伴奏';
            return;
        }

        separationTaskId = data.data.task_id;
        sepPollInterval = setInterval(pollSeparationStatus, 2000);
    } catch (err) {
        alert('网络错误，请重试');
        btn.disabled = false;
        btn.textContent = '🎛️ 分离人声与伴奏';
    }
}

async function pollSeparationStatus() {
    const taskId = separationTaskId;
    if (!taskId) return;

    try {
        const res = await fetch(`/separation-status/${taskId}`);
        const data = await res.json();
        const task = data.data;

        document.getElementById('sepStatusText').textContent = task.message || '处理中...';
        document.getElementById('sepProgressFill').style.width = task.progress + '%';
        document.getElementById('sepProgressPercent').textContent = task.progress + '%';

        if (task.status === 'completed') {
            if (separationTaskId !== taskId) return;
            clearInterval(sepPollInterval);
            sepPollInterval = null;

            separatedVocalPath = task.vocal_path;
            separatedInstPath = task.inst_path;

            document.getElementById('sepProgressSection').classList.add('hidden');
            document.getElementById('separateBtn').textContent = '🎛️ 分离人声与伴奏';
            showSeparationResult();
        } else if (task.status === 'failed') {
            if (separationTaskId !== taskId) return;
            clearInterval(sepPollInterval);
            sepPollInterval = null;
            alert('分离失败: ' + (task.message || '未知错误'));
            document.getElementById('sepProgressSection').classList.add('hidden');
            document.getElementById('separateBtn').disabled = false;
            document.getElementById('separateBtn').textContent = '🎛️ 分离人声与伴奏';
        }
    } catch (err) {
        // 轮询失败暂不处理
    }
}

function showSeparationResult() {
    document.getElementById('sepResultSection').classList.remove('hidden');
    document.getElementById('separateBtn').disabled = true;
    document.getElementById('separateBtn').textContent = '✅ 已分离';

    const ts = Date.now();
    const vocalPlayer = document.getElementById('vocalPlayer');
    vocalPlayer.src = `/separation-download/${separationTaskId}/vocal?_=${ts}`;
    document.getElementById('vocalDownloadLink').href = `/separation-download/${separationTaskId}/vocal?_=${ts}`;

    const instPlayer = document.getElementById('instPlayer');
    instPlayer.src = `/separation-download/${separationTaskId}/inst?_=${ts}`;
    document.getElementById('instDownloadLink').href = `/separation-download/${separationTaskId}/inst?_=${ts}`;

    updateConvertButton();
}

// ===== 音色翻页和搜索 =====
let currentPage = 1;
const pageSize = 8;
let allCards = [];

function initPagination() {
    allCards = Array.from(document.querySelectorAll('.voice-card'));
    renderVoices();
}

function prevPage() {
    if (currentPage > 1) { currentPage--; renderVoices(); }
}

function nextPage() {
    if (currentPage * pageSize < allCards.length) { currentPage++; renderVoices(); }
}

function renderVoices() {
    const totalPages = Math.max(1, Math.ceil(allCards.length / pageSize));
    document.getElementById('pageInfo').textContent = `第 ${currentPage} / ${totalPages} 页`;
    document.querySelector('.voice-nav button:first-child').disabled = currentPage <= 1;
    document.querySelector('.voice-nav button:nth-child(3)').disabled = currentPage >= totalPages;

    allCards.forEach((card, i) => {
        const page = Math.floor(i / pageSize) + 1;
        card.style.display = page === currentPage ? 'block' : 'none';
    });
}

function searchVoices() {
    const query = document.getElementById('searchVoice').value.toLowerCase();
    allCards.forEach(card => {
        const name = card.dataset.name.toLowerCase();
        card.style.display = name.includes(query) ? 'block' : 'none';
    });
    document.getElementById('pageInfo').textContent = '搜索结果';
}

// ===== 开始转换 =====
async function startConvert() {
    if (!uploadedFile || !selectedVoice) return;

    // 清理上一次转换的状态
    if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
    }

    const btn = document.getElementById('convertBtn');
    const pitch = document.getElementById('pitch').value;

    btn.disabled = true;
    btn.textContent = '⏳ 正在提交...';

    // 重置结果区和播放器
    document.getElementById('resultSection').classList.add('hidden');
    document.getElementById('progressSection').classList.remove('hidden');
    const player = document.getElementById('resultPlayer');
    player.classList.add('hidden');
    player.src = '';

    // 立即清空任务ID，防止旧 pollStatus 回调误用
    currentTaskId = null;

    try {
        const formatRadio = document.querySelector('input[name="format"]:checked');
        const outputFormat = formatRadio ? formatRadio.value : 'mp3';

        const res = await fetch('/convert', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                file_path: uploadedFile.file_path,
                model: selectedVoice,
                pitch: parseInt(pitch),
                vocal_path: separatedVocalPath || null,
                format: outputFormat
            })
        });

        const data = await res.json();
        if (data.status !== 'success') {
            alert('启动失败: ' + data.message);
            btn.disabled = false;
            btn.textContent = '🚀 开始翻唱';
            return;
        }

        currentTaskId = data.data.task_id;

        btn.disabled = true;
        btn.textContent = '⏳ 转换中...';

        pollInterval = setInterval(pollStatus, 2000);
    } catch (err) {
        alert('网络错误，请重试');
        btn.disabled = false;
        btn.textContent = '🚀 开始翻唱';
    }
}

async function pollStatus() {
    // 捕获发起请求时的任务ID，防止异步响应交叉
    const taskId = currentTaskId;
    if (!taskId) return;

    try {
        const res = await fetch(`/status/${taskId}`);
        const data = await res.json();
        const task = data.data;

        document.getElementById('statusText').textContent = task.message || '处理中...';
        document.getElementById('progressFill').style.width = task.progress + '%';
        document.getElementById('progressPercent').textContent = task.progress + '%';

        if (task.status === 'completed') {
            if (currentTaskId !== taskId) return;  // 已过期
            clearInterval(pollInterval);
            pollInterval = null;
            showResult();
        } else if (task.status === 'failed') {
            if (currentTaskId !== taskId) return;  // 已过期
            clearInterval(pollInterval);
            pollInterval = null;
            alert('转换失败: ' + (task.message || '未知错误'));
            resetAfterFail();
        }
    } catch (err) {
        // 轮询失败暂不处理，下次继续
    }
}

function showResult() {
    document.getElementById('progressSection').classList.add('hidden');
    document.getElementById('resultSection').classList.remove('hidden');
    document.getElementById('convertBtn').disabled = false;
    document.getElementById('convertBtn').textContent = '🚀 开始翻唱';
    const ts = Date.now();
    document.getElementById('downloadLink').href = `/download/${currentTaskId}?_=${ts}`;
}

function resetAfterFail() {
    document.getElementById('progressSection').classList.add('hidden');
    document.getElementById('convertBtn').disabled = false;
    document.getElementById('convertBtn').textContent = '🚀 开始翻唱';
}

function playResult() {
    const player = document.getElementById('resultPlayer');
    const ts = Date.now();
    player.src = `/download/${currentTaskId}?_=${ts}`;
    player.classList.remove('hidden');
    player.load();
    player.play().catch(() => {});
}

function openFolder() {
    alert('成品保存在 voicecover/outputs/ 文件夹中');
}

function cancelConvert() {
    if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
    }
    resetAfterFail();
}

// ===== 联系作者弹窗 =====
function showContact() {
    document.getElementById('contactModal').classList.remove('hidden');
}

function closeContact(e) {
    if (e && e.target !== e.currentTarget) return;
    document.getElementById('contactModal').classList.add('hidden');
}


