/* Attendance Admin Logic */

// DOM Elements
const logsTable = document.getElementById('logs-table-body');
const employeesTable = document.getElementById('employees-table-body');
const logDateInput = document.getElementById('log-date');
const activeCodeDisplay = document.getElementById('display-code');

// 1. Dashboard Load
async function loadDashboard() {
    await fetchDashboard();
    await fetchEmployees();
    fetchLogs();
}

// 2. Dashboard Stats & Manual Code
async function fetchDashboard() {
    const today = new Date().toISOString().split('T')[0];

    // Get Active Code
    const { data: codeData } = await window.supabaseClient
        .from('attendance_settings')
        .select('daily_code')
        .eq('id', 1)
        .single();

    // Set Input Value
    const input = document.getElementById('manual-code-input');
    if (codeData && input) {
        input.value = codeData.daily_code;
    }

    // Get Stats
    const { count: presentCount } = await window.supabaseClient
        .from('attendance_logs')
        .select('*', { count: 'exact', head: true })
        .eq('date_logged', today);

    const statPresent = document.getElementById('stat-present');
    if (statPresent) statPresent.innerText = presentCount || 0;

    const { count: activeCount } = await window.supabaseClient
        .from('attendance_employees')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'Active');

    const statEmployees = document.getElementById('stat-employees');
    if (statEmployees) statEmployees.innerText = activeCount || 0;
}

// 3. Set Daily Code (Manual)
async function setDailyCode() {
    const input = document.getElementById('manual-code-input');
    if (!input) return;

    const code = input.value.trim();
    if (!code || code.length < 4) {
        alert('Please enter a valid 4-6 digit code.');
        return;
    }

    // Get the ID first to ensure we update the correct row
    const { data: settings } = await window.supabaseClient
        .from('attendance_settings')
        .select('id')
        .single();

    let error;

    if (settings && settings.id) {
        const res = await window.supabaseClient
            .from('attendance_settings')
            .update({ daily_code: code, updated_at: new Date() })
            .eq('id', settings.id);
        error = res.error;
    } else {
        // Fallback or Insert if empty
        const res = await window.supabaseClient
            .from('attendance_settings')
            .insert([{ daily_code: code, retention_days: 30 }]);
        error = res.error;
    }

    if (error) {
        alert('Error updating code: ' + error.message);
    } else {
        alert('Daily Code Updated!');
        fetchDashboard();
    }
}

// 2. Logs
// 2. Logs
async function fetchLogs() {
    let date = logDateInput.value;
    if (!date) {
        date = new Date().toISOString().split('T')[0];
        if (logDateInput) logDateInput.value = date;
    }

    const { data, error } = await window.supabaseClient
        .from('attendance_logs')
        .select('*')
        .eq('date_logged', date)
        .order('check_in_time', { ascending: false });

    if (error) {
        logsTable.innerHTML = `<tr><td colspan="6">Error: ${error.message}</td></tr>`;
        return;
    }

    if (data.length === 0) {
        logsTable.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:1rem; color:#9ca3af;">No records for this date.</td></tr>`;
        return;
    }

    logsTable.innerHTML = data.map(log => `
        <tr>
            <td><input type="checkbox" class="log-checkbox" value="${log.id}" onchange="updateDeleteButton()"></td>
            <td>${new Date(log.check_in_time).toLocaleTimeString()}</td>
            <td>${log.employee_name}</td>
            <td>
                ${log.verification_method} 
                ${log.match_score !== null ? `<br><small style="color:${getScoreColor(log.match_score)}">Dist: ${Math.round(log.match_score * 100) / 100}</small>` : ''}
            </td>
            <td>
                ${log.selfie_url
            ? `<a href="${log.selfie_url}" target="_blank" style="color:blue; text-decoration:underline;">View Selfie</a>`
            : `<span style="color:#9ca3af; font-style:italic;">--</span>`
        }
            </td>
            <td>
                <button onclick="deleteLog('${log.id}')" style="color:red; background:none; border:none; cursor:pointer;">🗑️</button>
            </td>
        </tr>
    `).join('');

    // Reset Select All
    document.getElementById('select-all-logs').checked = false;
    updateDeleteButton();
}

function getScoreColor(score) {
    if (score < 0.45) return 'green';
    if (score < 0.6) return 'orange';
    return 'red';
}

// Bulk Actions
window.toggleSelectAll = function (source) {
    const checkboxes = document.querySelectorAll('.log-checkbox');
    checkboxes.forEach(cb => cb.checked = source.checked);
    updateDeleteButton();
}

window.updateDeleteButton = function () {
    const checkedBoxes = document.querySelectorAll('.log-checkbox:checked');
    const btn = document.getElementById('bulk-delete-btn');
    const countSpan = document.getElementById('selected-count');

    if (checkedBoxes && btn) {
        if (checkedBoxes.length > 0) {
            btn.style.display = 'block';
            countSpan.innerText = checkedBoxes.length;
        } else {
            btn.style.display = 'none';
        }
    }
}

window.deleteSelectedLogs = async function () {
    const checkedBoxes = document.querySelectorAll('.log-checkbox:checked');
    const ids = Array.from(checkedBoxes).map(cb => cb.value);

    if (ids.length === 0) return;

    if (!confirm(`Are you sure you want to delete ${ids.length} records?`)) return;

    const { error } = await window.supabaseClient
        .from('attendance_logs')
        .delete()
        .in('id', ids);

    if (error) {
        alert('Error: ' + error.message);
    } else {
        fetchLogs();
    }
}

async function deleteLog(id) {
    if (!confirm('Delete this record?')) return;
    await window.supabaseClient.from('attendance_logs').delete().eq('id', id);
    fetchLogs();
}

// 3. Employees
async function fetchEmployees() {
    const { data, error } = await window.supabaseClient
        .from('attendance_employees')
        .select('*')
        .order('name');

    if (error) return;

    employeesTable.innerHTML = data.map(emp => `
        <tr>
            <td>
                <div style="width:40px; height:40px; border-radius:50%; background:#f3f4f6; overflow:hidden;">
                    ${emp.photo_url ? `<img src="${emp.photo_url}" style="width:100%; height:100%; object-fit:cover;">` : '<span style="display:flex; justify-content:center; align-items:center; height:100%; color:#9ca3af;">👤</span>'}
                </div>
            </td>
            <td>${emp.employee_id}</td>
            <td><code>${emp.pin || '----'}</code></td>
            <td>${emp.name}</td>
            <td><span class="status-badge ${emp.status === 'Active' ? 'status-active' : 'status-inactive'}">${emp.status}</span></td>
            <td>${emp.join_date}</td>
            <td>
                <button onclick="deleteEmployee('${emp.id}')" style="color:red; background:none; border:none; cursor:pointer;">🗑️</button>
            </td>
        </tr>
    `).join('');

    // Update Stats
    document.getElementById('stat-employees').innerText = data.filter(e => e.status === 'Active').length;
}

// 4. Add Employee Logic
function openAddEmployeeModal() { document.getElementById('employee-modal').style.display = 'flex'; }
function closeModal() { document.getElementById('employee-modal').style.display = 'none'; }

function previewImage(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function (e) {
            const img = document.getElementById('preview-photo');
            img.src = e.target.result;
            img.style.display = 'block';
            document.getElementById('preview-placeholder').style.display = 'none';
        }
        reader.readAsDataURL(input.files[0]);
    }
}

document.getElementById('add-employee-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerText;
    submitBtn.innerText = 'Saving...';
    submitBtn.disabled = true;

    try {
        const formData = new FormData(e.target);

        // 1. Upload Photo if exists
        let photoUrl = null;
        const photoFile = document.getElementById('photo-input').files[0];

        if (photoFile) {
            // Compress Image (WebP)
            const compressedBlob = await new Promise((resolve, reject) => {
                const img = new Image();
                img.src = URL.createObjectURL(photoFile);
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    // Resize logic (Max 800px)
                    const MAX_SIZE = 800;
                    let width = img.width;
                    let height = img.height;

                    if (width > height) {
                        if (width > MAX_SIZE) {
                            height *= MAX_SIZE / width;
                            width = MAX_SIZE;
                        }
                    } else {
                        if (height > MAX_SIZE) {
                            width *= MAX_SIZE / height;
                            height = MAX_SIZE;
                        }
                    }

                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);

                    canvas.toBlob((blob) => {
                        if (blob) resolve(blob);
                        else reject(new Error('Compression failed'));
                    }, 'image/webp', 0.75);
                };
                img.onerror = () => reject(new Error('Invalid Image'));
            });

            // Clean filename
            const uniqueId = Date.now();
            const cleanName = photoFile.name.split('.')[0].replace(/[^a-zA-Z0-9]/g, '');
            const filename = `profiles/${uniqueId}_${cleanName}.webp`;

            const { data: uploadData, error: uploadError } = await window.supabaseClient
                .storage
                .from('attendance_proofs')
                .upload(filename, compressedBlob, {
                    contentType: 'image/webp',
                    upsert: true
                });

            if (uploadError) throw new Error('Photo upload failed: ' + uploadError.message);

            const { data: { publicUrl } } = window.supabaseClient
                .storage
                .from('attendance_proofs')
                .getPublicUrl(filename);

            photoUrl = publicUrl;
        }

        // 2. Insert Record
        const payload = {
            name: formData.get('name'),
            employee_id: formData.get('employee_id'),
            pin: formData.get('pin'),
            photo_url: photoUrl
        };

        const { error } = await window.supabaseClient
            .from('attendance_employees')
            .insert([payload]);

        if (error) throw error;

        closeModal();
        fetchEmployees();
        e.target.reset();
        // Reset preview
        document.getElementById('preview-photo').style.display = 'none';
        document.getElementById('preview-placeholder').style.display = 'block';

    } catch (err) {
        alert('Error: ' + err.message);
    } finally {
        submitBtn.innerText = originalText;
        submitBtn.disabled = false;
    }
});

async function deleteEmployee(id) {
    if (!confirm('Delete this employee? Logs will remain.')) return;
    await window.supabaseClient.from('attendance_employees').delete().eq('id', id);
    fetchEmployees();
}

// 5. Stats
async function fetchStats() {
    const today = new Date().toISOString().split('T')[0];
    const { count } = await window.supabaseClient
        .from('attendance_logs')
        .select('*', { count: 'exact', head: true })
        .eq('date_logged', today);

    document.getElementById('stat-present').innerText = count || 0;
}

// 6. CSV Export
function exportCSV() {
    const rows = [];
    // Header
    rows.push(['Time', 'Employee Name', 'Method', 'Selfie URL']);

    // Data (parse from DOM for simplicity, or refetch)
    const trs = logsTable.querySelectorAll('tr');
    trs.forEach(tr => {
        const tds = tr.querySelectorAll('td');
        if (tds.length > 1) { // Skip "No records" row
            rows.push([
                tds[0].innerText,
                tds[1].innerText,
                tds[2].innerText,
                tr.querySelector('a').href
            ]);
        }
    });

    let csvContent = "data:text/csv;charset=utf-8,"
        + rows.map(e => e.join(",")).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "attendance_report.csv");
    document.body.appendChild(link);
    link.click();
}

// 7. Auto Cleanup (Retention)
async function runAutoCleanup() {
    const { data: settings } = await window.supabaseClient.from('attendance_settings').select('*').single();
    if (!settings) return;

    const lastRun = settings.last_cleanup_run ? new Date(settings.last_cleanup_run) : new Date(0);
    const now = new Date();

    // Run only if not run in last 24 hours
    const hoursSinceLast = (now - lastRun) / (1000 * 60 * 60);
    if (hoursSinceLast < 24) return;

    // Calculate cutoff
    const days = settings.retention_days || 30;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffStr = cutoffDate.toISOString().split('T')[0];

    console.log('Running Auto-Cleanup for logs before:', cutoffStr);

    // Delete Logs
    const { error } = await window.supabaseClient
        .from('attendance_logs')
        .delete()
        .lt('date_logged', cutoffStr);

    if (!error) {
        // Update last run time
        await window.supabaseClient
            .from('attendance_settings')
            .update({ last_cleanup_run: now })
            .eq('id', settings.id);
    }
}

// Tabs
window.switchTab = function (tabName) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active')); // Reset buttons

    document.getElementById(`tab-${tabName}`).classList.add('active');
    // Highlight button? Need to select specific button. 
    // Just simple toggle:
    const btns = document.querySelectorAll('.tab-btn');
    if (tabName === 'logs') btns[0].classList.add('active');
    if (tabName === 'employees') btns[1].classList.add('active');
    if (tabName === 'settings') btns[2].classList.add('active');
}

document.addEventListener('DOMContentLoaded', async () => {
    // Check Auth
    if (typeof checkAuth === 'function') checkAuth();

    // Set date to today default
    if (logDateInput && !logDateInput.value) {
        logDateInput.value = new Date().toISOString().split('T')[0];
    }

    // Initial data fetch
    await loadDashboard();

    // Event Listeners
    if (logDateInput) logDateInput.addEventListener('change', fetchLogs);

    // Helper for photo input (if not inline)
    const photoInp = document.getElementById('photo-input');
    if (photoInp) {
        photoInp.addEventListener('change', function () { previewImage(this); });
    }

    // Auto Cleanup Trigger
    runAutoCleanup();

    // 2-Minute Selfie Cleanup
    cleanupExpiredSelfies();
    setInterval(cleanupExpiredSelfies, 30 * 1000);
});

// 8. Auto Delete Selfies (2 Minutes)
async function cleanupExpiredSelfies() {
    // console.log('Running 2-minute selfie cleanup...');
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();

    // 1. Find logs with selfies older than 2 mins
    const { data: expiredLogs, error } = await window.supabaseClient
        .from('attendance_logs')
        .select('id, selfie_url')
        .lt('check_in_time', twoMinutesAgo)
        .not('selfie_url', 'is', null);

    if (error || !expiredLogs || expiredLogs.length === 0) return;

    console.log(`Found ${expiredLogs.length} expired selfies to delete.`);

    for (const log of expiredLogs) {
        if (!log.selfie_url) continue;

        try {
            // Extract path: ".../attendance_proofs/yyyy-mm-dd_empId.jpg"
            const urlParts = log.selfie_url.split('/attendance_proofs/');
            if (urlParts.length < 2) continue;
            const path = urlParts[1]; // The path inside the bucket

            // Delete from Storage
            const { error: delError } = await window.supabaseClient
                .storage
                .from('attendance_proofs')
                .remove([path]);

            if (delError) {
                console.error('Error deleting file:', delError);
                // If file not found, we should still update DB to avoid infinite loop
            }

            // Update Log - set URL to null
            await window.supabaseClient
                .from('attendance_logs')
                .update({
                    selfie_url: null,
                })
                .eq('id', log.id);

        } catch (err) {
            console.error('Cleanup error for log', log.id, err);
        }
    }

    // If we acted, refresh logs if currently viewing them
    const logsOpen = document.getElementById('tab-logs').classList.contains('active');
    if (logsOpen) fetchLogs();
}
