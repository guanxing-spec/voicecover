let selectedVoice = null;
let uploadedFile = null;
let currentTaskId = null;
let pollInterval = null;

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
    document.getElementById('audioInput').value = '';
    updateConvertButton();
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

// ===== 高级设置 =====
function toggleSettings() {
    const content = document.getElementById('settingsContent');
    const arrow = document.getElementById('settingsArrow');
    content.classList.toggle('open');
    arrow.textContent = content.classList.contains('open') ? '▲' : '▼';
}

function updatePitchLabel() {
    document.getElementById('pitchLabel').textContent = document.getElementById('pitch').value;
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
        const res = await fetch('/convert', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                file_path: uploadedFile.file_path,
                model: selectedVoice,
                pitch: parseInt(pitch)
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

document.addEventListener('DOMContentLoaded', initPagination);
