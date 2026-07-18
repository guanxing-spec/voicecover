// ===== 音频预存管理 =====

const CATEGORIES = [
    { key: 'uploads',   title: '原始音频', icon: '📁' },
    { key: 'separated', title: '分离结果', icon: '🎤' },
    { key: 'outputs',   title: '翻唱成品', icon: '🎵' },
];

let allFiles = []; // 用于全选追踪

document.addEventListener('DOMContentLoaded', loadFiles);

async function loadFiles() {
    try {
        const res = await fetch('/api/files');
        const json = await res.json();
        if (json.status === 'success') {
            renderFiles(json.data);
        }
    } catch (_) {
        showToast('加载文件列表失败');
    }
}

function renderFiles(data) {
    const container = document.getElementById('fileCategories');
    container.innerHTML = '';
    allFiles = [];

    for (const cat of CATEGORIES) {
        const files = data[cat.key] || [];
        allFiles.push(...files.map(f => ({ ...f, catKey: cat.key })));

        const section = document.createElement('div');
        section.className = 'file-category';

        const header = document.createElement('div');
        header.className = 'file-category-header';
        header.textContent = `${cat.icon} ${cat.title} (${files.length})`;
        section.appendChild(header);

        if (files.length === 0) {
            const empty = document.createElement('p');
            empty.className = 'empty-hint';
            empty.textContent = '暂无文件';
            section.appendChild(empty);
        } else {
            const list = document.createElement('div');
            list.className = 'file-list';
            for (const f of files) {
                const item = document.createElement('div');
                item.className = 'file-item';
                item.dataset.path = f.path;

                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.className = 'file-cb';
                cb.value = f.path;
                cb.addEventListener('change', updateSelection);

                const nameSpan = document.createElement('span');
                nameSpan.className = 'file-name';
                nameSpan.textContent = f.name;

                const sizeSpan = document.createElement('span');
                sizeSpan.className = 'file-size';
                sizeSpan.textContent = formatSize(f.size);

                const dateSpan = document.createElement('span');
                dateSpan.className = 'file-date';
                dateSpan.textContent = formatDate(f.mtime);

                const delBtn = document.createElement('button');
                delBtn.className = 'file-delete-btn';
                delBtn.textContent = '🗑️';
                delBtn.title = '删除';
                delBtn.addEventListener('click', () => deleteSingle(f.path));

                item.append(cb, nameSpan, sizeSpan, dateSpan, delBtn);
                list.appendChild(item);
            }
            section.appendChild(list);
        }

        container.appendChild(section);
    }

    updateSelection();
}

function toggleSelectAll() {
    const checked = document.getElementById('selectAllCheckbox').checked;
    document.querySelectorAll('.file-cb').forEach(cb => cb.checked = checked);
    updateSelection();
}

function updateSelection() {
    const checkboxes = document.querySelectorAll('.file-cb');
    const total = checkboxes.length;
    const checked = document.querySelectorAll('.file-cb:checked').length;
    const selectAll = document.getElementById('selectAllCheckbox');
    const delBtn = document.getElementById('deleteSelectedBtn');
    const countEl = document.getElementById('selectedCount');

    if (selectAll) {
        selectAll.checked = total > 0 && checked === total;
        selectAll.indeterminate = checked > 0 && checked < total;
    }
    delBtn.disabled = checked === 0;
    countEl.textContent = checked > 0 ? `已选中 ${checked} 项` : '';
}

async function deleteSingle(path) {
    if (!confirm('确定要删除此文件吗？')) return;
    try {
        const res = await fetch('/api/files/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ files: [path] }),
        });
        const json = await res.json();
        if (json.status === 'success') {
            showToast('已删除');
            loadFiles();
        } else {
            showToast('删除失败');
        }
    } catch (_) {
        showToast('网络错误');
    }
}

async function deleteSelected() {
    const paths = Array.from(document.querySelectorAll('.file-cb:checked')).map(cb => cb.value);
    if (paths.length === 0) return;
    if (!confirm(`确定要删除选中的 ${paths.length} 个文件吗？`)) return;

    try {
        const res = await fetch('/api/files/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ files: paths }),
        });
        const json = await res.json();
        if (json.status === 'success') {
            showToast(`已删除 ${json.data.deleted.length} 个文件`);
            loadFiles();
        } else {
            showToast('删除失败');
        }
    } catch (_) {
        showToast('网络错误');
    }
}

function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const s = bytes / Math.pow(1024, i);
    return (i === 0 ? s : s.toFixed(1)) + ' ' + units[i];
}

function formatDate(ts) {
    const d = new Date(ts * 1000);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function showToast(msg) {
    let el = document.querySelector('.toast');
    if (!el) {
        el = document.createElement('div');
        el.className = 'toast';
        document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.remove('show'), 2500);
}
