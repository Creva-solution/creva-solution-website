// CRM Logic

// DOM Elements
const tableBody = document.getElementById('client-table-body');
const drawer = document.getElementById('client-drawer');
const overlay = document.getElementById('client-drawer-overlay');
const globalSearch = document.getElementById('global-search');

let currentFilter = 'all';
let allClients = []; // Local cache for filtering

// === Initial Load ===
document.addEventListener('DOMContentLoaded', () => {
    fetchCrmClients();
    setupSearch();
    updateCounts(); // Initial counters
});

// === Data Fetching ===
async function fetchCrmClients() {
    if (!window.supabaseClient) {
        console.error('Supabase not initialized');
        return;
    }

    const { data, error } = await window.supabaseClient
        .from('crm_clients')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        alert('Error fetching clients: ' + error.message);
        return;
    }

    allClients = data;
    renderTable(allClients);
    updateCounts();
}

async function updateCounts() {
    // Simple client-side internal counting for responsiveness
    // In production with large data, use separate COUNT queries
    const today = new Date().toISOString().split('T')[0];

    const countTotal = allClients.length;
    const countToday = allClients.filter(c => c.next_follow_up === today).length;
    // const countPending = allClients.filter(c => c.status === 'New' || c.call_status === 'Callback Pending').length;
    const countPending = allClients.filter(c => c.next_follow_up && c.next_follow_up < today).length; // Overdue

    if (document.getElementById('count-all')) document.getElementById('count-all').innerText = countTotal;
    if (document.getElementById('count-today')) document.getElementById('count-today').innerText = countToday;
    if (document.getElementById('count-pending')) document.getElementById('count-pending').innerText = countPending;
}

// === Rendering ===
function renderTable(clients) {
    if (clients.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 2rem;">No clients found.</td></tr>`;
        return;
    }

    tableBody.innerHTML = clients.map(client => {
        const statusClass = getStatusClass(client.status);
        const lastCalled = client.last_called_at ? new Date(client.last_called_at).toLocaleDateString() : '-';
        const nextFollow = client.next_follow_up ? new Date(client.next_follow_up).toLocaleDateString() : '-';

        return `
            <tr onclick="openClientDetails('${client.id}')" style="cursor:pointer;">
                <td data-label="Client">
                    <div class="client-name">${escapeHtml(client.client_name)}</div>
                    <div class="client-business">${escapeHtml(client.business_name || '')}</div>
                </td>
                <td data-label="Service">${escapeHtml(client.service_type || '-')}</td>
                <td data-label="Status"><span class="status-badge ${statusClass}">${escapeHtml(client.status)}</span></td>
                <td data-label="Next Follow-up">${nextFollow}</td>
                <td data-label="Last Call">${lastCalled}</td>
                <td data-label="Actions" onclick="event.stopPropagation()">
                    <button class="btn-icon" onclick="showActionPopover(event, '${client.whatsapp_number}', '${client.phone_number || client.whatsapp_number}')">📞</button>
                    <!-- <button class="btn-icon">✏️</button> -->
                </td>
            </tr>
        `;
    }).join('');
}

function getStatusClass(status) {
    switch (status) {
        case 'New': return 'status-new';
        case 'In Discussion': return 'status-discussion';
        case 'Confirmed': return 'status-confirmed';
        case 'In Progress': return 'status-progress';
        case 'Completed': return 'status-completed';
        default: return 'status-completed';
    }
}

function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// === Sidebar Filtering ===
function filterClients(mode) {
    // Update UI active state
    document.querySelectorAll('.filter-item').forEach(el => el.classList.remove('active'));
    // Find element that triggered this? No simple way without passing 'this' or ID. 
    // Just re-render based on mode.

    currentFilter = mode;
    let filtered = [];
    const today = new Date().toISOString().split('T')[0];

    if (mode === 'all') {
        filtered = allClients;
    } else if (mode === 'followup_today') {
        filtered = allClients.filter(c => c.next_follow_up === today);
    } else if (mode === 'followup_pending') {
        filtered = allClients.filter(c => c.next_follow_up && c.next_follow_up < today);
    } else {
        // Status filter
        filtered = allClients.filter(c => c.status === mode);
    }

    // Update Title
    document.getElementById('page-title').innerText = mode === 'all' ? 'All Clients' : mode.replace('_', ' ');
    renderTable(filtered);
}

// === Search ===
function setupSearch() {
    globalSearch.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        if (!term) {
            filterClients(currentFilter); // Restore current filter
            return;
        }

        const filtered = allClients.filter(c =>
            c.client_name.toLowerCase().includes(term) ||
            c.business_name.toLowerCase().includes(term) ||
            (c.phone_number && c.phone_number.includes(term)) ||
            (c.whatsapp_number && c.whatsapp_number.includes(term))
        );
        renderTable(filtered);
    });
}


// === Drawer / Modal Logic ===
function closeDrawer() {
    drawer.classList.remove('open');
    overlay.classList.remove('open');
}

// 1. Add Client Mode
function openAddClientModal() {
    drawer.innerHTML = `
        <div class="drawer-header">
            <h2>Add New Client</h2>
            <button class="btn-icon" onclick="closeDrawer()">✕</button>
        </div>
        <div class="drawer-body">
            <form id="add-crm-form">
                <div class="form-group">
                    <label>Client Name *</label>
                    <input type="text" name="client_name" class="form-control" required>
                </div>
                <div class="form-group">
                    <label>Business Name *</label>
                    <input type="text" name="business_name" class="form-control" required>
                </div>
                <div class="form-group">
                    <label>WhatsApp Number *</label>
                    <input type="text" name="whatsapp_number" class="form-control" required placeholder="+91...">
                </div>
                <div class="form-group">
                    <label>Phone Number (Optional)</label>
                    <input type="text" name="phone_number" class="form-control">
                </div>
                <div class="form-group">
                    <label>Email (Optional)</label>
                    <input type="email" name="email" class="form-control">
                </div>
                <div class="form-group">
                    <label>Location (Optional)</label>
                    <input type="text" name="location" class="form-control">
                </div>
                <div class="form-group">
                    <label>Service Type</label>
                    <select name="service_type" class="form-control">
                        <option value="Website">Website</option>
                        <option value="App">App</option>
                        <option value="Digital Marketing">Digital Marketing</option>
                        <option value="Civil">Civil</option>
                        <option value="UI/UX">UI/UX</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Status</label>
                    <select name="status" class="form-control">
                        <option value="New">New</option>
                        <option value="In Discussion">In Discussion</option>
                        <option value="Confirmed">Confirmed</option>                  
                    </select>
                </div>
                <button type="submit" class="btn-primary" style="margin-top:1rem;">Save Client</button>
            </form>
        </div>
    `;

    // Close sidebar if open (mobile)
    document.getElementById('crm-sidebar').classList.remove('show');
    document.getElementById('sidebar-overlay').classList.remove('show');

    overlay.classList.add('open');
    drawer.classList.add('open');

    // Handle Submit
    document.getElementById('add-crm-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const dataPayload = Object.fromEntries(formData.entries());

        const { error } = await window.supabaseClient
            .from('crm_clients')
            .insert([dataPayload]);

        if (error) {
            alert('Error adding client: ' + error.message);
        } else {
            closeDrawer();
            fetchCrmClients(); // Refresh
        }
    });
}

// 2. View/Edit Client Mode
async function openClientDetails(clientId) {
    // Fetch details including notes
    const client = allClients.find(c => c.id === clientId);
    if (!client) return;

    // Fetch notes separately
    const { data: notes } = await window.supabaseClient
        .from('crm_notes')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });

    // Render Drawer
    drawer.innerHTML = `
        <div class="drawer-header">
            <div>
                <h2 style="margin-bottom:0.25rem;">${escapeHtml(client.client_name)}</h2>
                <span class="status-badge ${getStatusClass(client.status)}">${client.status}</span>
            </div>
            <button class="btn-icon" onclick="closeDrawer()">✕</button>
        </div>
        
        <div class="drawer-body">
            <!-- Details Grid -->
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 2rem;">
                <div><small style="color:#9ca3af">Business</small><div>${escapeHtml(client.business_name)}</div></div>
                <div><small style="color:#9ca3af">WhatsApp</small>
                    <div style="display:flex; align-items:center; gap:0.5rem;">
                        ${escapeHtml(client.whatsapp_number)}
                        <a href="https://wa.me/${client.whatsapp_number.replace(/\D/g, '')}" target="_blank" style="text-decoration:none;">💬</a>
                    </div>
                </div>
                <div><small style="color:#9ca3af">Phone</small><div>${escapeHtml(client.phone_number || '-')}</div></div>
                <div><small style="color:#9ca3af">Service</small><div>${escapeHtml(client.service_type)}</div></div>
            </div>

            <!-- Follow Up Section -->
            <div style="background:#f9fafb; padding:1rem; border-radius:6px; margin-bottom:2rem;">
                <h4 style="margin-bottom:0.5rem; color:#4b5563;">Status & Follow-up</h4>
                <div style="display:flex; gap:1rem; margin-bottom:0.5rem;">
                    <select id="update-status" class="form-control" style="font-size:0.9rem;">
                        <option value="New" ${client.status === 'New' ? 'selected' : ''}>New</option>
                        <option value="In Discussion" ${client.status === 'In Discussion' ? 'selected' : ''}>In Discussion</option>
                        <option value="Confirmed" ${client.status === 'Confirmed' ? 'selected' : ''}>Confirmed</option>
                        <option value="In Progress" ${client.status === 'In Progress' ? 'selected' : ''}>In Progress</option>
                        <option value="Completed" ${client.status === 'Completed' ? 'selected' : ''}>Completed</option>
                    </select>
                </div>
                 <div style="display:flex; gap:1rem; align-items:flex-end;">
                    <div style="flex:1;">
                        <label style="font-size:0.8rem;">Next Call Date</label>
                        <div class="quick-date-group">
                            <button class="btn-quick-date" onclick="setFollowUpDate(1)">+1 Day</button>
                            <button class="btn-quick-date" onclick="setFollowUpDate(2)">+2 Days</button>
                            <button class="btn-quick-date" onclick="setFollowUpDate(7)">+1 Week</button>
                        </div>
                        <input type="date" id="update-followup" class="form-control" value="${client.next_follow_up || ''}">
                    </div>
                    <button class="btn-primary" style="width:auto; padding:0.5rem 1rem;" onclick="updateClientStatus('${client.id}')">Update</button>
                 </div>
            </div>

            <!-- Notes Section -->
            <h3 style="border-bottom:1px solid #eee; padding-bottom:0.5rem; margin-bottom:1rem;">Notes & Requirements</h3>
            
            <div style="margin-bottom:1.5rem;">
                <textarea id="new-note-text" class="form-control" rows="3" placeholder="Add a new note, summary, or requirement..."></textarea>
                <button class="btn-primary" style="margin-top:0.5rem; width:100%;" onclick="addNote('${client.id}')">Add Note</button>
            </div>

            <div id="notes-list">
                ${notes && notes.length > 0 ? notes.map(n => `
                    <div class="note-item">
                        <div class="note-meta">${new Date(n.created_at).toLocaleString()} (${n.note_type})</div>
                        <div class="note-content">${escapeHtml(n.content)}</div>
                    </div>
                `).join('') : '<p style="color:#9ca3af; font-size:0.9rem;">No notes yet.</p>'}
            </div>
        </div>
    `;

    overlay.classList.add('open');
    drawer.classList.add('open');
}

// === Actions ===
async function updateClientStatus(id) {
    const newStatus = document.getElementById('update-status').value;
    const newDate = document.getElementById('update-followup').value;

    const updateData = { status: newStatus };
    if (newDate) updateData.next_follow_up = newDate;

    const { error } = await window.supabaseClient
        .from('crm_clients')
        .update(updateData)
        .eq('id', id);

    if (error) alert('Error updating: ' + error.message);
    else {
        // Refresh local data & UI without full reload if possible, but full reload is safer for sync
        fetchCrmClients();
        closeDrawer();
    }
}

function setFollowUpDate(days) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    document.getElementById('update-followup').value = date.toISOString().split('T')[0];
}

async function addNote(id) {
    const text = document.getElementById('new-note-text').value;
    if (!text.trim()) return;

    const { error } = await window.supabaseClient
        .from('crm_notes')
        .insert([{
            client_id: id,
            content: text,
            note_type: 'General'
        }]);

    if (error) alert('Error adding note: ' + error.message);
    else {
        // Refresh drawer details
        openClientDetails(id);
    }
}

// === Contact Bottom Sheet (Mobile) ===
function openContactSheet(phone, whatsapp) {
    const sheet = document.getElementById('contact-sheet');
    const overlay = document.getElementById('contact-sheet-overlay');

    // Set Links
    const cleanPhone = phone ? phone.replace(/[^0-9+]/g, '') : '';
    document.getElementById('sheet-call').href = `tel:${cleanPhone}`;

    const cleanWA = whatsapp ? whatsapp.replace(/[^0-9]/g, '') : '';
    document.getElementById('sheet-whatsapp').href = `https://wa.me/${cleanWA}`;

    sheet.classList.add('active');
    overlay.classList.add('active');
}

function closeContactSheet() {
    document.getElementById('contact-sheet').classList.remove('active');
    document.getElementById('contact-sheet-overlay').classList.remove('active');
}

// === Popover Menu ===
function showActionPopover(e, whatsapp, phone) {
    e.preventDefault();
    e.stopPropagation();

    // Mobile Logic (Tablets included for touch friendliness)
    if (window.innerWidth <= 768) {
        openContactSheet(phone, whatsapp);
        return;
    }

    const popover = document.getElementById('action-popover');

    // Position
    const rect = e.target.getBoundingClientRect();
    popover.style.top = (rect.bottom + window.scrollY + 5) + 'px';
    popover.style.left = (rect.left + window.scrollX - 100) + 'px';

    // Set Links
    // Call: Clean phone number
    const cleanPhone = phone ? phone.replace(/[^0-9+]/g, '') : '';
    document.getElementById('act-call').href = `tel:${cleanPhone}`;

    // WhatsApp
    const cleanWA = whatsapp ? whatsapp.replace(/[^0-9]/g, '') : '';
    document.getElementById('act-whatsapp').href = `https://wa.me/${cleanWA}`;

    popover.classList.add('active');

    // Close on click outside
    const closeFn = (evt) => {
        if (!popover.contains(evt.target) && evt.target !== e.target) {
            popover.classList.remove('active');
            document.removeEventListener('click', closeFn);
        }
    };
    setTimeout(() => document.addEventListener('click', closeFn), 0);
}

// === Mobile Nav Logic ===
function setActiveNav(element) {
    document.querySelectorAll('.mobile-bottom-nav .nav-item').forEach(el => el.classList.remove('active'));
    element.classList.add('active');
}

// === Mobile Sidebar Toggle ===
function toggleSidebar() {
    const sb = document.getElementById('crm-sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (sb.classList.contains('show')) {
        sb.classList.remove('show');
        overlay.classList.remove('show');
    } else {
        sb.classList.add('show');
        overlay.classList.add('show');
    }
}
