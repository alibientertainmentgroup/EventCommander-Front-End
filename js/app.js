// Main Application Logic

let appState = {
    currentView: 'dashboard',
    events: [],
    activities: [],
    assets: [],
    personnel: [],
    locations: [],
    roster: [],
    roles: [],
    users: [],
    logs: [],
    supportTickets: [],
    selectedEvent: null,
    sandboxMode: false,
    dashboardDate: null,
    reportView: null,
    timelineDate: null,
    timelineDays: 1,
    inprocessProfile: null,
    inprocessStation: null,
    inprocessMessage: 'Google Sheet lookup not connected yet.',
    showEventsWithNeeds: false,
    showActivitiesWithNeeds: false
};

function normalizeCapId(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const digits = raw.replace(/\D/g, '');
    if (!digits) return raw;
    return digits.length < 6 ? digits.padStart(6, '0') : digits;
}

function updateContextUI() {
    const appScreen = document.getElementById('appScreen');
    if (!appScreen) return;
    const hideSidebar = isPrivileged() && !appState.selectedEvent;
    appScreen.classList.toggle('no-event', hideSidebar);

    const adminItem = document.querySelector('.nav-item[data-view="admin"]');
    if (adminItem) {
        adminItem.style.display = isAdmin() ? 'flex' : 'none';
    }
    document.querySelectorAll('.nav-item[data-privileged="true"]').forEach(item => {
        item.style.display = isPrivileged() ? 'flex' : 'none';
    });
}

function toggleEventsWithNeeds() {
    appState.showEventsWithNeeds = !appState.showEventsWithNeeds;
    renderCurrentView();
}

function toggleActivitiesWithNeeds() {
    appState.showActivitiesWithNeeds = !appState.showActivitiesWithNeeds;
    renderCurrentView();
}

function getSupportRoles() {
    const fallback = ['Driver', 'Safety Officer', 'HSO', 'Support Staff', 'Orientation Pilot', 'TO', 'Other'];
    const roles = Array.isArray(appState.roles) && appState.roles.length ? appState.roles : fallback;
    const normalized = roles.map(r => String(r).trim()).filter(Boolean);
    if (!normalized.some(r => r.toLowerCase() === 'other')) normalized.push('Other');
    return Array.from(new Set(normalized));
}

function renderSandboxBanner() {
    return appState.sandboxMode
        ? '<div class="sandbox-banner">SANDBOX MODE</div>'
        : '';
}

// ==================== INITIALIZATION ====================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 CAP Event System starting...');
    appState.sandboxMode = localStorage.getItem('cap-event-sandbox-mode') === 'true';
    
    // Initialize Supabase
    if (!initSupabase()) {
        return;
    }

    // Setup login form
    document.getElementById('loginForm').addEventListener('submit', handleLogin);

    // Auto-login if saved
    const savedCapId = localStorage.getItem('cap-event-current-cap-id');
    if (savedCapId) {
        try {
            showLoading();
            const user = await loginUser(savedCapId);
            document.getElementById('currentUserId').textContent = user.cap_id;
            document.getElementById('userRole').textContent = user.role.toUpperCase();
            document.getElementById('loginScreen').style.display = 'none';
            document.getElementById('appScreen').style.display = 'flex';
            await loadAllData();
            renderCurrentView();
            updateContextUI();
        } catch (error) {
            console.error('Auto-login failed:', error);
            localStorage.removeItem('cap-event-current-cap-id');
        } finally {
            hideLoading();
        }
    }
});

// ==================== AUTHENTICATION ====================

async function handleLogin(e) {
    e.preventDefault();
    const capId = document.getElementById('capIdInput').value.trim();
    
    if (!capId) {
        alert('Please enter your CAP ID');
        return;
    }

    showLoading();
    
    try {
        const user = await loginUser(capId);
        // Start each session with sandbox off
        appState.sandboxMode = false;
        localStorage.setItem('cap-event-sandbox-mode', 'false');
        localStorage.setItem('cap-event-current-cap-id', capId);
        
        // Update UI
        document.getElementById('currentUserId').textContent = user.cap_id;
        document.getElementById('userRole').textContent = user.role.toUpperCase();
        
        // Show app screen
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('appScreen').style.display = 'flex';
        
        // Load initial data
        await loadAllData();
        renderCurrentView();
        updateContextUI();
        
        console.log('✅ Login successful:', user);
    } catch (error) {
        console.error('Login failed:', error);
        alert('Login failed. Please try again.');
    } finally {
        hideLoading();
    }
}

function handleLogout() {
    logoutUser();
    localStorage.removeItem('cap-event-current-cap-id');
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('appScreen').style.display = 'none';
    document.getElementById('capIdInput').value = '';
    appState = {
        currentView: 'dashboard',
        events: [],
        activities: [],
        assets: [],
        personnel: [],
        locations: [],
        selectedEvent: null,
        timelineDate: null,
        timelineDays: 1
    };
    updateContextUI();
}

// Setup logout button
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', handleLogout);
        }
    }, 100);
});

// Setup mobile menu
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        const menuBtn = document.getElementById('mobileMenuBtn');
        const overlay = document.getElementById('sidebarOverlay');
        const appScreen = document.getElementById('appScreen');

        if (!menuBtn || !overlay || !appScreen) return;

        const closeMenu = () => appScreen.classList.remove('sidebar-open');

        menuBtn.addEventListener('click', () => {
            appScreen.classList.toggle('sidebar-open');
        });

        overlay.addEventListener('click', closeMenu);

        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', closeMenu);
        });
    }, 100);
});

// ==================== DATA LOADING ====================

async function loadAllData() {
    showLoading();
    try {
        const [events, activities, assets, personnel, locations, roster, roles, users, logs, supportTickets] = await Promise.all([
            getEvents(),
            getActivities(),
            getAssets(),
            getPersonnel(),
            getLocations(),
            getRoster(appState.selectedEvent ? appState.selectedEvent.id : null),
            getRoles(),
            getUsers(),
            getLogs(),
            getSupportTickets()
        ]);
        
        // Ensure sandbox filter is applied client-side even if backend returns mixed data.
        const sandboxFlag = localStorage.getItem('cap-event-sandbox-mode') === 'true';
        const filterSandbox = (records) => (records || []).filter(r => !!r.sandbox_mode === sandboxFlag);

        appState.events = filterSandbox(events);
        appState.activities = filterSandbox(activities);
        appState.assets = filterSandbox(assets);
        appState.personnel = filterSandbox(personnel);
        appState.locations = filterSandbox(locations);
        appState.roster = filterSandbox(roster);
        appState.roles = roles;
        appState.users = users;
        appState.logs = filterSandbox(logs);
        appState.supportTickets = filterSandbox(supportTickets);

        if (isPrivileged()) {
            await syncAllDriversForActivities();
            await autoPromoteReady();
        }
        
        console.log('✅ Data loaded:', { events: events.length, activities: activities.length, assets: assets.length, personnel: personnel.length });
    } catch (error) {
        console.error('Failed to load data:', error);
        alert('Failed to load data. Please refresh the page.');
    } finally {
        hideLoading();
    }
}

async function syncAllDriversForActivities() {
    const updates = [];
    for (const activity of appState.activities) {
        const assetAssignments = normalizeAssignmentEntries(activity.assigned_assets || [], 'assets');
        const currentPersonnel = normalizeAssignmentEntries(activity.assigned_personnel || [], 'personnel');
        const nonDrivers = currentPersonnel
            .filter(entry => !(entry.auto_driver || isVehicleOperatorRole(entry.role)));

        const drivers = [];
        assetAssignments.forEach(assign => {
            if (!assign.assignment_start_time || !assign.assignment_end_time || !activity.activity_date) return;
            const driver = getAssetDriverForWindow(assign.id, activity.activity_date, assign.assignment_start_time, assign.assignment_end_time);
            if (driver) {
                drivers.push({
                    id: driver.id,
                    role: driver.role || 'Driver',
                    assignment_date: activity.activity_date,
                    assignment_start_time: assign.assignment_start_time,
                    assignment_end_time: assign.assignment_end_time,
                    auto_driver: true,
                    asset_id: String(assign.id)
                });
            }
        });

        const updatedPersonnel = [...nonDrivers, ...drivers];
        const updatedPayload = toActivityPersonnelPayload(updatedPersonnel);
        const currentPayload = toActivityPersonnelPayload(currentPersonnel);
        const changed = JSON.stringify(currentPayload) !== JSON.stringify(updatedPayload);
        if (changed) {
            updates.push({ id: activity.id, assigned_personnel: updatedPayload });
        }
    }

    if (!updates.length) return;
    await Promise.all(updates.map(u => updateActivity(u.id, { assigned_personnel: u.assigned_personnel })));
    const refreshed = await getActivities();
    appState.activities = refreshed;
}

async function autoPromoteReady() {
    const updates = appState.activities.filter(a =>
        a.column === 'Planning' &&
        isActivityFullyAssigned(a)
    );
    if (!updates.length) return;
    await Promise.all(updates.map(a => updateActivity(a.id, { column: 'Ready' })));
    const refreshed = await getActivities();
    appState.activities = refreshed;
}

// ==================== VIEW MANAGEMENT ====================

function renderCurrentView() {
    const contentArea = document.getElementById('contentArea');
    let viewHtml = '';
    let postRender = null;

    if (isPrivileged() && !appState.selectedEvent) {
        viewHtml = renderAdminHome(appState.events);
        contentArea.innerHTML = renderSandboxBanner() + viewHtml;
        return;
    }
    
    switch (appState.currentView) {
        case 'dashboard':
            if (appState.selectedEvent) {
                const eventActivities = appState.activities.filter(a => a.event_id === appState.selectedEvent.id);
                viewHtml = renderEventDashboard(
                    appState.selectedEvent,
                    eventActivities,
                    appState.assets,
                    appState.personnel
                );
            } else {
                viewHtml = renderDashboard(appState.events, appState.personnel, appState.assets);
            }
            break;
        case 'events':
            if (appState.selectedEvent) {
                const eventActivities = appState.activities.filter(a => a.event_id === appState.selectedEvent.id);
                viewHtml = renderEventDetailView(appState.selectedEvent, eventActivities);
                postRender = () => setupKanbanDragAndDrop();
            } else {
                viewHtml = renderEvents(appState.events);
            }
            break;
        case 'inprocessing':
            viewHtml = renderInprocessing();
            break;
        case 'outprocessing':
            viewHtml = renderOutprocessing();
            break;
        case 'assets':
            if (appState.selectedEvent) {
                const eventActivities = appState.activities.filter(a => a.event_id === appState.selectedEvent.id);
                viewHtml = renderAssets(appState.assets, eventActivities, appState.timelineDate);
            } else {
                viewHtml = renderAssets(appState.assets, appState.activities, appState.timelineDate);
            }
            break;
        case 'personnel':
            if (appState.selectedEvent) {
                const eventActivities = appState.activities.filter(a => a.event_id === appState.selectedEvent.id);
                viewHtml = renderPersonnel(appState.personnel, eventActivities, appState.timelineDate);
            } else {
                viewHtml = renderPersonnel(appState.personnel, appState.activities, appState.timelineDate);
            }
            break;
        case 'roster':
            viewHtml = renderRoster(appState.roster);
            break;
        case 'locations':
            viewHtml = renderLocations(appState.locations);
            break;
        case 'schedule':
            viewHtml = renderSchedule(getUserSchedule());
            break;
        case 'reports':
            viewHtml = isPrivileged() ? renderReports() : renderNotAuthorized();
            break;
        case 'communications':
            viewHtml = isPrivileged() ? renderCommunications() : renderNotAuthorized();
            break;
        case 'support':
            viewHtml = isPrivileged() ? renderSupportTicket() : renderNotAuthorized();
            break;
        case 'log':
            viewHtml = isPrivileged() ? renderLog() : renderNotAuthorized();
            break;
        case 'admin':
            viewHtml = isAdmin() ? renderAdminPanel() : renderNotAuthorized();
            break;
    }
    contentArea.innerHTML = renderSandboxBanner() + viewHtml;
    if (postRender) postRender();
}

async function switchView(viewName) {
    appState.currentView = viewName;
    
    // Update nav items
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.view === viewName) {
            item.classList.add('active');
        }
    });
    
    if (viewName === 'inprocessing') {
        startInprocessingAverageTimer();
    } else {
        stopInprocessingAverageTimer();
    }

    if (viewName === 'reports' || viewName === 'log') {
        showLoading();
        try {
            appState.logs = await getLogs();
        } catch (error) {
            console.error('Failed to refresh logs:', error);
        } finally {
            hideLoading();
        }
    }

    renderCurrentView();
}

function setRosterFilter(filter) {
    window.__rosterFilter = filter;
    renderCurrentView();
}

function setRosterSearch(value) {
    window.__rosterQuery = value || '';
    renderCurrentView();
    setTimeout(() => {
        const input = document.querySelector('.roster-search');
        if (input) {
            input.focus();
            const len = input.value.length;
            input.setSelectionRange(len, len);
        }
    }, 0);
}

function setReportView(name) {
    appState.reportView = name;
    renderCurrentView();
}

async function toggleSandboxMode() {
    appState.sandboxMode = !appState.sandboxMode;
    localStorage.setItem('cap-event-sandbox-mode', appState.sandboxMode ? 'true' : 'false');
    showLoading();
    try {
        await loadAllData();
        if (appState.selectedEvent) {
            const stillExists = appState.events.some(e => e.id === appState.selectedEvent.id);
            if (!stillExists) {
                appState.selectedEvent = null;
            }
        }
        renderCurrentView();
        updateContextUI();
    } catch (error) {
        console.error('Failed to toggle sandbox mode:', error);
    } finally {
        hideLoading();
    }
}

async function addSupportTicketAction() {
    const subjectInput = document.getElementById('supportTicketSubject');
    const detailsInput = document.getElementById('supportTicketDetails');
    if (!subjectInput || !detailsInput) return;
    const subject = subjectInput.value.trim();
    const details = detailsInput.value.trim();
    if (!subject || !details) {
        alert('Please enter a subject and details.');
        return;
    }
    const user = getCurrentUser();
    const rosterMatch = appState.roster.find(r => String(r.cap_id) === String(user?.cap_id));
    const personnelMatch = appState.personnel.find(p => String(p.cap_id) === String(user?.cap_id));
    const name = rosterMatch?.name || personnelMatch?.name || '';
    const rank = rosterMatch?.rank || personnelMatch?.rank || '';
    const ticket = {
        subject,
        details,
        cap_id: user?.cap_id || '',
        name,
        rank,
        created_by: user?.cap_id || '',
        status: 'open'
    };
    showLoading();
    try {
        await addSupportTicket(ticket);
        appState.supportTickets = await getSupportTickets();
        subjectInput.value = '';
        detailsInput.value = '';
        renderCurrentView();
    } catch (error) {
        console.error('Add support ticket failed:', error);
        alert('Failed to submit support ticket.');
    } finally {
        hideLoading();
    }
}

function openResolveSupportTicket(ticketId) {
    const ticket = (appState.supportTickets || []).find(t => t.id === ticketId);
    if (!ticket) return;
    const modalContent = `
        <form id="resolveTicketForm" onsubmit="resolveSupportTicketAction(event, '${ticketId}')">
            <div class="form-row">
                <label class="form-label">Resolution Remarks</label>
                <textarea class="form-textarea" id="supportTicketRemarks" required></textarea>
            </div>
        </form>
    `;
    const modalFooter = `
        <button class="btn btn-blue" onclick="document.getElementById('resolveTicketForm').requestSubmit()">CLOSE TICKET</button>
        <button class="btn btn-outline" onclick="closeModal()">CANCEL</button>
    `;
    showModal(createModal('CLOSE SUPPORT TICKET', modalContent, modalFooter));
}

async function resolveSupportTicketAction(e, ticketId) {
    e.preventDefault();
    const remarks = document.getElementById('supportTicketRemarks').value.trim();
    if (!remarks) return;
    const user = getCurrentUser();
    showLoading();
    try {
        await resolveSupportTicket(ticketId, {
            closed_by: user?.cap_id || '',
            closed_remarks: remarks
        });
        appState.supportTickets = await getSupportTickets();
        closeModal();
        renderCurrentView();
    } catch (error) {
        console.error('Resolve support ticket failed:', error);
        alert('Failed to close support ticket.');
    } finally {
        hideLoading();
    }
}

function getReportRecords(reportName) {
    const roster = Array.isArray(appState.roster) ? appState.roster : [];
    const assets = Array.isArray(appState.assets) ? appState.assets : [];
    const personnel = Array.isArray(appState.personnel) ? appState.personnel : [];
    const locations = Array.isArray(appState.locations) ? appState.locations : [];
    const logs = Array.isArray(appState.logs) ? appState.logs : [];
    switch (reportName) {
        case 'Inprocessing':
        case 'Outprocessing':
        case 'Roster':
            return roster;
        case 'Assets':
            return assets;
        case 'Personnel':
            return personnel;
        case 'Locations':
            return locations;
        case 'Log':
            return logs;
        default:
            return [];
    }
}

function flattenRecordForCsv(record) {
    const flat = {};
    if (!record || typeof record !== 'object') return flat;
    Object.keys(record).forEach(key => {
        const value = record[key];
        if (value === null || value === undefined) {
            flat[key] = '';
        } else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
            flat[key] = String(value);
        } else {
            try {
                flat[key] = JSON.stringify(value);
            } catch {
                flat[key] = String(value);
            }
        }
    });
    return flat;
}

function downloadReportCsv(reportName) {
    const records = getReportRecords(reportName);
    if (!records.length) {
        alert('No records to export.');
        return;
    }
    const flattened = records.map(flattenRecordForCsv);
    const headers = Array.from(new Set(flattened.flatMap(row => Object.keys(row)))).sort((a, b) => a.localeCompare(b));
    const rows = [headers.join(',')];
    flattened.forEach(row => {
        const line = headers.map(header => {
            const value = row[header] ?? '';
            const escaped = String(value).replace(/"/g, '""');
            return `"${escaped}"`;
        }).join(',');
        rows.push(line);
    });
    const csv = rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${reportName.replace(/\s+/g, '_').toLowerCase()}_report.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function getReportText(reportName) {
    const lines = [];
    const now = new Date().toISOString();
    lines.push(`${reportName} Report`);
    lines.push(`Generated: ${formatSignedIn(now)}`);
    lines.push('------------------------------------------------------------');

    const roster = Array.isArray(appState.roster) ? appState.roster : [];
    const assets = Array.isArray(appState.assets) ? appState.assets : [];
    const personnel = Array.isArray(appState.personnel) ? appState.personnel : [];
    const locations = Array.isArray(appState.locations) ? appState.locations : [];
    const logs = Array.isArray(appState.logs) ? appState.logs : [];

    const formatName = (entry) => {
        const last = (entry.lastName || '').trim();
        const first = (entry.firstName || '').trim();
        if (last || first) return `${last}${last && first ? ', ' : ''}${first}`;
        return entry.name || 'Unknown';
    };

    const formatInlineValue = (value) => {
        if (value === null || value === undefined || value === '') return '—';
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
        return value;
    };

    const formatObjectLine = (obj) => {
        if (!obj || typeof obj !== 'object') return formatInlineValue(obj);
        const keys = Object.keys(obj).sort((a, b) => a.localeCompare(b));
        if (!keys.length) return '—';
        return keys.map(key => `${key}=${formatInlineValue(obj[key])}`).join('; ');
    };

    const formatArrayLines = (arr) => {
        if (!Array.isArray(arr) || !arr.length) return ['None'];
        return arr.map((item, idx) => {
            if (item && typeof item === 'object') {
                return `Item ${idx + 1} | ${formatObjectLine(item)}`;
            }
            return `Item ${idx + 1} | ${formatInlineValue(item)}`;
        });
    };

    const formatValueLines = (value) => {
        if (Array.isArray(value)) {
            return formatArrayLines(value);
        }
        if (value && typeof value === 'object') {
            const keys = Object.keys(value).sort((a, b) => a.localeCompare(b));
            if (!keys.length) return ['—'];
            return keys.map(key => `${key}=${formatInlineValue(value[key])}`);
        }
        return [String(formatInlineValue(value))];
    };

    const formatRecord = (record) => {
        if (!record) return '—';
        const keys = Object.keys(record).sort((a, b) => a.localeCompare(b));
        return keys.map(key => {
            const lines = formatValueLines(record[key]);
            if (lines.length === 1) {
                return `${key.padEnd(20, ' ')} : ${lines[0]}`;
            }
            const indented = lines.map(line => `  ${line}`).join('\n');
            return `${key.padEnd(20, ' ')} :\n${indented}`;
        }).join('\n');
    };

    switch (reportName) {
        case 'Inprocessing': {
            const students = roster.filter(r => String(r.role || '') !== 'staff');
            if (!students.length) {
                lines.push('No inprocessing records.');
                break;
            }
            students.forEach((entry, index) => {
                lines.push(`Record ${index + 1} | ${formatName(entry)} | CAP ${entry.cap_id || 'N/A'}`);
                lines.push(formatRecord(entry));
                lines.push('------------------------------------------------------------');
            });
            break;
        }
        case 'Outprocessing': {
            if (!roster.length) {
                lines.push('No outprocessing records.');
                break;
            }
            roster.forEach((entry, index) => {
                lines.push(`Record ${index + 1} | ${formatName(entry)} | CAP ${entry.cap_id || 'N/A'}`);
                lines.push(formatRecord(entry));
                lines.push('------------------------------------------------------------');
            });
            break;
        }
        case 'Assets': {
            if (!assets.length) {
                lines.push('No assets available.');
                break;
            }
            assets.forEach((asset, index) => {
                lines.push(`Record ${index + 1} | ${asset.type || 'Asset'} ${asset.asset_id || asset.id || ''}`.trim());
                lines.push(formatRecord(asset));
                lines.push('------------------------------------------------------------');
            });
            break;
        }
        case 'Personnel': {
            if (!personnel.length) {
                lines.push('No personnel available.');
                break;
            }
            personnel.forEach((person, index) => {
                lines.push(`Record ${index + 1} | ${person.name || 'Unknown'} | CAP ${person.cap_id || 'N/A'}`);
                lines.push(formatRecord(person));
                lines.push('------------------------------------------------------------');
            });
            break;
        }
        case 'Roster': {
            if (!roster.length) {
                lines.push('Roster is empty.');
                break;
            }
            roster.forEach((entry, index) => {
                lines.push(`Record ${index + 1} | ${formatName(entry)} | CAP ${entry.cap_id || 'N/A'}`);
                lines.push(formatRecord(entry));
                lines.push('------------------------------------------------------------');
            });
            break;
        }
        case 'Locations': {
            if (!locations.length) {
                lines.push('No locations available.');
                break;
            }
            locations.forEach((loc, index) => {
                lines.push(`Record ${index + 1} | ${loc.name || 'Location'}`);
                lines.push(formatRecord(loc));
                lines.push('------------------------------------------------------------');
            });
            break;
        }
        case 'Log': {
            if (!logs.length) {
                lines.push('No log entries.');
                break;
            }
            logs.forEach((entry, index) => {
                const name = entry.lastName ? `${entry.lastName}, ${entry.firstName || ''}` : (entry.name || 'Unknown');
                lines.push(`Record ${index + 1} | ${name} | CAP ${entry.cap_id || 'N/A'}`);
                lines.push(formatRecord(entry));
                lines.push('------------------------------------------------------------');
            });
            break;
        }
        default:
            lines.push('Select a report.');
    }

    if (reportName !== 'Log') {
        const auditMap = {
            Inprocessing: ['roster'],
            Outprocessing: ['roster'],
            Roster: ['roster'],
            Assets: ['asset', 'asset_personnel', 'activity_asset'],
            Personnel: ['personnel', 'activity_personnel', 'asset_personnel'],
            Locations: ['location']
        };
        const types = auditMap[reportName] || [];
        const auditEntries = logs.filter(entry => entry.type === 'audit' && types.includes(entry.entity_type));
        lines.push('');
        lines.push('AUDIT TRAIL');
        lines.push('------------------------------------------------------------');
        if (!auditEntries.length) {
            lines.push('No audit entries found for this section.');
        } else {
            auditEntries.forEach((entry, index) => {
                lines.push(`Audit ${index + 1} | ${entry.action || 'update'} | ${entry.entity_type || 'unknown'} | ${formatSignedIn(entry.created_at)}`);
                lines.push(formatRecord(entry));
                lines.push('------------------------------------------------------------');
            });
        }
    }

    return lines.join('\n');
}

function printReport(reportName) {
    const name = reportName || appState.reportView || 'Report';
    const text = getReportText(name);
    const popup = window.open('', '_blank', 'width=900,height=700');
    if (!popup) {
        alert('Please allow popups to print the report.');
        return;
    }
    popup.document.write(`
        <html>
            <head>
                <title>${name} Report</title>
                <style>
                    body { font-family: Arial, sans-serif; padding: 24px; background: #f5f5f5; }
                    .report { background: #fff; border: 1px solid #ddd; padding: 20px; border-radius: 8px; }
                    h1 { font-size: 20px; margin: 0 0 12px; }
                    pre { white-space: pre-wrap; font-size: 12px; line-height: 1.5; margin: 0; }
                </style>
            </head>
            <body>
                <div class="report">
                    <h1>${name} Report</h1>
                    <pre>${text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
                </div>
            </body>
        </html>
    `);
    popup.document.close();
    popup.focus();
    popup.print();
}

async function addLogEntryAction() {
    const input = document.getElementById('logEntryInput');
    if (!input) return;
    const message = input.value.trim();
    if (!message) return;
    const user = getCurrentUser();
    if (!user) return;
    const person = appState.personnel.find(p => String(p.cap_id) === String(user.cap_id));
    const entry = {
        cap_id: user.cap_id,
        firstName: person ? (person.name || '').split(' ')[0] : '',
        lastName: person ? (person.name || '').split(' ').slice(1).join(' ') : '',
        rank: person ? (person.rank || '') : '',
        message,
        created_at: new Date().toISOString()
    };
    showLoading();
    try {
        await addLogEntry(entry);
        appState.logs = await getLogs();
        input.value = '';
        renderCurrentView();
    } catch (error) {
        console.error('Add log entry failed:', error);
        alert('Failed to add log entry.');
    } finally {
        hideLoading();
    }
}

async function clearLogAction() {
    if (!confirm('Clear all log entries?')) return;
    showLoading();
    try {
        await clearLogs();
        appState.logs = [];
        renderCurrentView();
    } catch (error) {
        console.error('Clear log failed:', error);
        alert('Failed to clear log.');
    } finally {
        hideLoading();
    }
}

function getUserRoleForCapId(capId) {
    const user = appState.users.find(u => String(u.cap_id) === String(capId));
    return user ? user.role : 'user';
}

async function setUserAccessLevel(capId, role, name = '') {
    if (!capId || !role) return;
    showLoading();
    try {
        await updateUserRole(capId, role, name);
        appState.users = await getUsers();
        if (getCurrentUser() && String(getCurrentUser().cap_id) === String(capId)) {
            getCurrentUser().role = role;
            updateContextUI();
        }
        renderCurrentView();
    } catch (error) {
        console.error('Set user role failed:', error);
        alert('Failed to update user role.');
    } finally {
        hideLoading();
    }
}

async function adminSetUserRole() {
    const capInput = document.getElementById('adminUserCapId');
    const roleSelect = document.getElementById('adminUserRole');
    if (!capInput || !roleSelect) return;
    const capId = capInput.value.trim();
    const role = roleSelect.value;
    if (!capId) return;
    await setUserAccessLevel(capId, role);
    capInput.value = '';
}

async function addAdminRole() {
    const input = document.getElementById('adminRoleInput');
    if (!input) return;
    const name = input.value.trim();
    if (!name) return;
    showLoading();
    try {
        await addRole(name);
        appState.roles = await getRoles();
        input.value = '';
        renderCurrentView();
    } catch (error) {
        console.error('Add role failed:', error);
        alert('Failed to add role.');
    } finally {
        hideLoading();
    }
}

async function deleteAdminRole(roleName) {
    if (!roleName) return;
    if (!confirm(`Delete role "${roleName}"?`)) return;
    showLoading();
    try {
        await deleteRole(roleName);
        appState.roles = await getRoles();
        renderCurrentView();
    } catch (error) {
        console.error('Delete role failed:', error);
        alert('Failed to delete role.');
    } finally {
        hideLoading();
    }
}

function openRosterProfile(id) {
    const entry = appState.roster.find(r => r.id === id);
    if (!entry || !entry.profile) return;
    const profile = entry.profile;
    const modalContent = renderInprocessingProfile(profile);
    const modalFooter = `
        <button class="btn btn-outline" onclick="closeModal()">CLOSE</button>
    `;
    showModal(createModal('ROSTER PROFILE', modalContent, modalFooter));
}

function lookupInprocessingCadet() {
    const input = document.getElementById('inprocessCapId');
    if (!input) return;
    const capId = normalizeCapId(input.value);
    if (!capId) {
        appState.inprocessProfile = null;
        appState.inprocessMessage = 'Enter a CAP ID to search.';
        renderCurrentView();
        return;
    }
    fetchInprocessingData()
        .then(rows => {
            const match = rows.find(r => normalizeCapId(r.capId) === capId);
            if (!match) {
                appState.inprocessProfile = null;
                appState.inprocessMessage = `No record found for CAP ID ${capId}.`;
                renderCurrentView();
                return;
            }
            appState.inprocessProfile = match;
            appState.inprocessMessage = '';
            appState.inprocessStation = null;
            if (appState.selectedEvent) {
                return getRoster(appState.selectedEvent.id).then(roster => {
                    appState.roster = roster;
                    renderCurrentView();
                });
            }
            renderCurrentView();
        })
        .catch(err => {
            console.error('Inprocessing lookup failed:', err);
            appState.inprocessProfile = null;
            appState.inprocessMessage = 'Unable to load registration data. Check the sheet link and sharing settings.';
            renderCurrentView();
        });
}

let inprocessingAvgTimerId = null;

function startInprocessingAverageTimer() {
    if (inprocessingAvgTimerId) return;
    inprocessingAvgTimerId = setInterval(() => {
        if (appState.currentView === 'inprocessing') {
            renderCurrentView();
        }
    }, 60000);
}

function stopInprocessingAverageTimer() {
    if (inprocessingAvgTimerId) {
        clearInterval(inprocessingAvgTimerId);
        inprocessingAvgTimerId = null;
    }
}

async function signInInprocessing(role) {
    if (!appState.selectedEvent) {
        alert('Select an event first.');
        return;
    }
    if (!appState.inprocessProfile) {
        alert('Lookup a CAP ID first.');
        return;
    }
    const capId = normalizeCapId(appState.inprocessProfile.capId);
    if (!capId) {
        alert('Invalid CAP ID.');
        return;
    }
    const activeEntry = appState.roster.find(r => normalizeCapId(r.cap_id) === capId && !r.signed_out_at);
    if (activeEntry) {
        alert('This CAP ID is already signed in.');
        return;
    }
    const previousEntry = appState.roster.find(r => normalizeCapId(r.cap_id) === capId && r.signed_out_at);
    const firstName = appState.inprocessProfile.firstName || '';
    const lastName = appState.inprocessProfile.lastName || '';
    const fullName = `${firstName} ${lastName}`.trim();
    const now = new Date();
    showLoading();
    try {
        if (previousEntry) {
            previousEntry.event_id = appState.selectedEvent.id;
            previousEntry.rank = appState.inprocessProfile.rank || '';
            previousEntry.name = fullName || '';
            previousEntry.firstName = firstName;
            previousEntry.lastName = lastName;
            previousEntry.role = role;
            previousEntry.signed_in_at = now.toISOString();
            previousEntry.signed_out_at = null;
            previousEntry.stations = buildDefaultStations();
            previousEntry.flags = [];
            previousEntry.profile = { ...appState.inprocessProfile };
            await updateRosterEntry(previousEntry);
        } else {
            const entry = {
                event_id: appState.selectedEvent.id,
                cap_id: capId,
                rank: appState.inprocessProfile.rank || '',
                name: fullName || '',
                firstName,
                lastName,
                role,
                signed_in_at: now.toISOString(),
                signed_out_at: null,
                stations: buildDefaultStations(),
                flags: [],
                profile: { ...appState.inprocessProfile }
            };
            await addRosterEntry(entry);
        }
        appState.roster = await getRoster(appState.selectedEvent.id);
        appState.inprocessProfile = null;
        appState.inprocessStation = null;
        appState.inprocessMessage = `${role === 'staff' ? 'Staff' : 'Student'} signed in. Ready for next lookup.`;
        renderCurrentView();
    } catch (error) {
        console.error('Sign in failed:', error);
        alert('Failed to sign in.');
    } finally {
        hideLoading();
    }
}

function buildDefaultStations() {
    const names = ['Forms Review', 'Medical', 'Inspection', 'Billeting', 'Supply', 'Complete Inprocessing'];
    return names.reduce((acc, name) => {
        acc[name] = { status: 'pending', flagged: false };
        return acc;
    }, {});
}

function getActiveRosterEntry() {
    const profile = appState.inprocessProfile;
    if (!profile) return null;
    const capId = normalizeCapId(profile.capId);
    if (!capId) return null;
    return appState.roster.find(r => normalizeCapId(r.cap_id) === capId && !r.signed_out_at) || null;
}

function setInprocessStation(name) {
    appState.inprocessStation = name;
    renderCurrentView();
}

async function completeStation() {
    const entry = getActiveRosterEntry();
    if (!entry || !appState.inprocessStation) return;
    if (appState.inprocessStation === 'Complete Inprocessing') {
        const unresolved = (entry.flags || []).some(f => !f.resolved);
        if (unresolved) {
            alert('Flags must be resolved before completing inprocessing.');
            return;
        }
        const required = ['Forms Review', 'Medical', 'Inspection', 'Billeting', 'Supply'];
        const incomplete = required.filter(name => entry.stations?.[name]?.status !== 'complete');
        if (incomplete.length) {
            alert(`Complete these stations first: ${incomplete.join(', ')}`);
            return;
        }
    }
    entry.stations = entry.stations || buildDefaultStations();
    entry.stations[appState.inprocessStation] = entry.stations[appState.inprocessStation] || { status: 'pending', flagged: false };
    entry.stations[appState.inprocessStation].status = 'complete';
    if (appState.inprocessStation === 'Complete Inprocessing') {
        entry.inprocess_completed_at = entry.inprocess_completed_at || new Date().toISOString();
    }
    showLoading();
    try {
        await updateRosterEntry(entry);
        appState.roster = await getRoster(appState.selectedEvent.id);
        // Keep the active profile/selection so station status updates in-place.
        appState.inprocessMessage = 'Station complete.';
        renderCurrentView();
    } catch (error) {
        console.error('Complete station failed:', error);
        alert('Failed to complete station.');
    } finally {
        hideLoading();
    }
}

function openFlagModal() {
    if (!getActiveRosterEntry() || !appState.inprocessStation) return;
    const modalContent = `
        <form id="flagForm" onsubmit="saveFlag(event)">
            <div class="form-row">
                <label class="form-label">Flag Reason</label>
                <textarea class="form-textarea" id="flagReason" required></textarea>
            </div>
            <div class="form-row">
                <label class="form-label">Owner (Optional)</label>
                <input type="text" class="form-input" id="flagOwner" placeholder="Assigned to">
            </div>
        </form>
    `;
    const modalFooter = `
        <button class="btn btn-blue" onclick="document.getElementById('flagForm').requestSubmit()">SAVE FLAG</button>
        <button class="btn btn-outline" onclick="closeModal()">CANCEL</button>
    `;
    showModal(createModal('ADD FLAG', modalContent, modalFooter));
}

async function resetInprocessingForActive() {
    const entry = getActiveRosterEntry();
    if (!entry) return;
    if (!confirm('Clear inprocessing data for this member? This will reset stations and flags.')) {
        return;
    }
    entry.stations = buildDefaultStations();
    entry.flags = [];
    entry.inprocess_completed_at = null;
    showLoading();
    try {
        await updateRosterEntry(entry);
        appState.roster = await getRoster(appState.selectedEvent.id);
        renderCurrentView();
        alert('Inprocessing data cleared.');
    } catch (error) {
        console.error('Reset inprocessing failed:', error);
        alert('Failed to clear inprocessing data.');
    } finally {
        hideLoading();
    }
}

async function saveFlag(e) {
    e.preventDefault();
    const entry = getActiveRosterEntry();
    if (!entry || !appState.inprocessStation) return;
    const reason = document.getElementById('flagReason').value.trim();
    const owner = document.getElementById('flagOwner').value.trim();
    if (!reason) return;
    const actor = getCurrentUser();
    entry.flags = entry.flags || [];
    entry.flags.push({
        station: appState.inprocessStation,
        reason,
        owner,
        created_at: new Date().toISOString(),
        created_by: actor ? actor.cap_id : '',
        resolved: false
    });
    entry.stations = entry.stations || buildDefaultStations();
    entry.stations[appState.inprocessStation] = entry.stations[appState.inprocessStation] || { status: 'pending', flagged: false };
    entry.stations[appState.inprocessStation].flagged = true;
    showLoading();
    try {
        await updateRosterEntry(entry);
        appState.roster = await getRoster(appState.selectedEvent.id);
        closeModal();
        renderCurrentView();
    } catch (error) {
        console.error('Save flag failed:', error);
        alert('Failed to save flag.');
    } finally {
        hideLoading();
    }
}

function openResolveFlagModal(index) {
    const entry = getActiveRosterEntry();
    if (!entry) return;
    if (!entry.flags || !entry.flags[index]) return;
    const modalContent = `
        <form id="resolveFlagForm" onsubmit="resolveFlag(event, ${index})">
            <div class="form-row">
                <label class="form-label">Resolution Notes</label>
                <textarea class="form-textarea" id="flagResolutionNotes" required></textarea>
            </div>
        </form>
    `;
    const modalFooter = `
        <button class="btn btn-blue" onclick="document.getElementById('resolveFlagForm').requestSubmit()">RESOLVE</button>
        <button class="btn btn-outline" onclick="closeModal()">CANCEL</button>
    `;
    showModal(createModal('RESOLVE FLAG', modalContent, modalFooter));
}

async function resolveFlag(e, index) {
    e.preventDefault();
    const entry = getActiveRosterEntry();
    if (!entry) return;
    if (!entry.flags || !entry.flags[index]) return;
    const notes = document.getElementById('flagResolutionNotes').value.trim();
    if (!notes) return;
    const actor = getCurrentUser();
    entry.flags[index].resolved = true;
    entry.flags[index].resolved_at = new Date().toISOString();
    entry.flags[index].resolved_by = actor ? actor.cap_id : '';
    entry.flags[index].resolution_notes = notes;
    const station = entry.flags[index].station;
    const stillOpen = entry.flags.some(f => !f.resolved && f.station === station);
    entry.stations = entry.stations || buildDefaultStations();
    if (!stillOpen && entry.stations[station]) {
        entry.stations[station].flagged = false;
    }
    showLoading();
    try {
        await updateRosterEntry(entry);
        appState.roster = await getRoster(appState.selectedEvent.id);
        closeModal();
        renderCurrentView();
    } catch (error) {
        console.error('Clear flag failed:', error);
        alert('Failed to clear flag.');
    } finally {
        hideLoading();
    }
}

async function signOutInprocessing() {
    if (!appState.selectedEvent) {
        alert('Select an event first.');
        return;
    }
    if (!appState.inprocessProfile) {
        alert('Lookup a CAP ID first.');
        return;
    }
    const capId = normalizeCapId(appState.inprocessProfile.capId);
    if (!capId) {
        alert('Invalid CAP ID.');
        return;
    }
    const entry = appState.roster.find(r => normalizeCapId(r.cap_id) === capId && !r.signed_out_at);
    if (!entry) {
        alert('This CAP ID is not currently signed in.');
        return;
    }
    showLoading();
    try {
        entry.signed_out_at = new Date().toISOString();
        await updateRosterEntry(entry);
        appState.roster = await getRoster(appState.selectedEvent.id);
        renderCurrentView();
        alert('Signed out.');
    } catch (error) {
        console.error('Sign out failed:', error);
        alert('Failed to sign out.');
    } finally {
        hideLoading();
    }
}

const INPROCESSING_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1-3BS4c_szG5YzRDNpZrHe0c7fL7hzEWy/export?format=xlsx';
let inprocessingCache = null;

async function fetchInprocessingData() {
    if (inprocessingCache) return inprocessingCache;
    const res = await fetch(INPROCESSING_SHEET_URL);
    if (!res.ok) throw new Error('Failed to fetch sheet');
    const buf = await res.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    inprocessingCache = rows.map(mapInprocessingRow);
    return inprocessingCache;
}

function normalizeHeaderKey(key) {
    return String(key || '')
        .replace(/\s+/g, '')
        .replace(/[^a-zA-Z0-9]/g, '')
        .toLowerCase();
}

function mapInprocessingRow(row) {
    const data = {};
    Object.keys(row || {}).forEach(k => {
        data[normalizeHeaderKey(k)] = row[k];
    });
    const get = (...keys) => {
        for (const k of keys) {
            const key = normalizeHeaderKey(k);
            if (key in data) return data[key];
        }
        return '';
    };

    return {
        capId: get('RegistrantsCAPID', 'CAPID', 'CapID'),
        rank: get('Rank'),
        firstName: get('NameFirst', 'FirstName'),
        lastName: get('NameLast', 'LastName'),
        memberStatus: get('MemberStatus', 'MembershipStatus'),
        membershipExpiration: get('Expiration', 'MemberExpiration', 'MembershipExpiration'),
        paidInFull: get('PaidInFull', 'Paid'),
        shirtSize: get('ShirtSize'),
        emergencyName: get('EmergencyContactName'),
        emergencyPhone: get('EmergencyContactNumber')
    };
}

function renderInprocessingProfile(profile) {
    const fullName = `${profile.firstName || ''} ${profile.lastName || ''}`.trim();
    const paid = String(profile.paidInFull || '').toLowerCase();
    const paidLabel = paid === 'yes' || paid === 'true' || paid === 'paid' ? 'Yes' : (paid ? profile.paidInFull : 'No');
    return `
        <div class="profile-section">
            <div class="resource-header status-blue">PROFILE</div>
            <div class="profile-grid">
                <div class="profile-field">
                    <div class="profile-label">Name</div>
                    <div class="profile-value">${fullName || 'N/A'}</div>
                </div>
                <div class="profile-field">
                    <div class="profile-label">CAP ID</div>
                    <div class="profile-value">${profile.capId || 'N/A'}</div>
                </div>
                <div class="profile-field">
                    <div class="profile-label">Rank</div>
                    <div class="profile-value">${profile.rank || 'N/A'}</div>
                </div>
                <div class="profile-field">
                    <div class="profile-label">Member Status</div>
                    <div class="profile-value">${profile.memberStatus || 'N/A'}</div>
                </div>
                <div class="profile-field">
                    <div class="profile-label">Membership Expiration</div>
                    <div class="profile-value">${profile.membershipExpiration || 'N/A'}</div>
                </div>
                <div class="profile-field">
                    <div class="profile-label">Paid</div>
                    <div class="profile-value">${paidLabel}</div>
                </div>
                <div class="profile-field">
                    <div class="profile-label">Shirt Size</div>
                    <div class="profile-value">${profile.shirtSize || 'N/A'}</div>
                </div>
                <div class="profile-field">
                    <div class="profile-label">Emergency Contact</div>
                    <div class="profile-value">${profile.emergencyName || 'N/A'} ${profile.emergencyPhone ? `• ${profile.emergencyPhone}` : ''}</div>
                </div>
            </div>
        </div>
        <div class="profile-section">
            <div class="resource-header status-blue">ACCOMMODATIONS</div>
            <div class="profile-grid">
                <div class="profile-field">
                    <div class="profile-label">Status</div>
                    <div class="profile-value">Not connected yet.</div>
                </div>
            </div>
        </div>
        <div class="profile-section">
            <div class="resource-header status-blue">ALLERGIES</div>
            <div class="profile-grid">
                <div class="profile-field">
                    <div class="profile-label">Status</div>
                    <div class="profile-value">Not connected yet.</div>
                </div>
            </div>
        </div>
    `;
}

// Setup navigation
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', () => {
                switchView(item.dataset.view);
            });
        });
    }, 100);
});

// ==================== EVENT DETAIL VIEW ====================

async function selectEvent(eventId, targetView = 'dashboard') {
    showLoading();
    try {
        const event = await getEvent(eventId);
        appState.selectedEvent = event;
        appState.currentView = targetView;
        appState.roster = await getRoster(eventId);
        updateContextUI();
        renderCurrentView();
    } catch (error) {
        console.error('Failed to load event:', error);
        alert('Failed to load event details.');
    } finally {
        hideLoading();
    }
}

function renderEventDetailView(event, activities) {
    const columns = ['Planning', 'Ready', 'In Progress', 'Completed'];
    const totals = getEventActivityTotals(event.id, activities);
    const visibleActivities = appState.showActivitiesWithNeeds
        ? activities.filter(a => {
            const requiredPersonnel = normalizeRequiredList(a.support_personnel_required || []).length;
            const requiredAssets = normalizeRequiredList(a.assets_required || []).length;
            const assignedPersonnel = normalizeAssignmentEntries(a.assigned_personnel || [], 'personnel').length;
            const assignedAssets = normalizeAssignmentEntries(a.assigned_assets || [], 'assets').length;
            const needsPersonnel = requiredPersonnel > 0 && assignedPersonnel < requiredPersonnel;
            const needsAssets = requiredAssets > 0 && assignedAssets < requiredAssets;
            return needsPersonnel || needsAssets;
        })
        : activities;
    
    return `
        <div style="margin-bottom: 24px;">
            <button class="btn btn-outline" onclick="backToEvents()">← BACK</button>
        </div>

        <div class="page-header">
            <div>
                <h2 class="page-title">${event.title}</h2>
                <p class="page-subtitle">${event.description || ''}</p>
                <div class="event-dates">${formatEventDates(event)}</div>
            </div>
            <div class="flex gap-2">
                <button class="btn btn-outline" onclick="toggleActivitiesWithNeeds()">
                    ${appState.showActivitiesWithNeeds ? 'Show All Activities' : 'Show Activities With Needs'}
                </button>
            </div>
        </div>

        <div class="card mb-4">
            <div class="flex gap-4">
                <div style="flex: 1;">
                    <div class="metric-label">Personnel Needed</div>
                    <div class="metric-value status-blue">${totals.assignedPersonnel} / ${totals.requiredPersonnel}</div>
                </div>
                <div style="flex: 1;">
                    <div class="metric-label">Assets Needed</div>
                    <div class="metric-value status-blue">${totals.assignedAssets} / ${totals.requiredAssets}</div>
                </div>
            </div>
        </div>

        <div class="flex-between mb-4">
            <h3 class="page-subtitle" style="font-size: 24px; font-family: 'Orbitron', monospace; color: var(--blue-secondary);">ACTIVITIES</h3>
            ${isPrivileged() ? `
                <button class="btn btn-blue btn-small" onclick="openActivityModal('${event.id}')">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="12" y1="5" x2="12" y2="19"></line>
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                    ADD ACTIVITY
                </button>
            ` : ''}
        </div>

        <div class="kanban-board">
            ${columns.map(column => `
                <div class="kanban-column" data-column="${column}" ondragover="onKanbanDragOver(event)" ondrop="onKanbanDrop(event)">
                    <div class="kanban-header">${column.toUpperCase()}</div>
                <div class="kanban-items" data-column="${column}" ondragover="onKanbanDragOver(event)" ondrop="onKanbanDrop(event)">
                        ${sortActivities(visibleActivities.filter(a => a.column === column), column).map(activity => {
                            const complete = isActivityFullyAssigned(activity);
                            const completeStyle = complete ? 'background: rgba(110, 231, 183, 0.18); border-color: rgba(110, 231, 183, 0.8); box-shadow: 0 0 0 1px rgba(110, 231, 183, 0.45);' : '';
                            return `
                            <div class="kanban-card ${complete ? 'kanban-card-complete' : ''}" style="${completeStyle}" draggable="${isPrivileged()}" data-activity-id="${activity.id}" ondragstart="onActivityDragStart(event)" ondragend="onActivityDragEnd(event)" onclick="onActivityClick(event, '${activity.id}')">
                                <div class="flex-between" style="margin-bottom: 8px;">
                                    <div class="kanban-card-title">${activity.title}</div>
                                    ${isPrivileged() ? `
                                        <button class="btn-outline" style="padding: 4px; border: none; background: transparent; color: var(--red);" onclick="deleteActivityAction('${activity.id}', event)">
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                                <line x1="6" y1="6" x2="18" y2="18"></line>
                                            </svg>
                                        </button>
                                    ` : ''}
                                </div>
                                <div class="kanban-card-description">${activity.description || ''}</div>
                                ${activity.location_id ? `<div class="event-dates">Location: ${formatLocationLabel(appState.locations.find(l => l.id === activity.location_id))}</div>` : ''}
                                <div class="event-dates">${formatActivityDateTime(activity)}</div>
                                <div class="kanban-card-badges">
                                    <span class="badge badge-blue">P: ${getNonDriverAssignedCount(activity)}/${getRequiredCount(activity.support_personnel_required)}</span>
                                    <span class="badge badge-purple">A: ${getAssignedIds(activity.assigned_assets, 'assets').length}/${getRequiredCount(activity.assets_required)}</span>
                                </div>
                            </div>
                        `;
                        }).join('')}
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

function backToEvents() {
    appState.selectedEvent = null;
    appState.currentView = 'dashboard';
    updateContextUI();
    renderCurrentView();
}

// ==================== KANBAN DRAG AND DROP ====================

function setupKanbanDragAndDrop() {
    if (!isPrivileged()) return;

    // No-op: drag/drop is handled via inline handlers for reliability
}

// ==================== EVENT ACTIONS ====================

function openEventModal(eventId = null) {
    const event = eventId ? appState.events.find(e => e.id === eventId) : null;
    const startDate = event && event.start_date ? event.start_date.split('T')[0] : '';
    const endDate = event && event.end_date ? event.end_date.split('T')[0] : '';
    
    const modalContent = `
        <form id="eventForm" onsubmit="saveEvent(event, '${eventId || ''}')">
            <div class="form-row">
                <label class="form-label">Title</label>
                <input type="text" class="form-input" id="eventTitle" value="${event ? event.title : ''}" required>
            </div>
            <div class="form-row">
                <label class="form-label">Description</label>
                <textarea class="form-textarea" id="eventDescription">${event ? event.description || '' : ''}</textarea>
            </div>
            <div class="form-row">
                <label class="form-label">Start Date</label>
                <input type="date" class="form-input" id="eventStartDate" value="${startDate}">
            </div>
            <div class="form-row">
                <label class="form-label">End Date</label>
                <input type="date" class="form-input" id="eventEndDate" value="${endDate}">
            </div>
            <div class="form-row">
                <label class="form-label">Sandbox Mode</label>
                <label class="toggle-row">
                    <input type="checkbox" id="eventSandboxMode" ${event && event.sandbox_mode ? 'checked' : ''}>
                    <span class="toggle-label">Enable sandbox mode for this event</span>
                </label>
            </div>
        </form>
    `;

    const modalFooter = `
        <button class="btn btn-blue" onclick="document.getElementById('eventForm').requestSubmit()">SAVE</button>
        <button class="btn btn-outline" onclick="closeModal()">CANCEL</button>
    `;

    showModal(createModal(event ? 'EDIT EVENT' : 'NEW EVENT', modalContent, modalFooter));
}

async function saveEvent(e, eventId) {
    e.preventDefault();
    
    const startDateValue = document.getElementById('eventStartDate').value;
    const endDateValue = document.getElementById('eventEndDate').value;
    const eventData = {
        title: document.getElementById('eventTitle').value,
        description: document.getElementById('eventDescription').value,
        start_date: startDateValue || null,
        end_date: endDateValue || null,
        sandbox_mode: document.getElementById('eventSandboxMode').checked,
        personnel_needed: event && event.personnel_needed ? event.personnel_needed : 0,
        assets_needed: event && event.assets_needed ? event.assets_needed : 0
    };

    showLoading();
    closeModal();

    try {
        if (eventId) {
            await updateEvent(eventId, eventData);
        } else {
            await createEvent(eventData);
        }
        
        await loadAllData();
        renderCurrentView();
    } catch (error) {
        console.error('Failed to save event:', error);
        alert('Failed to save event.');
    } finally {
        hideLoading();
    }
}

async function deleteEventAction(eventId) {
    if (!confirm('Are you sure you want to delete this event? This will also delete all associated activities.')) {
        return;
    }

    showLoading();
    try {
        await deleteEvent(eventId);
        await loadAllData();
        appState.selectedEvent = null;
        switchView('events');
    } catch (error) {
        console.error('Failed to delete event:', error);
        alert('Failed to delete event.');
    } finally {
        hideLoading();
    }
}

async function updateEventStatus(eventId, status) {
    showLoading();
    try {
        await updateEvent(eventId, { status });
        await loadAllData();
        await selectEvent(eventId, 'events');
    } catch (error) {
        console.error('Failed to update event status:', error);
        alert('Failed to update event status.');
    } finally {
        hideLoading();
    }
}

// ==================== ACTIVITY ACTIONS ====================

function openActivityModal(eventId) {
    const modalContent = `
        <form id="activityForm" onsubmit="saveActivity(event, '${eventId}')">
            <div class="form-row">
                <label class="form-label">Title</label>
                <input type="text" class="form-input" id="activityTitle" required>
            </div>
            <div class="form-row">
                <label class="form-label">Description</label>
                <textarea class="form-textarea" id="activityDescription"></textarea>
            </div>
            <div class="form-row">
                <label class="form-label">Location</label>
                <select class="form-select" id="activityLocation">
                    <option value="">Select location...</option>
                    ${appState.locations.map(l => `<option value="${l.id}">${formatLocationLabel(l)}</option>`).join('')}
                </select>
            </div>
            <div class="form-row">
                <label class="form-label">Activity Date</label>
                <input type="date" class="form-input" id="activityDate">
            </div>
            <div class="form-row">
                <label class="form-label">Start Time</label>
                <input type="time" class="form-input" id="activityStartTime">
            </div>
            <div class="form-row">
                <label class="form-label">End Time</label>
                <input type="time" class="form-input" id="activityEndTime">
            </div>
            <div class="form-row">
                <label class="form-label">Support Roles Required</label>
                <div class="tag-input-row">
                    <select class="form-select" id="activitySupportRoleSelect">
                        <option value="" selected>Select role...</option>
                        ${getSupportRoles().map(role => `<option value="${role}">${role}</option>`).join('')}
                    </select>
                    <input type="text" class="form-input" id="activitySupportRoleOther" placeholder="If Other, type role">
                    <button type="button" class="btn btn-outline btn-small" onclick="addSupportPersonnelTag()">Add</button>
                </div>
                <div id="activitySupportPersonnelList" class="tag-list"></div>
                <input type="hidden" id="activitySupportPersonnel" value="[]">
            </div>
            <div class="form-row">
                <label class="form-label">Assets Required</label>
                <div class="tag-input-row">
                    <select class="form-select" id="activityAssetsRequiredSelect">
                        <option value="">Select asset...</option>
                        ${appState.assets.map(a => `<option value="${a.id}">${a.name} (${a.type}) • ${a.details || 'ID N/A'}</option>`).join('')}
                    </select>
                    <button type="button" class="btn btn-outline btn-small" onclick="addAssetsRequiredTag()">Add</button>
                </div>
                <div id="activityAssetsRequiredList" class="tag-list"></div>
                <input type="hidden" id="activityAssetsRequired" value="[]">
            </div>
        </form>
    `;

    const modalFooter = `
        <button class="btn btn-blue" onclick="document.getElementById('activityForm').requestSubmit()">CREATE</button>
        <button class="btn btn-outline" onclick="closeModal()">CANCEL</button>
    `;

    showModal(createModal('NEW ACTIVITY', modalContent, modalFooter));
    setupActivityTagInputs();
}

function setupActivityTagInputs() {
    const supportOtherInput = document.getElementById('activitySupportRoleOther');
    const assetSelect = document.getElementById('activityAssetsRequiredSelect');
    const supportList = document.getElementById('activitySupportPersonnelList');
    const assetList = document.getElementById('activityAssetsRequiredList');
    const supportHidden = document.getElementById('activitySupportPersonnel');
    const assetHidden = document.getElementById('activityAssetsRequired');

    const bindEnter = (input, addFn) => {
        if (!input) return;
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addFn();
            }
        });
    };

    bindEnter(supportOtherInput, addSupportPersonnelTag);
    bindEnter(assetSelect, addAssetsRequiredTag);

    if (supportList && supportHidden) {
        renderRequiredList(supportList, JSON.parse(supportHidden.value || '[]'), 'support');
    }
    if (assetList && assetHidden) {
        renderRequiredList(assetList, JSON.parse(assetHidden.value || '[]'), 'asset');
    }
}

function normalizeRequiredList(list) {
    if (!Array.isArray(list)) return [];
    return list.map(item => {
        if (typeof item === 'string') return item;
        if (item && typeof item.name === 'string') return item.name;
        return String(item);
    }).filter(Boolean);
}

function addSupportPersonnelTag() {
    const hidden = document.getElementById('activitySupportPersonnel');
    const list = document.getElementById('activitySupportPersonnelList');
    const roleSelect = document.getElementById('activitySupportRoleSelect');
    const otherInput = document.getElementById('activitySupportRoleOther');
    if (!hidden || !list || !roleSelect) return;

    const selected = roleSelect.value;
    const value = selected === 'Other' ? (otherInput ? otherInput.value.trim() : '') : selected;
    if (!value) return;

    const items = normalizeRequiredList(JSON.parse(hidden.value || '[]'));
    items.push(value);
    hidden.value = JSON.stringify(items);
    if (otherInput) otherInput.value = '';
    roleSelect.value = '';

    renderRequiredList(list, items, 'support');
}

function addAssetsRequiredTag() {
    const hidden = document.getElementById('activityAssetsRequired');
    const list = document.getElementById('activityAssetsRequiredList');
    const select = document.getElementById('activityAssetsRequiredSelect');
    if (!select || !hidden || !list) return;

    const value = select.value;
    if (!value) return;

    const items = normalizeRequiredList(JSON.parse(hidden.value || '[]'));
    items.push(String(value));
    hidden.value = JSON.stringify(items);
    select.value = '';

    renderRequiredList(list, items, 'asset');
}

function removeActivityTag(kind, index) {
    const hiddenId = kind === 'support' ? 'activitySupportPersonnel'
        : kind === 'asset' ? 'activityAssetsRequired'
        : kind === 'edit-support' ? 'activityEditSupportHidden'
        : 'activityEditAssetHidden';
    const listId = kind === 'support' ? 'activitySupportPersonnelList'
        : kind === 'asset' ? 'activityAssetsRequiredList'
        : kind === 'edit-support' ? 'activityEditSupportList'
        : 'activityEditAssetList';
    const hidden = document.getElementById(hiddenId);
    const list = document.getElementById(listId);
    if (!hidden || !list) return;

    const items = normalizeRequiredList(JSON.parse(hidden.value || '[]'))
        .filter((_, i) => i !== index);
    hidden.value = JSON.stringify(items);
    renderRequiredList(list, items, kind);
}

function renderRequiredList(listEl, items, kind) {
    const normalized = normalizeRequiredList(items);
    if (!normalized.length) {
        listEl.innerHTML = '<div class="empty-state-text text-center">None</div>';
        return;
    }
    listEl.innerHTML = normalized.map((item, idx) => `
        <div class="required-row">
            <span>${formatRequiredItem(kind, item)}</span>
            <button type="button" class="tag-chip-remove" onclick="removeActivityTag('${kind}', ${idx})">×</button>
        </div>
    `).join('');
}

function formatRequiredItem(kind, value) {
    if (kind === 'asset' || kind === 'edit-asset') {
        const asset = appState.assets.find(a => String(a.id) === String(value));
        if (asset) {
            return `${asset.name} (${asset.type})`;
        }
    }
    return value;
}

function getRequiredCount(list) {
    const normalized = normalizeRequiredList(list);
    return normalized.length;
}

function isActivityFullyAssigned(activity) {
    const requiredPersonnel = getRequiredCount(activity.support_personnel_required);
    const requiredAssets = getRequiredCount(activity.assets_required);
    const assignedPersonnel = getNonDriverAssignedCount(activity);
    const assignedAssets = (activity.assigned_assets || []).length;
    if (requiredPersonnel === 0 && requiredAssets === 0) return false;
    return (requiredPersonnel === 0 || assignedPersonnel >= requiredPersonnel) &&
        (requiredAssets === 0 || assignedAssets >= requiredAssets);
}

function getNonDriverAssignedCount(activity) {
    const entries = normalizeAssignmentEntries(activity.assigned_personnel || [], 'personnel');
    return entries.filter(entry => !(entry.auto_driver || isVehicleOperatorRole(entry.role))).length;
}

function getEventActivityTotals(eventId, activities) {
    const list = (activities || appState.activities || []).filter(a => String(a.event_id) === String(eventId));
    return list.reduce((totals, activity) => {
        totals.requiredPersonnel += getRequiredCount(activity.support_personnel_required);
        totals.requiredAssets += getRequiredCount(activity.assets_required);
        totals.assignedPersonnel += getNonDriverAssignedCount(activity);
        totals.assignedAssets += getAssignedIds(activity.assigned_assets, 'assets').length;
        return totals;
    }, { requiredPersonnel: 0, requiredAssets: 0, assignedPersonnel: 0, assignedAssets: 0 });
}

function isVehicleOperatorRole(role) {
    const key = (role || '').toLowerCase().trim();
    return key === 'driver' || key === 'orientation pilot';
}

function isAssetOperatorRole(role) {
    const key = (role || '').toLowerCase().trim();
    return key === 'driver' || key === 'orientation pilot' || key === 'other';
}

function onActivityDragStart(e) {
    const card = e.currentTarget;
    if (!card) return;
    window.__isDraggingActivity = true;
    card.classList.add('dragging');
    if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        const id = card.dataset.activityId || '';
        e.dataTransfer.setData('text/plain', id);
        e.dataTransfer.setData('text', id);
    }
}

function onActivityDragEnd(e) {
    const card = e.currentTarget;
    if (!card) return;
    card.classList.remove('dragging');
    setTimeout(() => {
        window.__isDraggingActivity = false;
    }, 0);
}

function onActivityClick(e, activityId) {
    if (window.__isDraggingActivity) return;
    openActivityDetail(activityId);
}

function setTimelineDate(value) {
    appState.timelineDate = value || null;
    renderCurrentView();
}

function shiftTimelineDate(days) {
    const base = appState.timelineDate ? parseDateLocal(appState.timelineDate) : new Date();
    if (Number.isNaN(base.getTime())) return;
    const next = new Date(base.getFullYear(), base.getMonth(), base.getDate() + days);
    appState.timelineDate = formatDateLocal(next);
    renderCurrentView();
}

function setTimelineDays(days) {
    appState.timelineDays = days;
    renderCurrentView();
}

function setDashboardDate(value) {
    appState.dashboardDate = value || null;
    renderCurrentView();
}

function parseDateLocal(dateStr) {
    const [y, m, d] = (dateStr || '').split('-').map(Number);
    if (!y || !m || !d) return new Date(NaN);
    return new Date(y, m - 1, d);
}

function formatDateLocal(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function normalizeAvailabilityList(list) {
    if (!Array.isArray(list)) return [];
    return list.map(item => ({
        label: item.label || '',
        start_date: item.start_date || item.date || '',
        end_date: item.end_date || item.date || '',
        start_time: item.start_time || '',
        end_time: item.end_time || ''
    })).filter(item => item.start_date && item.end_date && item.start_time && item.end_time);
}

function setupAvailabilityList(type) {
    const listEl = document.getElementById(`${type}AvailabilityList`);
    const hidden = document.getElementById(`${type}Availability`);
    if (!listEl || !hidden) return;
    const items = normalizeAvailabilityList(JSON.parse(hidden.value || '[]'));
    renderAvailabilityList(listEl, items, type);
}

function addAvailabilityEntry(type) {
    const labelInput = document.getElementById(`${type}AvailLabel`);
    const startDateInput = document.getElementById(`${type}AvailStartDate`);
    const endDateInput = document.getElementById(`${type}AvailEndDate`);
    const startInput = document.getElementById(`${type}AvailStart`);
    const endInput = document.getElementById(`${type}AvailEnd`);
    const listEl = document.getElementById(`${type}AvailabilityList`);
    const hidden = document.getElementById(`${type}Availability`);
    if (!startDateInput || !endDateInput || !startInput || !endInput || !listEl || !hidden) return;

    const entry = {
        label: labelInput ? labelInput.value.trim() : '',
        start_date: startDateInput ? startDateInput.value : '',
        end_date: endDateInput ? endDateInput.value : '',
        start_time: startInput.value,
        end_time: endInput.value
    };
    if (!entry.start_date || !entry.end_date || !entry.start_time || !entry.end_time) return;

    const items = normalizeAvailabilityList(JSON.parse(hidden.value || '[]'));
    items.push(entry);
    hidden.value = JSON.stringify(items);
    renderAvailabilityList(listEl, items, type);

    if (labelInput) labelInput.value = '';
    startInput.value = '';
    endInput.value = '';
}

function removeAvailabilityEntry(type, index) {
    const listEl = document.getElementById(`${type}AvailabilityList`);
    const hidden = document.getElementById(`${type}Availability`);
    if (!listEl || !hidden) return;
    const items = normalizeAvailabilityList(JSON.parse(hidden.value || '[]')).filter((_, i) => i !== index);
    hidden.value = JSON.stringify(items);
    renderAvailabilityList(listEl, items, type);
}

function renderAvailabilityList(listEl, items, type) {
    if (!items.length) {
        listEl.innerHTML = '<div class="empty-state-text text-center">No availability set</div>';
        return;
    }
    listEl.innerHTML = items.map((item, idx) => `
        <div class="availability-item">
            <span>${item.label ? `${item.label} • ` : ''}${item.start_date}–${item.end_date} • ${item.start_time}–${item.end_time}</span>
            <button type="button" class="tag-chip-remove" onclick="removeAvailabilityEntry('${type}', ${idx})">×</button>
        </div>
    `).join('');
}

function getAvailabilityWindows(resource, date) {
    const list = normalizeAvailabilityList(resource.availability || []);
    return list.filter(a => {
        return a.start_date <= date && date <= a.end_date;
    }).map(a => {
        const start = new Date(`${date}T${a.start_time}`);
        const end = new Date(`${date}T${a.end_time}`);
        return { start, end };
    }).filter(w => !isNaN(w.start.getTime()) && !isNaN(w.end.getTime()));
}

function isResourceAvailable(resource, activity) {
    if (!activity || !activity.activity_date || !activity.start_time || !activity.end_time) return true;
    const window = getAssignmentWindow(activity, {});
    if (!window) return true;
    const availability = getAvailabilityWindows(resource, activity.activity_date);
    if (!availability.length) return false;
    return availability.some(a => window.start >= a.start && window.end <= a.end);
}

function isDriverAssignedToVehicle(personnelId, activity) {
    if (!activity || !activity.activity_date) return false;
    const targetWindow = getAssignmentWindow(activity, {});
    if (!targetWindow) return false;
    return appState.assets.some(asset => {
        const drivers = normalizeAssignmentEntries(asset.assigned_personnel || [], 'personnel')
            .filter(entry => isAssetOperatorRole(entry.role) && entry.id === String(personnelId) && entry.assignment_date === activity.activity_date);
        return drivers.some(entry => {
            const window = getAssignmentWindow({ activity_date: activity.activity_date, start_time: entry.assignment_start_time, end_time: entry.assignment_end_time }, entry);
            if (!window) return false;
            return targetWindow.start < window.end && window.start < targetWindow.end;
        });
    });
}

function assetHasDriverForActivity(asset, activity) {
    if (!asset || !activity || !activity.activity_date || !activity.start_time || !activity.end_time) return true;
    const drivers = normalizeAssignmentEntries(asset.assigned_personnel || [], 'personnel')
        .filter(entry => isAssetOperatorRole(entry.role) && entry.assignment_date === activity.activity_date);
    if (!drivers.length) return false;
    const targetStart = new Date(`${activity.activity_date}T${activity.start_time}`);
    const targetEnd = new Date(`${activity.activity_date}T${activity.end_time}`);
    return drivers.some(entry => {
        if (!entry.assignment_start_time || !entry.assignment_end_time) return false;
        const start = new Date(`${activity.activity_date}T${entry.assignment_start_time}`);
        const end = new Date(`${activity.activity_date}T${entry.assignment_end_time}`);
        return targetStart < end && start < targetEnd;
    });
}

function assetHasDriverOnDate(asset, activity) {
    if (!asset || !activity || !activity.activity_date) return true;
    const drivers = normalizeAssignmentEntries(asset.assigned_personnel || [], 'personnel')
        .filter(entry => isAssetOperatorRole(entry.role) && entry.assignment_date === activity.activity_date);
    if (!drivers.length) return false;
    return drivers.some(entry => entry.assignment_start_time && entry.assignment_end_time);
}

function onKanbanDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
}

async function onKanbanDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    const columnEl = e.currentTarget?.dataset?.column
        ? e.currentTarget
        : (e.target ? e.target.closest('[data-column]') : null);
    const newColumn = columnEl ? columnEl.dataset.column : null;
    const activityId = (e.dataTransfer && (e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('text'))) || '';

    if (!activityId || !newColumn) return;

    showLoading();
    try {
        await updateActivity(activityId, { column: newColumn });
        await loadAllData();
        await selectEvent(appState.selectedEvent.id, 'events');
    } catch (error) {
        console.error('Failed to move activity:', error);
        alert('Failed to move activity.');
    } finally {
        hideLoading();
    }
}

function renderRequiredListInline(list) {
    const normalized = normalizeRequiredList(list);
    if (!normalized.length) {
        return '<div class="empty-state-text text-center">None</div>';
    }
    return normalized.map(item => `<span class="tag-chip">${item}</span>`).join('');
}

function buildRoleOptions(requiredList, assignedList, type) {
    const required = normalizeRequiredList(requiredList);
    const baseRoles = ['Driver', 'Safety Officer', 'HSO', 'Support Staff', 'Orientation Pilot', 'TO', 'Other'];

    const assigned = normalizeAssignmentEntries(assignedList || [], type || 'personnel')
        .map(entry => entry.role || entry.type || '')
        .filter(Boolean);

    const counts = {};
    required.forEach(r => { counts[r] = (counts[r] || 0) + 1; });
    assigned.forEach(r => { counts[r] = (counts[r] || 0) - 1; });

    const customRoles = Object.keys(counts).filter(r => !baseRoles.includes(r));
    const allRoles = [...baseRoles, ...customRoles];

    return allRoles.map(role => {
        const remaining = counts[role];
        if (typeof remaining === 'number') {
            const label = `${role} (${Math.max(remaining, 0)} remaining)`;
            return `<option value="${role}">${label}</option>`;
        }
        return `<option value="${role}">${role}</option>`;
    }).join('');
}

function getAssignedIds(list, type) {
    return normalizeAssignmentEntries(list, type).map(entry => String(entry.id));
}

function normalizeAssignmentEntries(list, type) {
    return (list || []).map(entry => {
        if (typeof entry === 'string') {
            return { id: String(entry), role: '', type: '', assignment_date: '', assignment_start_time: '', assignment_end_time: '', auto_driver: false, asset_id: '', from_location_id: '', to_location_id: '', stay_at_location: false };
        }
        const id = type === 'personnel'
            ? (entry.personnel_id != null ? entry.personnel_id : entry.id)
            : (entry.asset_id != null ? entry.asset_id : entry.id);
        return {
            id: id != null ? String(id) : '',
            role: entry.role || '',
            type: entry.type || '',
            assignment_date: entry.assignment_date || '',
            assignment_start_time: entry.assignment_start_time || '',
            assignment_end_time: entry.assignment_end_time || '',
            auto_driver: entry.auto_driver || false,
            asset_id: entry.asset_id || '',
            from_location_id: entry.from_location_id || '',
            to_location_id: entry.to_location_id || '',
            stay_at_location: entry.stay_at_location || false
        };
    }).filter(entry => entry.id);
}

function toActivityPersonnelPayload(entries) {
    const normalized = normalizeAssignmentEntries(entries, 'personnel');
    return normalized.map(entry => ({
        personnel_id: entry.id,
        role: entry.role || '',
        assignment_date: entry.assignment_date || '',
        assignment_start_time: entry.assignment_start_time || '',
        assignment_end_time: entry.assignment_end_time || '',
        auto_driver: entry.auto_driver || false,
        asset_id: entry.asset_id || '',
        from_location_id: entry.from_location_id || '',
        to_location_id: entry.to_location_id || '',
        stay_at_location: entry.stay_at_location || false
    }));
}

function toActivityAssetPayload(entries) {
    const normalized = normalizeAssignmentEntries(entries, 'assets');
    return normalized.map(entry => ({
        asset_id: entry.id,
        type: entry.type || '',
        assignment_start_time: entry.assignment_start_time || '',
        assignment_end_time: entry.assignment_end_time || '',
        from_location_id: entry.from_location_id || '',
        to_location_id: entry.to_location_id || '',
        stay_at_location: entry.stay_at_location || false
    }));
}

function getActivityTimeRange(activity) {
    if (!activity.activity_date || !activity.start_time || !activity.end_time) {
        return null;
    }
    const start = new Date(`${activity.activity_date}T${activity.start_time}`);
    const end = new Date(`${activity.activity_date}T${activity.end_time}`);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
    return { start, end };
}

function getAssignmentWindow(activity, assignment) {
    if (!activity.activity_date) return null;
    const startTime = assignment.assignment_start_time || activity.start_time;
    const endTime = assignment.assignment_end_time || activity.end_time;
    if (!startTime || !endTime) return null;
    const start = new Date(`${activity.activity_date}T${startTime}`);
    const end = new Date(`${activity.activity_date}T${endTime}`);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
    return { start, end };
}

function getAssetDriverForWindow(assetId, activityDate, startTime, endTime) {
    const asset = appState.assets.find(a => a.id === assetId);
    if (!asset) return null;
    const drivers = normalizeAssignmentEntries(asset.assigned_personnel || [], 'personnel')
        .filter(entry => isAssetOperatorRole(entry.role) && entry.assignment_date === activityDate);
    const target = new Date(`${activityDate}T${startTime}`);
    const targetEnd = new Date(`${activityDate}T${endTime}`);
    return drivers.find(entry => {
        if (!entry.assignment_start_time || !entry.assignment_end_time) return false;
        const start = new Date(`${activityDate}T${entry.assignment_start_time}`);
        const end = new Date(`${activityDate}T${entry.assignment_end_time}`);
        return target < end && start < targetEnd;
    }) || null;
}

function formatActivityDateTime(activity) {
    if (!activity.activity_date) return 'Date/Time TBD';
    const date = parseDateLocal(activity.activity_date);
    const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    if (!activity.start_time || !activity.end_time) return dateStr;
    return `${dateStr} • ${activity.start_time}–${activity.end_time}`;
}

function formatLocationLabel(location) {
    if (!location) return '';
    const parts = [location.name, location.city, location.state].filter(Boolean);
    const base = parts.join(', ');
    return location.zip ? `${base} ${location.zip}` : base;
}

function formatLocationAddress(location) {
    if (!location) return '';
    const lat = location.lat || location.latitude;
    const lng = location.lng || location.longitude;
    if (lat && lng) {
        return `${lat}, ${lng}`;
    }
    const parts = [location.street, location.city, location.state, location.zip].filter(Boolean);
    return parts.join(', ');
}

function buildLocationOptions(selectedId) {
    return `
        <option value="">Select location...</option>
        ${appState.locations.map(loc => `
            <option value="${loc.id}" ${String(selectedId || '') === String(loc.id) ? 'selected' : ''}>${formatLocationLabel(loc)}</option>
        `).join('')}
    `;
}

function openAssignmentRouteModal(type, activityId, index) {
    const activity = appState.activities.find(a => a.id === activityId);
    if (!activity) return;
    const entries = normalizeAssignmentEntries(
        type === 'assets' ? activity.assigned_assets : activity.assigned_personnel,
        type === 'assets' ? 'assets' : 'personnel'
    );
    const entry = entries[index];
    if (!entry) return;

    const modalContent = `
        <form id="routeForm" onsubmit="saveAssignmentRoute(event, '${type}', '${activityId}', ${index})">
            <div class="form-row">
                <label class="form-label">Coming From</label>
                <select class="form-select" id="routeFrom">
                    ${buildLocationOptions(entry.from_location_id)}
                </select>
            </div>
            <div class="form-row">
                <label class="form-label">Going To</label>
                <select class="form-select" id="routeTo">
                    ${buildLocationOptions(entry.to_location_id)}
                </select>
            </div>
            <div class="form-row">
                <label class="form-label">
                    <input type="checkbox" id="routeStay" ${entry.stay_at_location ? 'checked' : ''} style="margin-right: 8px;">
                    Stay At Location
                </label>
            </div>
        </form>
    `;

    const modalFooter = `
        <button class="btn btn-blue" onclick="document.getElementById('routeForm').requestSubmit()">SAVE</button>
        <button class="btn btn-outline" onclick="closeModal()">CANCEL</button>
    `;

    showModal(createModal('ASSIGN ROUTE', modalContent, modalFooter));
}

async function saveAssignmentRoute(e, type, activityId, index) {
    e.preventDefault();
    const fromId = document.getElementById('routeFrom').value || '';
    const toId = document.getElementById('routeTo').value || '';
    const stay = !!document.getElementById('routeStay')?.checked;
    const activity = appState.activities.find(a => a.id === activityId);
    if (!activity) return;

    if (type === 'assets') {
        const entries = normalizeAssignmentEntries(activity.assigned_assets || [], 'assets');
        if (!entries[index]) return;
        entries[index].from_location_id = fromId;
        entries[index].to_location_id = toId;
        entries[index].stay_at_location = stay;
        showLoading();
        try {
            await updateActivity(activityId, { assigned_assets: toActivityAssetPayload(entries) });
            await loadAllData();
            closeModal();
            openActivityDetail(activityId);
        } catch (error) {
            console.error('Failed to update route:', error);
            alert('Failed to update route.');
        } finally {
            hideLoading();
        }
        return;
    }

    const entries = normalizeAssignmentEntries(activity.assigned_personnel || [], 'personnel');
    if (!entries[index]) return;
    entries[index].from_location_id = fromId;
    entries[index].to_location_id = toId;
    entries[index].stay_at_location = stay;
    showLoading();
    try {
        await updateActivity(activityId, { assigned_personnel: toActivityPersonnelPayload(entries) });
        await loadAllData();
        closeModal();
        openActivityDetail(activityId);
    } catch (error) {
        console.error('Failed to update route:', error);
        alert('Failed to update route.');
    } finally {
        hideLoading();
    }
}

function getUserSchedule() {
    const user = getCurrentUser();
    if (!user) return [];
    const person = appState.personnel.find(p => p.cap_id === user.cap_id);
    if (!person) return [];
    const personId = String(person.id);

    const entries = [];
    appState.activities.forEach(activity => {
        const assigned = normalizeAssignmentEntries(activity.assigned_personnel || [], 'personnel')
            .filter(entry => entry.id === personId);
        assigned.forEach(entry => {
            let asset = null;
            if (entry.asset_id) {
                asset = appState.assets.find(a => String(a.id) === String(entry.asset_id)) || null;
            }
            const location = appState.locations.find(l => l.id === activity.location_id);
            let fromLoc = entry.from_location_id ? appState.locations.find(l => String(l.id) === String(entry.from_location_id)) : null;
            let toLoc = entry.to_location_id ? appState.locations.find(l => String(l.id) === String(entry.to_location_id)) : null;
            let stayAtLocation = !!entry.stay_at_location;
            if ((!fromLoc || !toLoc) && entry.asset_id) {
                const assetAssignments = normalizeAssignmentEntries(activity.assigned_assets || [], 'assets')
                    .filter(a => String(a.id) === String(entry.asset_id));
                const match = assetAssignments.find(a => {
                    if (!a.assignment_start_time || !a.assignment_end_time) return false;
                    if (entry.assignment_start_time && entry.assignment_end_time) {
                        return a.assignment_start_time === entry.assignment_start_time &&
                            a.assignment_end_time === entry.assignment_end_time;
                    }
                    return false;
                });
                if (match) {
                    if (!fromLoc && match.from_location_id) {
                        fromLoc = appState.locations.find(l => String(l.id) === String(match.from_location_id)) || null;
                    }
                    if (!toLoc && match.to_location_id) {
                        toLoc = appState.locations.find(l => String(l.id) === String(match.to_location_id)) || null;
                    }
                    if (!stayAtLocation && match.stay_at_location) {
                        stayAtLocation = true;
                    }
                }
            }
            const addressLocation = toLoc || location;
            entries.push({
                activityId: activity.id,
                title: activity.title,
                role: entry.role || '',
                date: activity.activity_date || '',
                start: entry.assignment_start_time || activity.start_time || '',
                end: entry.assignment_end_time || activity.end_time || '',
                asset,
                location,
                fromLocation: fromLoc ? formatLocationLabel(fromLoc) : '',
                toLocation: toLoc ? formatLocationLabel(toLoc) : '',
                fromAddress: fromLoc ? formatLocationAddress(fromLoc) : '',
                toAddress: toLoc ? formatLocationAddress(toLoc) : '',
                stayAtLocation,
                address: formatLocationAddress(addressLocation)
            });
        });
    });

    return entries.sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return (a.start || '').localeCompare(b.start || '');
    });
}

function sortActivities(list, column) {
    const direction = column === 'Completed' ? -1 : 1;
    const withKey = list.map(a => {
        const range = getActivityTimeRange(a);
        return { a, t: range ? range.start.getTime() : Number.POSITIVE_INFINITY };
    });
    return withKey.sort((x, y) => direction * (x.t - y.t)).map(x => x.a);
}

function getDefaultTimelineDate(activities) {
    const dates = activities.map(a => a.activity_date).filter(Boolean).sort();
    if (dates.length) return dates[0];
    const today = new Date();
    return formatDateLocal(today);
}

function getDefaultTimelineDateFromData(activities, resources) {
    const activityDates = (activities || []).map(a => a.activity_date).filter(Boolean);
    const availabilityDates = (resources || []).flatMap(r =>
        normalizeAvailabilityList(r.availability || []).flatMap(a => [a.start_date, a.end_date])
    ).filter(Boolean);

    const allDates = [...activityDates, ...availabilityDates].sort();
    if (allDates.length) return allDates[0];
    return getDefaultTimelineDate([]);
}

function hasTimeConflict(activityId, type, resourceId, _durationOverride, assignmentOverride) {
    const target = appState.activities.find(a => a.id === activityId);
    if (!target) return [];
    const targetRange = getAssignmentWindow(target, assignmentOverride || {});
    if (!targetRange) return [];

    return appState.activities.filter(a => {
        if (a.id === activityId) return false;
        const list = type === 'personnel' ? (a.assigned_personnel || []) : (a.assigned_assets || []);
        const entries = normalizeAssignmentEntries(list, type);
        const matches = entries.filter(entry => entry.id === String(resourceId));
        if (!matches.length) return false;
        return matches.some(entry => {
            const range = getAssignmentWindow(a, entry);
            if (!range) return false;
            return targetRange.start < range.end && range.start < targetRange.end;
        });
    });
}

async function saveActivity(e, eventId) {
    e.preventDefault();
    
    const activityData = {
        event_id: eventId,
        title: document.getElementById('activityTitle').value,
        description: document.getElementById('activityDescription').value,
        location_id: document.getElementById('activityLocation').value || null,
        activity_date: document.getElementById('activityDate').value || null,
        start_time: document.getElementById('activityStartTime').value || null,
        end_time: document.getElementById('activityEndTime').value || null,
        support_personnel_required: JSON.parse(document.getElementById('activitySupportPersonnel').value || '[]'),
        assets_required: JSON.parse(document.getElementById('activityAssetsRequired').value || '[]')
    };

    showLoading();
    closeModal();

    try {
        await createActivity(activityData);
        await loadAllData();
        await selectEvent(eventId, 'events');
    } catch (error) {
        console.error('Failed to create activity:', error);
        alert('Failed to create activity.');
    } finally {
        hideLoading();
    }
}

async function deleteActivityAction(activityId, evt) {
    if (evt) evt.stopPropagation();
    if (!confirm('Are you sure you want to delete this activity?')) {
        return;
    }

    showLoading();
    try {
        await deleteActivity(activityId);
        await loadAllData();
        await selectEvent(appState.selectedEvent.id, 'events');
    } catch (error) {
        console.error('Failed to delete activity:', error);
        alert('Failed to delete activity.');
    } finally {
        hideLoading();
    }
}

function openActivityDetail(activityId, options = {}) {
    const activity = appState.activities.find(a => a.id === activityId);
    if (!activity) return;
    const readOnly = options.readOnly === true;
    const disabledAttr = readOnly ? 'disabled' : '';

    const assignedPersonnelEntries = normalizeAssignmentEntries(activity.assigned_personnel || [], 'personnel');
    const assignedAssetsEntries = normalizeAssignmentEntries(activity.assigned_assets || [], 'assets');

    const assignedPersonnel = assignedPersonnelEntries.map((entry, index) => {
        const person = appState.personnel.find(p => p.id === entry.id);
        const label = person ? `${person.name} (CAP ${person.cap_id})` : entry.id;
        const time = entry.assignment_start_time && entry.assignment_end_time ? ` (${entry.assignment_start_time}-${entry.assignment_end_time})` : '';
        return { id: entry.id, label: entry.role ? `${label} — ${entry.role}${time}` : `${label}${time}`, index };
    });
    const assignedAssets = assignedAssetsEntries.map((entry, index) => {
        const asset = appState.assets.find(a => a.id === entry.id);
        const label = asset ? `${asset.name} (${asset.type})` : entry.id;
        const time = entry.assignment_start_time && entry.assignment_end_time ? ` (${entry.assignment_start_time}-${entry.assignment_end_time})` : '';
        return { id: entry.id, label: entry.type ? `${label} — ${entry.type}${time}` : `${label}${time}`, index };
    });

    const availablePersonnel = appState.personnel.filter(p => {
        if (!isResourceAvailable(p, activity)) return false;
        return !isDriverAssignedToVehicle(p.id, activity);
    });
    const availableAssets = appState.assets.filter(a => {
        if (!isResourceAvailable(a, activity)) return false;
        return assetHasDriverOnDate(a, activity);
    });

    const supportRequiredSection = readOnly ? `
        <div class="form-row">
            <label class="form-label">Support Roles Required</label>
            <div class="tag-list">${renderRequiredListInline(activity.support_personnel_required || [])}</div>
        </div>
    ` : `
        <div class="form-row">
                <label class="form-label">Support Roles Required</label>
                <div class="tag-input-row">
                    <select class="form-select" id="activityEditRoleSelect">
                        <option value="" selected>Select role...</option>
                        ${getSupportRoles().map(role => `<option value="${role}">${role}</option>`).join('')}
                    </select>
                    <input type="text" class="form-input" id="activityEditRoleOther" placeholder="If Other, type role">
                    <button type="button" class="btn btn-outline btn-small" onclick="addSupportRoleEdit()">Add</button>
                </div>
            <div id="activityEditSupportList" class="tag-list"></div>
            <input type="hidden" id="activityEditSupportHidden" value='${JSON.stringify(activity.support_personnel_required || [])}'>
        </div>
    `;

    const assetsRequiredSection = readOnly ? `
        <div class="form-row">
            <label class="form-label">Assets Required</label>
            <div class="tag-list">${renderRequiredListInline(activity.assets_required || [])}</div>
        </div>
    ` : `
            <div class="form-row">
                <label class="form-label">Assets Required</label>
                <div class="tag-input-row">
                    <select class="form-select" id="activityEditAssetSelect">
                        <option value="">Select asset...</option>
                        ${appState.assets.map(a => `<option value="${a.id}">${a.name} (${a.type}) • ${a.details || 'ID N/A'}</option>`).join('')}
                    </select>
                    <button type="button" class="btn btn-outline btn-small" onclick="addAssetRequiredEdit()">Add</button>
                </div>
                <div id="activityEditAssetList" class="tag-list"></div>
                <input type="hidden" id="activityEditAssetHidden" value='${JSON.stringify(activity.assets_required || [])}'>
            </div>
    `;

    const modalContent = `
        <div class="form-row">
            <label class="form-label">Title</label>
            <input type="text" class="form-input" id="activityEditTitle" value="${activity.title}" ${disabledAttr}>
        </div>
        <div class="form-row">
            <label class="form-label">Description</label>
            <textarea class="form-textarea" id="activityEditDescription" ${disabledAttr}>${activity.description || ''}</textarea>
        </div>
        <div class="form-row">
            <label class="form-label">Location</label>
            <select class="form-select" id="activityEditLocation" ${disabledAttr}>
                <option value="">Select location...</option>
                ${appState.locations.map(l => `<option value="${l.id}" ${activity.location_id === l.id ? 'selected' : ''}>${formatLocationLabel(l)}</option>`).join('')}
            </select>
        </div>
        <div class="form-row">
            <label class="form-label">Activity Date</label>
            <input type="date" class="form-input" id="activityEditDate" value="${activity.activity_date || ''}" ${disabledAttr}>
        </div>
        <div class="form-row">
            <label class="form-label">Start Time</label>
            <input type="time" class="form-input" id="activityEditStartTime" value="${activity.start_time || ''}" ${disabledAttr}>
        </div>
        <div class="form-row">
            <label class="form-label">End Time</label>
            <input type="time" class="form-input" id="activityEditEndTime" value="${activity.end_time || ''}" ${disabledAttr}>
        </div>
        <div class="modal-sep"></div>
        ${supportRequiredSection}
        ${assetsRequiredSection}

        ${isPrivileged() && !readOnly ? `
            <div class="modal-sep"></div>
            <div class="form-row">
                <label class="form-label">Assign Personnel (Select Role)</label>
                <div class="tag-input-row stack-sm">
                    <select class="form-select" id="assignPersonnelSelect">
                        <option value="">Select personnel...</option>
                        ${availablePersonnel.map(p => `<option value="${p.id}">${p.name} (CAP ${p.cap_id})</option>`).join('')}
                    </select>
                    <select class="form-select" id="assignPersonnelRole">
                        <option value="">Select role...</option>
                        ${buildRoleOptions(activity.support_personnel_required, activity.assigned_personnel, 'personnel')}
                    </select>
                    <div class="tag-input-row">
                        <input type="time" class="form-input" id="assignPersonnelStartTime" placeholder="Start">
                        <input type="time" class="form-input" id="assignPersonnelEndTime" placeholder="End">
                        <button type="button" class="btn btn-outline btn-small" onclick="assignPersonnelToActivityAction('${activityId}')">Assign</button>
                    </div>
                    <label class="form-label" style="margin: 0; display:flex; align-items:center; gap:8px;">
                        <input type="checkbox" id="assignPersonnelUseActivityTime" onchange="toggleAssignPersonnelActivityTime('${activityId}')">
                        Use activity time
                    </label>
                </div>
            </div>
            <div class="form-row">
                <label class="form-label">Assigned Personnel</label>
                <div class="resource-list">
                    ${assignedPersonnel.length ? assignedPersonnel.map((entry) => {
                        const id = entry.id;
                        const isDriver = entry.label.includes('— Driver');
                        return `
                            <div class="resource-item">
                                <div class="flex-between">
                                    <div class="resource-name">${entry.label}</div>
                                    <div class="flex gap-2">
                                        <button class="btn btn-small btn-outline" onclick="openAssignmentRouteModal('personnel', '${activityId}', ${entry.index})">Route</button>
                                        ${isDriver ? '' : `<button class="btn btn-small btn-outline" onclick="unassignPersonnelAction('${activityId}', '${id}')">Unassign</button>`}
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('') : '<div class="empty-state-text text-center">No personnel assigned</div>'}
                </div>
            </div>

            <div class="form-row">
                <label class="form-label">Assign Asset</label>
                <div class="tag-input-row stack-sm">
                    <select class="form-select" id="assignAssetSelect">
                        <option value="">Select asset...</option>
                        ${availableAssets.map(a => `<option value="${a.id}">${a.name} (${a.type}) • ${a.details || 'ID N/A'}</option>`).join('')}
                    </select>
                    <div class="tag-input-row">
                        <input type="time" class="form-input" id="assignAssetStartTime" placeholder="Start">
                        <input type="time" class="form-input" id="assignAssetEndTime" placeholder="End">
                        <button type="button" class="btn btn-outline btn-small" onclick="assignAssetToActivityAction('${activityId}')">Assign</button>
                    </div>
                </div>
            </div>
            <div class="form-row">
                <label class="form-label">Assigned Assets</label>
                <div class="resource-list">
                    ${assignedAssets.length ? assignedAssets.map((entry) => {
                        const id = entry.id;
                        return `
                            <div class="resource-item">
                                <div class="flex-between">
                                    <div class="resource-name">${entry.label}</div>
                                    <div class="flex gap-2">
                                        <button class="btn btn-small btn-outline" onclick="openAssignmentRouteModal('assets', '${activityId}', ${entry.index})">Route</button>
                                        <button class="btn btn-small btn-outline" onclick="unassignAssetAction('${activityId}', '${id}')">Unassign</button>
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('') : '<div class="empty-state-text text-center">No assets assigned</div>'}
                </div>
            </div>
        ` : ''}
    `;

    const modalFooter = `
        ${readOnly ? '' : `<button class="btn btn-blue" onclick="saveActivityDetails('${activityId}')">SAVE</button>`}
        <button class="btn btn-outline" onclick="closeModal()">CLOSE</button>
    `;

    showModal(createModal('ACTIVITY DETAILS', modalContent, modalFooter));
    if (!readOnly) {
        setupActivityDetailRequirements();
    }
}

async function saveActivityDetails(activityId) {
    const updates = {
        title: document.getElementById('activityEditTitle').value,
        description: document.getElementById('activityEditDescription').value,
        location_id: document.getElementById('activityEditLocation').value || null,
        activity_date: document.getElementById('activityEditDate').value || null,
        start_time: document.getElementById('activityEditStartTime').value || null,
        end_time: document.getElementById('activityEditEndTime').value || null,
        support_personnel_required: JSON.parse(document.getElementById('activityEditSupportHidden').value || '[]'),
        assets_required: JSON.parse(document.getElementById('activityEditAssetHidden').value || '[]')
    };

    showLoading();
    try {
        await updateActivity(activityId, updates);
        await loadAllData();
        if (appState.selectedEvent && appState.selectedEvent.id) {
            await selectEvent(appState.selectedEvent.id, 'events');
        } else {
            renderCurrentView();
        }
        closeModal();
    } catch (error) {
        console.error('Failed to update activity:', error);
        alert('Failed to update activity.');
    } finally {
        hideLoading();
    }
}

function setupActivityDetailRequirements() {
    const supportList = document.getElementById('activityEditSupportList');
    const supportHidden = document.getElementById('activityEditSupportHidden');
    const assetList = document.getElementById('activityEditAssetList');
    const assetHidden = document.getElementById('activityEditAssetHidden');
    if (supportList && supportHidden) {
        renderRequiredList(supportList, JSON.parse(supportHidden.value || '[]'), 'edit-support');
    }
    if (assetList && assetHidden) {
        renderRequiredList(assetList, JSON.parse(assetHidden.value || '[]'), 'edit-asset');
    }
}

function addSupportRoleEdit() {
    const select = document.getElementById('activityEditRoleSelect');
    const other = document.getElementById('activityEditRoleOther');
    const list = document.getElementById('activityEditSupportList');
    const hidden = document.getElementById('activityEditSupportHidden');
    if (!select || !hidden || !list) return;
    const role = select.value === 'Other' ? (other ? other.value.trim() : '') : select.value;
    if (!role) return;
    const items = normalizeRequiredList(JSON.parse(hidden.value || '[]'));
    items.push(role);
    hidden.value = JSON.stringify(items);
    if (other) other.value = '';
    select.value = '';
    renderRequiredList(list, items, 'edit-support');
}

function addAssetRequiredEdit() {
    const select = document.getElementById('activityEditAssetSelect');
    const list = document.getElementById('activityEditAssetList');
    const hidden = document.getElementById('activityEditAssetHidden');
    if (!select || !hidden || !list) return;
    const value = select.value;
    if (!value) return;
    const items = normalizeRequiredList(JSON.parse(hidden.value || '[]'));
    items.push(String(value));
    hidden.value = JSON.stringify(items);
    select.value = '';
    renderRequiredList(list, items, 'edit-asset');
}

async function assignPersonnelToActivityAction(activityId) {
    const select = document.getElementById('assignPersonnelSelect');
    const roleSelect = document.getElementById('assignPersonnelRole');
    const startInput = document.getElementById('assignPersonnelStartTime');
    const endInput = document.getElementById('assignPersonnelEndTime');
    const useActivityTime = document.getElementById('assignPersonnelUseActivityTime');
    const activity = appState.activities.find(a => a.id === activityId);
    if (!select || !select.value) {
        alert('Select a staff member.');
        return;
    }
    if (!roleSelect || !roleSelect.value) {
        alert('Select a role.');
        return;
    }
    if (useActivityTime && useActivityTime.checked && activity) {
        startInput.value = activity.start_time || '';
        endInput.value = activity.end_time || '';
    }
    if (!startInput || !endInput || !startInput.value || !endInput.value) {
        alert('Select a start and end time.');
        return;
    }

    const personId = String(select.value);
    const alreadyAssigned = getAssignedIds(activity ? activity.assigned_personnel : [], 'personnel')
        .includes(personId);
    if (alreadyAssigned) {
        alert('This staff member is already assigned to this activity.');
        return;
    }

    const conflicts = hasTimeConflict(activityId, 'personnel', select.value, null, {
        assignment_start_time: startInput.value,
        assignment_end_time: endInput.value
    });
    if (conflicts.length) {
        const list = conflicts.map(a => a.title).join(', ');
        const ok = confirm(`This operator is scheduled at another activity (${list}) during this time.\n\nAre they going directly from the other activity to this one?`);
        if (!ok) return;
    }

    if (activity) {
        const resource = appState.personnel.find(p => String(p.id) === personId);
        const window = getAssignmentWindow(activity, { assignment_start_time: startInput.value, assignment_end_time: endInput.value });
        if (resource && window) {
            const availability = getAvailabilityWindows(resource, activity.activity_date);
            const within = availability.some(a => window.start >= a.start && window.end <= a.end);
            if (!within) {
                alert('This staff member is not available during this time.');
                return;
            }
        }
    }
    showLoading();
    try {
        const added = await assignPersonnelToActivity(select.value, activityId, roleSelect.value, null, startInput.value, endInput.value, false, '');
        if (!added) {
            alert('This staff member is already assigned to this activity.');
            return;
        }
        await loadAllData();
        const refreshed = appState.activities.find(a => a.id === activityId);
        if (refreshed) {
            const assignedIds = getAssignedIds(refreshed.assigned_personnel || [], 'personnel');
            if (!assignedIds.includes(personId)) {
                alert('Assignment did not persist. Check availability/driver filters or try again.');
                return;
            }
        }
        renderCurrentView();
        closeModal();
        openActivityDetail(activityId);
    } catch (error) {
        console.error('Failed to assign personnel:', error);
        alert('Failed to assign personnel.');
    } finally {
        hideLoading();
    }
}

function toggleAssignPersonnelActivityTime(activityId) {
    const activity = appState.activities.find(a => a.id === activityId);
    const checkbox = document.getElementById('assignPersonnelUseActivityTime');
    const startInput = document.getElementById('assignPersonnelStartTime');
    const endInput = document.getElementById('assignPersonnelEndTime');
    if (!checkbox || !startInput || !endInput) return;
    if (!checkbox.checked) {
        startInput.disabled = false;
        endInput.disabled = false;
        return;
    }
    if (!activity || !activity.start_time || !activity.end_time) {
        checkbox.checked = false;
        alert('Set the activity start/end time first.');
        return;
    }
    startInput.value = activity.start_time;
    endInput.value = activity.end_time;
    startInput.disabled = true;
    endInput.disabled = true;
}

async function assignAssetToActivityAction(activityId) {
    const select = document.getElementById('assignAssetSelect');
    const startInput = document.getElementById('assignAssetStartTime');
    const endInput = document.getElementById('assignAssetEndTime');
    if (!select || !select.value || !startInput || !endInput) return;
    if (!startInput.value || !endInput.value) return;

    const activity = appState.activities.find(a => a.id === activityId);
    const assetId = String(select.value);
    const existingAssignments = normalizeAssignmentEntries(activity ? activity.assigned_assets : [], 'assets')
        .filter(entry => entry.id === assetId);
    const overlapInSameActivity = existingAssignments.some(entry => {
        if (!entry.assignment_start_time || !entry.assignment_end_time) return false;
        const start = new Date(`${activity.activity_date}T${entry.assignment_start_time}`);
        const end = new Date(`${activity.activity_date}T${entry.assignment_end_time}`);
        const targetStart = new Date(`${activity.activity_date}T${startInput.value}`);
        const targetEnd = new Date(`${activity.activity_date}T${endInput.value}`);
        return targetStart < end && start < targetEnd;
    });
    if (overlapInSameActivity) {
        alert('This asset is already assigned to this activity during that time.');
        return;
    }

    const conflicts = hasTimeConflict(activityId, 'assets', select.value, null, {
        assignment_start_time: startInput.value,
        assignment_end_time: endInput.value
    });
    if (conflicts.length) {
        const list = conflicts.map(a => a.title).join(', ');
        const ok = confirm(`This asset is scheduled at another activity (${list}) during this time.\n\nIs it going directly from the other activity to this one?`);
        if (!ok) return;
    }

    if (activity) {
        const resource = appState.assets.find(a => String(a.id) === assetId);
        const window = getAssignmentWindow(activity, { assignment_start_time: startInput.value, assignment_end_time: endInput.value });
        if (resource && window) {
            const availability = getAvailabilityWindows(resource, activity.activity_date);
            const within = availability.some(a => window.start >= a.start && window.end <= a.end);
            if (!within) {
                alert('This asset is not available during this time.');
                return;
            }
        }
        const driver = getAssetDriverForWindow(assetId, activity.activity_date, startInput.value, endInput.value);
        if (!driver) {
            alert('This vehicle must have an operator assigned for this time window.');
            return;
        }
    }
    showLoading();
    try {
        await assignAssetToActivity(select.value, activityId, '', null, startInput.value, endInput.value);
        await addOperatorToActivityForAsset(activityId, assetId, startInput.value, endInput.value);
        await loadAllData();
        await syncDriversForAsset(assetId);
        await ensureOperatorForAssetAssignment(activityId, assetId, startInput.value, endInput.value);
        renderCurrentView();
        closeModal();
        openActivityDetail(activityId);
    } catch (error) {
        console.error('Failed to assign asset:', error);
        alert('Failed to assign asset.');
    } finally {
        hideLoading();
    }
}

async function addOperatorToActivityForAsset(activityId, assetId, startTime, endTime) {
    const activity = appState.activities.find(a => a.id === activityId);
    if (!activity || !activity.activity_date) return;
    const driver = getAssetDriverForWindow(assetId, activity.activity_date, startTime, endTime);
    if (!driver) return;
    const current = normalizeAssignmentEntries(activity.assigned_personnel || [], 'personnel');
    const exists = current.some(entry =>
        entry.auto_driver &&
        String(entry.asset_id) === String(assetId) &&
        entry.assignment_start_time === startTime &&
        entry.assignment_end_time === endTime
    );
    if (exists) return;
    current.push({
        id: driver.id,
        role: driver.role || 'Driver',
        assignment_date: activity.activity_date,
        assignment_start_time: startTime,
        assignment_end_time: endTime,
        auto_driver: true,
        asset_id: String(assetId)
    });
    await updateActivity(activityId, { assigned_personnel: toActivityPersonnelPayload(current) });
}

async function ensureOperatorForAssetAssignment(activityId, assetId, startTime, endTime) {
    const activity = appState.activities.find(a => a.id === activityId);
    if (!activity || !activity.activity_date) return;
    const driver = getAssetDriverForWindow(assetId, activity.activity_date, startTime, endTime);
    if (!driver) return;
    const current = normalizeAssignmentEntries(activity.assigned_personnel || [], 'personnel');
    const exists = current.some(entry =>
        entry.auto_driver &&
        String(entry.asset_id) === String(assetId) &&
        entry.assignment_start_time === startTime &&
        entry.assignment_end_time === endTime
    );
    if (exists) return;
    current.push({
        id: driver.id,
        role: driver.role || 'Driver',
        assignment_date: activity.activity_date,
        assignment_start_time: startTime,
        assignment_end_time: endTime,
        auto_driver: true,
        asset_id: String(assetId)
    });
    await updateActivity(activityId, { assigned_personnel: toActivityPersonnelPayload(current) });
    const refreshed = await getActivities();
    appState.activities = refreshed;
}

// ==================== ASSET ACTIONS ====================

function openAssetModal(assetId = null) {
    const asset = assetId ? appState.assets.find(a => a.id === assetId) : null;
    const availability = asset && asset.availability ? asset.availability : [];
    const assignedDrivers = asset ? normalizeAssignmentEntries(asset.assigned_personnel || [], 'personnel')
        .filter(entry => isAssetOperatorRole(entry.role)) : [];
    
    const modalContent = `
        <form id="assetForm" onsubmit="saveAsset(event, '${assetId || ''}')">
            <div class="form-row">
                <label class="form-label">Asset Name</label>
                <input type="text" class="form-input" id="assetName" value="${asset ? asset.name : ''}" required>
            </div>
            <div class="form-row">
                <label class="form-label">Type</label>
                <input type="text" class="form-input" id="assetType" value="${asset ? asset.type : ''}" placeholder="e.g., Vehicle, Equipment" required>
            </div>
            <div class="form-row">
                <label class="form-label">Details</label>
                <textarea class="form-textarea" id="assetDetails">${asset ? asset.details || '' : ''}</textarea>
            </div>
            <div class="form-row">
                <label class="form-label">Availability (Date Range + Time)</label>
                <div class="availability-row">
                    <div class="availability-field">
                        <label class="form-label-small">Label</label>
                        <input type="text" class="form-input" id="assetAvailLabel" placeholder="Optional">
                    </div>
                    <div class="availability-field">
                        <label class="form-label-small">Date From</label>
                        <input type="date" class="form-input" id="assetAvailStartDate">
                    </div>
                    <div class="availability-field">
                        <label class="form-label-small">Date Until</label>
                        <input type="date" class="form-input" id="assetAvailEndDate">
                    </div>
                </div>
                <div class="availability-row">
                    <div class="availability-field">
                        <label class="form-label-small">Time From</label>
                        <input type="time" class="form-input" id="assetAvailStart">
                    </div>
                    <div class="availability-field">
                        <label class="form-label-small">Time Until</label>
                        <input type="time" class="form-input" id="assetAvailEnd">
                    </div>
                    <button type="button" class="btn btn-outline btn-small" onclick="addAvailabilityEntry('asset')">Add</button>
                </div>
                <div id="assetAvailabilityList" class="availability-list"></div>
                <input type="hidden" id="assetAvailability" value='${JSON.stringify(availability)}'>
            </div>
            <div class="form-row">
                <label class="form-label">Assigned Operators</label>
                <div class="resource-list">
                    ${assignedDrivers.length ? assignedDrivers.map(entry => {
                        const person = appState.personnel.find(p => p.id === entry.id);
                        const label = person ? `${person.name} (CAP ${person.cap_id})` : entry.id;
                        const time = entry.assignment_start_time && entry.assignment_end_time ? ` (${entry.assignment_start_time}-${entry.assignment_end_time})` : '';
                        return `
                            <div class="resource-item">
                                <div class="flex-between">
                                    <div class="resource-name">${label} — ${entry.role || 'Driver'}${time}</div>
                                    <button class="btn btn-small btn-outline" onclick="unassignDriverFromAsset('${assetId}', '${entry.id}')">Unassign</button>
                                </div>
                            </div>
                        `;
                    }).join('') : '<div class="empty-state-text text-center">No operators assigned</div>'}
                </div>
                <div class="mt-4">
                    <button type="button" class="btn btn-outline btn-small" onclick="openAssignDriverModal('${assetId}')">Assign Operator</button>
                </div>
            </div>
        </form>
    `;

    const modalFooter = `
        <button class="btn btn-blue" onclick="document.getElementById('assetForm').requestSubmit()">SAVE</button>
        <button class="btn btn-outline" onclick="closeModal()">CANCEL</button>
    `;

    showModal(createModal(asset ? 'EDIT ASSET' : 'NEW ASSET', modalContent, modalFooter));
    setupAvailabilityList('asset');
}

// ==================== LOCATION ACTIONS ====================

function openLocationModal(locationId = null) {
    const location = locationId ? appState.locations.find(l => l.id === locationId) : null;
    const modalContent = `
        <form id="locationForm" onsubmit="saveLocation(event, '${locationId || ''}')">
            <div class="form-row">
                <label class="form-label">Name</label>
                <input type="text" class="form-input" id="locationName" value="${location ? location.name : ''}" required>
            </div>
            <div class="form-row">
                <label class="form-label">Street</label>
                <input type="text" class="form-input" id="locationStreet" value="${location ? location.street : ''}">
            </div>
            <div class="form-row">
                <label class="form-label">City</label>
                <input type="text" class="form-input" id="locationCity" value="${location ? location.city : ''}">
            </div>
            <div class="form-row">
                <label class="form-label">State</label>
                <input type="text" class="form-input" id="locationState" value="${location ? location.state : ''}">
            </div>
            <div class="form-row">
                <label class="form-label">ZIP</label>
                <input type="text" class="form-input" id="locationZip" value="${location ? location.zip : ''}">
            </div>
            <div class="form-row">
                <label class="form-label">GPS (Latitude, Longitude)</label>
                <input type="text" class="form-input" id="locationGps" placeholder="Latitude, Longitude" value="${location ? ((location.lat || location.latitude) && (location.lng || location.longitude) ? `${location.lat || location.latitude}, ${location.lng || location.longitude}` : '') : ''}">
                <div class="resource-details">Enter GPS instead of a street address if preferred.</div>
            </div>
        </form>
    `;

    const modalFooter = `
        <button class="btn btn-blue" onclick="document.getElementById('locationForm').requestSubmit()">SAVE</button>
        <button class="btn btn-outline" onclick="closeModal()">CANCEL</button>
    `;

    showModal(createModal(location ? 'EDIT LOCATION' : 'NEW LOCATION', modalContent, modalFooter));
}

async function saveLocation(e, locationId) {
    e.preventDefault();
    const gpsRaw = document.getElementById('locationGps').value.trim();
    let lat = '';
    let lng = '';
    if (gpsRaw) {
        const match = gpsRaw.split(',').map(s => s.trim());
        if (match.length >= 2) {
            lat = match[0];
            lng = match[1];
        }
    }
    const street = document.getElementById('locationStreet').value;
    const city = document.getElementById('locationCity').value;
    const state = document.getElementById('locationState').value;
    const zip = document.getElementById('locationZip').value;

    const hasGps = lat && lng;
    const hasAddress = street && city && state;
    if (!hasGps && !hasAddress) {
        alert('Enter a street address or GPS coordinates.');
        return;
    }
    const locationData = {
        name: document.getElementById('locationName').value,
        street,
        city,
        state,
        zip,
        lat: lat || '',
        lng: lng || ''
    };

    showLoading();
    closeModal();
    try {
        if (locationId) {
            await updateLocation(locationId, locationData);
        } else {
            await createLocation(locationData);
        }
        await loadAllData();
        renderCurrentView();
    } catch (error) {
        console.error('Failed to save location:', error);
        alert('Failed to save location.');
    } finally {
        hideLoading();
    }
}

async function deleteLocationAction(locationId) {
    if (!confirm('Are you sure you want to delete this location?')) {
        return;
    }
    showLoading();
    try {
        await deleteLocation(locationId);
        await loadAllData();
        renderCurrentView();
    } catch (error) {
        console.error('Failed to delete location:', error);
        alert('Failed to delete location.');
    } finally {
        hideLoading();
    }
}

function openAssignDriverModal(assetId) {
    const asset = appState.assets.find(a => a.id === assetId);
    const modalContent = `
        <form id="assignDriverForm" onsubmit="saveDriverAssignment(event, '${assetId}')">
            <div class="form-row">
                <label class="form-label">Assign Personnel to ${asset ? asset.name : 'Asset'}</label>
                <select class="form-select" id="assignDriverSelect" required>
                    <option value="">Select personnel...</option>
                    ${appState.personnel.map(p => `<option value="${p.id}">${p.name} (CAP ${p.cap_id})</option>`).join('')}
                </select>
            </div>
            <div class="form-row">
                <label class="form-label">Role</label>
                <select class="form-select" id="assignDriverRole" required>
                    <option value="">Select role...</option>
                    <option value="Driver">Driver</option>
                    <option value="Orientation Pilot">Orientation Pilot</option>
                    <option value="Other">Other</option>
                </select>
            </div>
            <div class="form-row">
                <label class="form-label">Date</label>
                <input type="date" class="form-input" id="assignDriverDate" required>
            </div>
            <div class="form-row">
                <label class="form-label">Start Time</label>
                <input type="time" class="form-input" id="assignDriverStartTime" required>
            </div>
            <div class="form-row">
                <label class="form-label">End Time</label>
                <input type="time" class="form-input" id="assignDriverEndTime" required>
            </div>
        </form>
    `;

    const modalFooter = `
        <button class="btn btn-blue" onclick="document.getElementById('assignDriverForm').requestSubmit()">ASSIGN</button>
        <button class="btn btn-outline" onclick="closeModal()">CANCEL</button>
    `;

    showModal(createModal('ASSIGN VEHICLE ROLE', modalContent, modalFooter));
}

async function saveDriverAssignment(e, assetId) {
    e.preventDefault();
    const driverId = document.getElementById('assignDriverSelect').value;
    const role = document.getElementById('assignDriverRole').value;
    const date = document.getElementById('assignDriverDate').value;
    const startTime = document.getElementById('assignDriverStartTime').value;
    const endTime = document.getElementById('assignDriverEndTime').value;
    if (!driverId || !role || !date || !startTime || !endTime) return;

    const asset = appState.assets.find(a => a.id === assetId);
    if (!asset) return;

    const existingDrivers = normalizeAssignmentEntries(asset.assigned_personnel || [], 'personnel')
        .filter(entry => isAssetOperatorRole(entry.role));
    const driverAlready = existingDrivers.some(entry => entry.id === String(driverId));
    if (driverAlready) {
        alert('This person is already assigned to this vehicle.');
        return;
    }
    const overlap = existingDrivers.some(entry => {
        if (!entry.assignment_start_time || !entry.assignment_end_time) return false;
        const start = new Date(`2000-01-01T${entry.assignment_start_time}`);
        const end = new Date(`2000-01-01T${entry.assignment_end_time}`);
        const targetStart = new Date(`2000-01-01T${startTime}`);
        const targetEnd = new Date(`2000-01-01T${endTime}`);
        return targetStart < end && start < targetEnd;
    });
    if (overlap) {
        alert('This vehicle already has someone assigned during that time window.');
        return;
    }

    showLoading();
    try {
        await assignPersonnelToAsset(driverId, assetId, role, date, startTime, endTime);
        await loadAllData();
        await syncDriversForAsset(assetId);
        renderCurrentView();
        closeModal();
    } catch (error) {
        console.error('Failed to assign driver:', error);
        alert('Failed to assign driver.');
    } finally {
        hideLoading();
    }
}

async function syncDriversForAsset(assetId) {
    const asset = appState.assets.find(a => a.id === assetId);
    if (!asset) return;
    const driverEntries = normalizeAssignmentEntries(asset.assigned_personnel || [], 'personnel')
        .filter(entry => isAssetOperatorRole(entry.role));

    const affectedActivities = appState.activities.filter(a =>
        normalizeAssignmentEntries(a.assigned_assets || [], 'assets')
            .some(entry => entry.id === String(assetId))
    );

    for (const activity of affectedActivities) {
        const assetAssignments = normalizeAssignmentEntries(activity.assigned_assets || [], 'assets')
            .filter(entry => entry.id === String(assetId));

        const overlapsAnyAssetWindow = (entry) => {
            if (String(entry.asset_id || '') !== String(assetId)) return false;
            if (!entry.assignment_start_time || !entry.assignment_end_time) return false;
            return assetAssignments.some(assign => {
                if (!assign.assignment_start_time || !assign.assignment_end_time) return false;
                const tStart = new Date(`${activity.activity_date}T${assign.assignment_start_time}`);
                const tEnd = new Date(`${activity.activity_date}T${assign.assignment_end_time}`);
                const dStart = new Date(`${activity.activity_date}T${entry.assignment_start_time}`);
                const dEnd = new Date(`${activity.activity_date}T${entry.assignment_end_time}`);
                return tStart < dEnd && dStart < tEnd;
            });
        };

        // Remove any driver entries that overlap this asset's assignments
        let updatedPersonnel = normalizeAssignmentEntries(activity.assigned_personnel || [], 'personnel')
            .filter(entry => !(entry.auto_driver && overlapsAnyAssetWindow(entry)));

        assetAssignments.forEach(assign => {
            const driver = driverEntries.find(d =>
                d.assignment_date === activity.activity_date &&
                assign.assignment_start_time && assign.assignment_end_time &&
                d.assignment_start_time && d.assignment_end_time
            && (() => {
                const tStart = new Date(`${activity.activity_date}T${assign.assignment_start_time}`);
                const tEnd = new Date(`${activity.activity_date}T${assign.assignment_end_time}`);
                const dStart = new Date(`${activity.activity_date}T${d.assignment_start_time}`);
                const dEnd = new Date(`${activity.activity_date}T${d.assignment_end_time}`);
                return tStart < dEnd && dStart < tEnd;
            })());

            if (driver) {
                updatedPersonnel.push({
                    id: driver.id,
                    role: driver.role || 'Driver',
                    assignment_date: activity.activity_date,
                    assignment_start_time: assign.assignment_start_time,
                    assignment_end_time: assign.assignment_end_time,
                    auto_driver: true,
                    asset_id: String(assetId)
                });
            }
        });

        await updateActivity(activity.id, { assigned_personnel: toActivityPersonnelPayload(updatedPersonnel) });
    }

    const refreshed = await getActivities();
    appState.activities = refreshed;
}

async function unassignDriverFromAsset(assetId, personnelId) {
    showLoading();
    try {
        const asset = appState.assets.find(a => a.id === assetId);
        if (!asset) throw new Error('Asset not found');
        const updated = (asset.assigned_personnel || []).filter(entry => {
            if (typeof entry === 'string') return entry !== personnelId;
            return entry.personnel_id !== personnelId;
        });
        await updateAsset(assetId, { assigned_personnel: updated });
        await loadAllData();
        await syncDriversForAsset(assetId);
        renderCurrentView();
        closeModal();
        openAssetModal(assetId);
    } catch (error) {
        console.error('Failed to unassign driver:', error);
        alert('Failed to unassign driver.');
    } finally {
        hideLoading();
    }
}

async function saveAsset(e, assetId) {
    e.preventDefault();
    
    const assetData = {
        name: document.getElementById('assetName').value,
        type: document.getElementById('assetType').value,
        details: document.getElementById('assetDetails').value,
        availability: JSON.parse(document.getElementById('assetAvailability').value || '[]')
    };

    showLoading();
    closeModal();

    try {
        if (assetId) {
            await updateAsset(assetId, assetData);
        } else {
            await createAsset(assetData);
        }
        
        await loadAllData();
        renderCurrentView();
    } catch (error) {
        console.error('Failed to save asset:', error);
        alert('Failed to save asset.');
    } finally {
        hideLoading();
    }
}

async function deleteAssetAction(assetId) {
    if (!confirm('Are you sure you want to delete this asset?')) {
        return;
    }

    showLoading();
    try {
        await deleteAsset(assetId);
        await loadAllData();
        renderCurrentView();
    } catch (error) {
        console.error('Failed to delete asset:', error);
        alert('Failed to delete asset.');
    } finally {
        hideLoading();
    }
}

function openAssignAssetModal(assetId) {
    const modalContent = `
        <form id="assignAssetForm" onsubmit="saveAssetAssignment(event, '${assetId}')">
            <div class="form-row">
                <label class="form-label">Assign To Activity</label>
                <select class="form-select" id="assignAssetTo" required>
                    <option value="">Select activity...</option>
                    ${appState.activities.map(a => `<option value="${a.id}">${a.title}</option>`).join('')}
                </select>
            </div>
        </form>
    `;

    const modalFooter = `
        <button class="btn btn-blue" onclick="document.getElementById('assignAssetForm').requestSubmit()">ASSIGN</button>
        <button class="btn btn-outline" onclick="closeModal()">CANCEL</button>
    `;

    showModal(createModal('ASSIGN ASSET', modalContent, modalFooter));
}

async function saveAssetAssignment(e, assetId) {
    e.preventDefault();
    
    const activityId = document.getElementById('assignAssetTo').value;

    showLoading();
    closeModal();

    try {
        alert('Assign assets from the Activity Details panel to set time.');
        return;
    } catch (error) {
        console.error('Failed to assign asset:', error);
        alert('Failed to assign asset.');
    } finally {
        hideLoading();
    }
}

async function unassignAssetAction(activityId, assetId) {
    showLoading();
    try {
        if (!assetId) {
            // Back-compat for calls with only assetId
            await unassignAsset(activityId);
            await loadAllData();
            renderCurrentView();
            return;
        }
        const activity = appState.activities.find(a => a.id === activityId);
        if (!activity) throw new Error('Activity not found');

        const updated = (activity.assigned_assets || []).filter(entry => {
            if (typeof entry === 'string') return entry !== assetId;
            return entry.asset_id !== assetId;
        });
        await updateActivity(activityId, { assigned_assets: updated });

        await loadAllData();
        renderCurrentView();
        closeModal();
        openActivityDetail(activityId);
    } catch (error) {
        console.error('Failed to unassign asset:', error);
        alert('Failed to unassign asset.');
    } finally {
        hideLoading();
    }
}

// ==================== PERSONNEL ACTIONS ====================

function openPersonnelModal(personnelId = null) {
    const person = personnelId ? appState.personnel.find(p => p.id === personnelId) : null;
    const availability = person && person.availability ? person.availability : [];
    
    const modalContent = `
        <form id="personnelForm" onsubmit="savePersonnel(event, '${personnelId || ''}')">
            <div class="form-row">
                <label class="form-label">Name</label>
                <input type="text" class="form-input" id="personnelName" value="${person ? person.name : ''}" required>
            </div>
            <div class="form-row">
                <label class="form-label">CAP ID</label>
                <input type="text" class="form-input" id="personnelCapId" value="${person ? person.cap_id : ''}" required>
            </div>
            <div class="form-row">
                <label class="form-label">Rank</label>
                <input type="text" class="form-input" id="personnelRank" value="${person ? person.rank || '' : ''}">
            </div>
            <div class="form-row">
                <label class="form-label">Specialties</label>
                <textarea class="form-textarea" id="personnelSpecialties">${person ? person.specialties || '' : ''}</textarea>
            </div>
            <div class="form-row">
                <label class="form-label">Availability (Date Range + Time)</label>
                <div class="availability-row">
                    <div class="availability-field">
                        <label class="form-label-small">Label</label>
                        <input type="text" class="form-input" id="personnelAvailLabel" placeholder="Optional">
                    </div>
                    <div class="availability-field">
                        <label class="form-label-small">Date From</label>
                        <input type="date" class="form-input" id="personnelAvailStartDate">
                    </div>
                    <div class="availability-field">
                        <label class="form-label-small">Date Until</label>
                        <input type="date" class="form-input" id="personnelAvailEndDate">
                    </div>
                </div>
                <div class="availability-row">
                    <div class="availability-field">
                        <label class="form-label-small">Time From</label>
                        <input type="time" class="form-input" id="personnelAvailStart">
                    </div>
                    <div class="availability-field">
                        <label class="form-label-small">Time Until</label>
                        <input type="time" class="form-input" id="personnelAvailEnd">
                    </div>
                    <button type="button" class="btn btn-outline btn-small" onclick="addAvailabilityEntry('personnel')">Add</button>
                </div>
                <div id="personnelAvailabilityList" class="availability-list"></div>
                <input type="hidden" id="personnelAvailability" value='${JSON.stringify(availability)}'>
            </div>
        </form>
    `;

    const modalFooter = `
        <button class="btn btn-blue" onclick="document.getElementById('personnelForm').requestSubmit()">SAVE</button>
        <button class="btn btn-outline" onclick="closeModal()">CANCEL</button>
    `;

    showModal(createModal(person ? 'EDIT PERSONNEL' : 'NEW PERSONNEL', modalContent, modalFooter));
    setupAvailabilityList('personnel');
}

async function savePersonnel(e, personnelId) {
    e.preventDefault();
    
    const personnelData = {
        name: document.getElementById('personnelName').value,
        cap_id: document.getElementById('personnelCapId').value,
        rank: document.getElementById('personnelRank').value,
        specialties: document.getElementById('personnelSpecialties').value,
        availability: JSON.parse(document.getElementById('personnelAvailability').value || '[]')
    };

    showLoading();
    closeModal();

    try {
        if (personnelId) {
            await updatePersonnel(personnelId, personnelData);
        } else {
            await createPersonnel(personnelData);
        }
        
        await loadAllData();
        renderCurrentView();
    } catch (error) {
        console.error('Failed to save personnel:', error);
        alert('Failed to save personnel.');
    } finally {
        hideLoading();
    }
}

async function deletePersonnelAction(personnelId) {
    if (!confirm('Are you sure you want to delete this personnel record?')) {
        return;
    }

    showLoading();
    try {
        await deletePersonnel(personnelId);
        await loadAllData();
        renderCurrentView();
    } catch (error) {
        console.error('Failed to delete personnel:', error);
        alert('Failed to delete personnel.');
    } finally {
        hideLoading();
    }
}

function openAssignPersonnelModal(personnelId) {
    const modalContent = `
        <form id="assignPersonnelForm" onsubmit="savePersonnelAssignment(event, '${personnelId}')">
            <div class="form-row">
                <label class="form-label">Assign To</label>
                <select class="form-select" id="assignPersonnelTo" required>
                    <option value="">Select...</option>
                    <optgroup label="Activities">
                        ${appState.activities.map(a => `<option value="activity-${a.id}">${a.title}</option>`).join('')}
                    </optgroup>
                    <optgroup label="Assets">
                        ${appState.assets.map(a => `<option value="asset-${a.id}">${a.name} (${a.type})</option>`).join('')}
                    </optgroup>
                </select>
            </div>
        </form>
    `;

    const modalFooter = `
        <button class="btn btn-blue" onclick="document.getElementById('assignPersonnelForm').requestSubmit()">ASSIGN</button>
        <button class="btn btn-outline" onclick="closeModal()">CANCEL</button>
    `;

    showModal(createModal('ASSIGN PERSONNEL', modalContent, modalFooter));
}

async function savePersonnelAssignment(e, personnelId) {
    e.preventDefault();
    
    const assignTo = document.getElementById('assignPersonnelTo').value;
    const [type, id] = assignTo.split('-');

    showLoading();
    closeModal();

    try {
        if (type === 'activity') {
            alert('Assign personnel from the Activity Details panel to set role and time.');
            return;
        } else if (type === 'asset') {
            alert('Assign drivers from the Asset page to set time.');
            return;
        }
        
        await loadAllData();
        renderCurrentView();
    } catch (error) {
        console.error('Failed to assign personnel:', error);
        alert('Failed to assign personnel.');
    } finally {
        hideLoading();
    }
}

async function unassignPersonnelAction(activityId, personnelId) {
    showLoading();
    try {
        if (!personnelId) {
            // Back-compat for calls with only personnelId
            await unassignPersonnel(activityId);
            await loadAllData();
            renderCurrentView();
            return;
        }
        const activity = appState.activities.find(a => a.id === activityId);
        if (!activity) throw new Error('Activity not found');

        const updated = (activity.assigned_personnel || []).filter(entry => {
            if (typeof entry === 'string') return entry !== personnelId;
            return entry.personnel_id !== personnelId;
        });
        await updateActivity(activityId, { assigned_personnel: updated });

        await loadAllData();
        renderCurrentView();
        closeModal();
        openActivityDetail(activityId);
    } catch (error) {
        console.error('Failed to unassign personnel:', error);
        alert('Failed to unassign personnel.');
    } finally {
        hideLoading();
    }
}
