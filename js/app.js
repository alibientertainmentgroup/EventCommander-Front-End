// Main Application Logic

const BUILD_ID = '20260205-activities-toggle';
const VIEW_STORAGE_KEY = 'cap-event-current-view';

// Ensure loading helpers exist even if components script didn't load yet
if (typeof showLoading !== 'function') {
    window.showLoading = () => {
        const el = document.getElementById('loadingIndicator');
        if (el) el.style.display = 'block';
    };
}
if (typeof hideLoading !== 'function') {
    window.hideLoading = () => {
        const el = document.getElementById('loadingIndicator');
        if (el) el.style.display = 'none';
    };
}

let appState = {
    currentView: 'dashboard',
    events: [],
    activities: [],
    assets: [],
    personnel: [],
    stations: [],
    checkins: [],
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
    selectedInprocessingEvent: null,
    showEventsWithNeeds: false,
    showActivitiesWithNeeds: false,
    adminTab: 'roles',
    inprocessMissingCapId: '',
    manualEntryOpen: false,
    approvalWarning: null,
    isOnline: navigator.onLine,
    pendingCount: 0,
    syncingPending: false,
    offlineCached: false,
    billetingBuildings: [],
    billetingFloors: {}, // buildingId -> floors[]
    billetingRooms: {},  // floorId -> rooms[]
    billetingBunks: {},  // roomId -> bunks[]
    billetingAssignmentsByRoom: {},
    billetingByCap: {},
    billetingAssignCandidate: null,
    billetingExpandedBuildings: {}, // buildingId -> bool
    billetingExpandedFloors: {},    // floorId -> bool
    orgChartPositions: [],
    orgChartCollapsedCapIds: {},
    orgChartActiveType: 'senior'
};

function persistCurrentView() {
    localStorage.setItem(VIEW_STORAGE_KEY, appState.currentView || 'dashboard');
}

function restoreCurrentView() {
    const storedView = localStorage.getItem(VIEW_STORAGE_KEY);
    if (storedView) appState.currentView = storedView;
}

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
        adminItem.style.display = isAdmin() && appState.selectedEvent ? 'flex' : 'none';
    }
    document.querySelectorAll('.nav-item[data-privileged="true"]').forEach(item => {
        item.style.display = isPrivileged() ? 'flex' : 'none';
    });
    ensureOrgChartNavVisible();
}

function ensureOrgChartNavVisible() {
    const nav = document.querySelector('.sidebar-nav');
    if (!nav) return;
    let item = nav.querySelector('.nav-item[data-view="orgchart"]');
    if (!item) {
        item = document.createElement('button');
        item.className = 'nav-item';
        item.dataset.view = 'orgchart';
        item.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="5" r="2"></circle>
                <circle cx="6" cy="12" r="2"></circle>
                <circle cx="18" cy="12" r="2"></circle>
                <circle cx="12" cy="19" r="2"></circle>
                <line x1="12" y1="7" x2="6" y2="10"></line>
                <line x1="12" y1="7" x2="18" y2="10"></line>
                <line x1="6" y1="14" x2="12" y2="17"></line>
                <line x1="18" y1="14" x2="12" y2="17"></line>
            </svg>
            Org Chart
        `;
        const billeting = nav.querySelector('.nav-item[data-view="billeting"]');
        if (billeting && billeting.nextSibling) {
            nav.insertBefore(item, billeting.nextSibling);
        } else {
            nav.appendChild(item);
        }
        item.addEventListener('click', () => switchView('orgchart'));
    }
    item.style.display = 'flex';
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
    try {
    console.log('CAP Event System starting...');
    appState.sandboxMode = localStorage.getItem('cap-event-sandbox-mode') === 'true';
    setupConnectionMonitoring();
    
    // Initialize Supabase
    if (!initSupabase()) {
        return;
    }

    // Setup login form
    document.getElementById('loginForm').addEventListener('submit', handleLogin);

    // Auto-login if saved (requires PIN)
    const savedCapId = localStorage.getItem('cap-event-current-cap-id');
    const savedPin = localStorage.getItem('cap-event-current-pin');
    if (savedCapId && savedPin) {
        try {
            showLoading();
            const user = await loginUser(savedCapId, savedPin);
            document.getElementById('currentUserId').textContent = user.cap_id;
            document.getElementById('userRole').textContent = user.role?.toUpperCase?.() || 'ADMIN';
            document.getElementById('loginScreen').style.display = 'none';
            document.getElementById('appScreen').style.display = 'flex';
            try {
                await loadAllData();
            } catch (err) {
                console.error('Auto-login data load failed, continuing offline:', err);
                appState.events = [];
                appState.activities = [];
                appState.assets = [];
                appState.personnel = [];
                appState.locations = [];
                appState.roster = [];
            }
            restoreCurrentView();
            renderCurrentView();
            updateContextUI();
        } catch (error) {
            console.error('Auto-login failed:', error);
            localStorage.removeItem('cap-event-current-cap-id');
            localStorage.removeItem('cap-event-current-pin');
        } finally {
            hideLoading();
        }
    } else {
        hideLoading();
    }
    } catch (err) {
        console.error('Startup error', err);
    }
});

// ==================== AUTHENTICATION ====================

async function handleLogin(e) {
    e.preventDefault();
    const capId = document.getElementById('capIdInput').value.trim();
    const pin = document.getElementById('capPinInput').value.trim();
    
    if (!capId || !pin) {
        alert('Please enter your CAP ID and PIN');
        return;
    }
    if (!/^\d{8}$/.test(pin)) {
        alert('PIN must be exactly 8 digits');
        return;
    }

    showLoading();
    
    try {
        const user = await loginUser(capId, pin);
        // Start each session with sandbox off
        appState.sandboxMode = false;
        localStorage.setItem('cap-event-sandbox-mode', 'false');
        localStorage.setItem('cap-event-current-cap-id', capId);
        localStorage.setItem('cap-event-current-pin', pin);
        
        // Update UI
        document.getElementById('currentUserId').textContent = user.cap_id;
        document.getElementById('userRole').textContent = user.role?.toUpperCase?.() || 'ADMIN';
        
        // Show app screen
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('appScreen').style.display = 'flex';
        
        // Load initial data
        try {
            await loadAllData();
        } catch (err) {
            console.error('Data load failed, continuing offline:', err);
            appState.events = [];
            appState.activities = [];
            appState.assets = [];
            appState.personnel = [];
            appState.locations = [];
            appState.roster = [];
        }
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

function isBilletingBuildingExpanded(buildingId) {
    return !!(appState.billetingExpandedBuildings && appState.billetingExpandedBuildings[buildingId]);
}

function isBilletingFloorExpanded(floorId) {
    return !!(appState.billetingExpandedFloors && appState.billetingExpandedFloors[floorId]);
}

function toggleBilletingBuilding(buildingId) {
    appState.billetingExpandedBuildings = appState.billetingExpandedBuildings || {};
    appState.billetingExpandedBuildings[buildingId] = !appState.billetingExpandedBuildings[buildingId];
    renderCurrentView();
}

function toggleBilletingFloor(floorId) {
    appState.billetingExpandedFloors = appState.billetingExpandedFloors || {};
    appState.billetingExpandedFloors[floorId] = !appState.billetingExpandedFloors[floorId];
    renderCurrentView();
}

function handleLogout() {
    logoutUser();
    localStorage.removeItem('cap-event-current-cap-id');
    localStorage.removeItem(VIEW_STORAGE_KEY);
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
        timelineDays: 1,
        adminTab: 'roles',
        inprocessMissingCapId: '',
        manualEntryOpen: false,
        approvalWarning: null,
        billetingBuildings: [],
        billetingFloors: {},
        billetingRooms: {},
        billetingBunks: {},
        billetingAssignmentsByRoom: {},
        billetingByCap: {},
        billetingAssignCandidate: null,
        billetingExpandedBuildings: {},
        billetingExpandedFloors: {},
        orgChartPositions: [],
        orgChartCollapsedCapIds: {},
        orgChartActiveType: 'senior'
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

// Forensic UI audit: capture button clicks with context.
document.addEventListener('click', (event) => {
    try {
        const target = event.target && event.target.closest ? event.target.closest('button, .nav-item') : null;
        if (!target) return;
        const actor = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
        if (!actor || !actor.cap_id) return;
        const label = (target.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120);
        if (!label) return;
        const view = appState.currentView || '';
        const eventId = appState.selectedEvent?.id || '';
        addLogEntry({
            type: 'audit',
            action: 'ui-click',
            entity_type: 'ui',
            entity_id: target.id || target.dataset?.view || '',
            entity_name: label,
            details: {
                view,
                event_id: eventId,
                class: target.className || ''
            },
            actor_cap_id: actor.cap_id,
            actor_name: actor.name || '',
            actor_role: actor.role || '',
            cap_id: actor.cap_id,
            name: actor.name || '',
            message: `UI click: ${label}`
        }).catch(() => {});
    } catch {}
}, true);

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
        const results = await Promise.allSettled([
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
        const pick = (idx, fallback, label) => {
            const r = results[idx];
            if (r && r.status === 'fulfilled') return r.value;
            console.warn(`loadAllData: ${label} failed`, r && r.reason ? r.reason : r);
            return fallback;
        };
        const events = pick(0, [], 'events');
        const activities = pick(1, [], 'activities');
        const assets = pick(2, [], 'assets');
        const personnel = pick(3, [], 'personnel');
        const locations = pick(4, [], 'locations');
        const roster = pick(5, [], 'roster');
        const roles = pick(6, [], 'roles');
        const users = pick(7, [], 'users');
        const logs = pick(8, [], 'logs');
        const supportTickets = pick(9, [], 'supportTickets');
        
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

        // Restore selected event from storage if available
        if (!appState.selectedEvent) {
            const storedId = localStorage.getItem('cap-event-selected-event-id');
            if (storedId) {
                const found = appState.events.find(e => String(e.id) === String(storedId));
                if (found) {
                    appState.selectedEvent = found;
                    appState.selectedInprocessingEvent = found.id;
                }
            }
        }

        // Ensure roster and billeting are aligned to the selected event.
        if (appState.selectedEvent && appState.selectedEvent.id) {
            try {
                appState.roster = filterSandbox(await getRoster(appState.selectedEvent.id));
            } catch (err) {
                console.warn('loadAllData: selected-event roster refresh failed', err);
            }
        }
        try {
            await loadBilletingDataForSelectedEvent();
        } catch (err) {
            console.warn('loadAllData: billeting refresh failed', err);
        }
        try {
            await loadOrgChartDataForSelectedEvent();
        } catch (err) {
            console.warn('loadAllData: org chart refresh failed', err);
        }

        if (appState.selectedEvent && appState.isOnline && window.offlineStore) {
            try {
                const accommodations = await (typeof getEventAccommodations === 'function' ? getEventAccommodations(appState.selectedEvent.id) : []);
                const allergies = await (typeof getEventAllergies === 'function' ? getEventAllergies(appState.selectedEvent.id) : []);
                await offlineStore.cacheEventData(appState.selectedEvent.id, {
                    roster: appState.roster,
                    accommodations,
                    allergies,
                    stations: appState.stations || []
                });
                appState.offlineCached = true;
            } catch (err) {
                console.warn('Cache event data failed:', err);
            }
        }

        if (isPrivileged()) {
            try {
                await syncAllDriversForActivities();
                await autoPromoteReady();
            } catch (err) {
                console.warn('loadAllData: post-load privileged sync failed', err);
            }
        }
        
        console.log('✅ Data loaded:', { events: events.length, activities: activities.length, assets: assets.length, personnel: personnel.length });
    } catch (error) {
        console.error('Failed to load data:', error);
    } finally {
        hideLoading();
    }
}

async function syncAllDriversForActivities() {
    const updates = [];
    for (const activity of appState.activities) {
        const assetAssignments = normalizeAssignmentEntries(activity.assigned_assets || [], 'assets');
        const currentPersonnel = normalizeAssignmentEntries(activity.assigned_personnel || [], 'personnel');
        const updatedPersonnel = [...currentPersonnel]; // preserve all existing assignments
        assetAssignments.forEach(assign => {
            if (!assign.assignment_start_time || !assign.assignment_end_time || !activity.activity_date) return;
            const driver = getAssetDriverForWindow(assign.id, activity.activity_date, assign.assignment_start_time, assign.assignment_end_time);
            if (driver) {
                const driverPayload = {
                    id: driver.id,
                    role: driver.role || 'Driver',
                    assignment_date: activity.activity_date,
                    assignment_start_time: assign.assignment_start_time,
                    assignment_end_time: assign.assignment_end_time,
                    auto_driver: true,
                    asset_id: String(assign.id)
                };
                const existingIdx = updatedPersonnel.findIndex(p =>
                    String(p.id) === String(driverPayload.id) &&
                    p.auto_driver === true &&
                    String(p.asset_id || p.id) === String(driverPayload.asset_id)
                );
                if (existingIdx >= 0) {
                    updatedPersonnel[existingIdx] = { ...updatedPersonnel[existingIdx], ...driverPayload };
                } else {
                    updatedPersonnel.push(driverPayload);
                }
            }
        });

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
    const ensureEvent = () => {
        appState.currentView = 'events';
        persistCurrentView();
        return renderEvents(appState.events);
    };
    
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
                postRender = () => { setupKanbanDragAndDrop(); loadEventStations(appState.selectedEvent.id); };
            } else {
                viewHtml = renderEvents(appState.events);
            }
            break;
        case 'inprocessing':
            if (!appState.selectedEvent) {
                viewHtml = ensureEvent();
            } else {
                viewHtml = renderInprocessing(appState.events, appState.personnel, appState.stations, appState.checkins);
                postRender = () => {
                    loadInprocessingStations(appState.selectedEvent.id);
                    focusCapInput();
                    attachCapEnterHandler();
                    if (appState.inprocessProfile && appState.inprocessProfile.capId) {
                        setTimeout(() => renderBilletingSummaryData(appState.inprocessProfile.capId), 80);
                    }
                };
            }
            break;
        case 'outprocessing':
            viewHtml = renderOutprocessing();
            break;
        case 'billeting':
            if (!appState.selectedEvent) {
                viewHtml = ensureEvent();
            } else {
                viewHtml = isPrivileged() ? renderBilletingPlanning() : renderNotAuthorized();
            }
            break;
        case 'orgchart':
            if (!appState.selectedEvent) {
                viewHtml = ensureEvent();
            } else {
                viewHtml = renderOrgChartView(false);
                postRender = () => {
                    if (typeof mountOrgChartHTML === 'function') mountOrgChartHTML();
                };
            }
            break;
        case 'assets':
            if (appState.selectedEvent) {
                const eventActivities = appState.activities.filter(a => a.event_id === appState.selectedEvent.id);
                viewHtml = renderAssets(appState.assets, eventActivities, appState.timelineDate);
            } else {
                viewHtml = ensureEvent();
            }
            break;
        case 'personnel':
            if (appState.selectedEvent) {
                const eventActivities = appState.activities.filter(a => a.event_id === appState.selectedEvent.id);
                viewHtml = renderPersonnel(appState.personnel, eventActivities, appState.timelineDate);
            } else {
                viewHtml = ensureEvent();
            }
            break;
        case 'roster':
            viewHtml = appState.selectedEvent ? renderRoster(appState.roster) : ensureEvent();
            break;
        case 'locations':
            viewHtml = appState.selectedEvent ? renderLocations(appState.locations) : ensureEvent();
            break;
        case 'schedule':
            viewHtml = appState.selectedEvent ? renderSchedule(getUserSchedule()) : ensureEvent();
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
            if (!appState.selectedEvent) {
                viewHtml = ensureEvent();
            } else if (isAdmin()) {
                viewHtml = renderAdminPanel();
                postRender = () => {
                    loadAllStations();
                    if (appState.adminTab === 'orgchart' && typeof mountOrgChartHTML === 'function') {
                        mountOrgChartHTML();
                    }
                };
            } else {
                viewHtml = renderNotAuthorized();
            }
            break;
    }
    const status = typeof renderStatusIndicator === 'function' ? renderStatusIndicator() : '';
    const breadcrumb = appState.selectedEvent ? renderEventBreadcrumb(appState.selectedEvent) : '';
    contentArea.innerHTML = status + renderSandboxBanner() + breadcrumb + viewHtml;
    if (postRender) postRender();
}

function renderSelectEventPrompt() {
    return `
        <div class="empty-state">
            <div class="empty-state-text">Select an event to use admin tools.</div>
        </div>
    `;
}

function setAdminTab(tab) {
    appState.adminTab = tab;
    renderCurrentView();
}

function setOrgChartType(type) {
    const t = String(type || '').toLowerCase() === 'cadet' ? 'cadet' : 'senior';
    appState.orgChartActiveType = t;
    renderCurrentView();
}

function toggleOrgChartBranch(capId) {
    const key = String(capId || '').trim();
    if (!key) return;
    appState.orgChartCollapsedCapIds = appState.orgChartCollapsedCapIds || {};
    appState.orgChartCollapsedCapIds[key] = !appState.orgChartCollapsedCapIds[key];
    renderCurrentView();
}

function openOrgChartProfile(capId) {
    const normalized = normalizeCapId(capId);
    if (!normalized) return;
    switchView('inprocessing');
    setTimeout(() => {
        const input = document.getElementById('inprocessCapId');
        if (input) input.value = normalized;
        lookupInprocessingCadet();
    }, 120);
}

function getOrgChartPersonOptions() {
    const normalize = (v) => normalizeCapId(v);
    const seen = new Set();
    return (appState.roster || [])
        .filter(r => r && r.cap_id)
        .map(r => ({
            capId: normalize(r.cap_id),
            name: (r.full_name || r.name || '').trim() || 'Unknown'
        }))
        .filter(p => p.capId && !seen.has(p.capId) && seen.add(p.capId));
}

function makeOrgChartNodeKey() {
    return `ORG-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
}

function getOrgChartReportsToOptions(currentPositionId = null, chartType = 'senior') {
    const normalize = (v) => String(v || '').trim();
    const current = (appState.orgChartPositions || []).find(p => String(p.id) === String(currentPositionId)) || null;
    const currentCap = current ? normalize(current.cap_id) : '';
    const seen = new Set();
    return (appState.orgChartPositions || [])
        .filter(p => String(p.chart_type || 'senior').toLowerCase() === String(chartType || 'senior').toLowerCase())
        .map(p => {
            const cap = normalize(p.cap_id);
            const personName = String(p.person_name || '').trim();
            return {
                capId: cap,
                label: personName ? `${p.position_title} - ${personName}` : `${p.position_title}`
            };
        })
        .filter(p => p.capId && p.capId !== currentCap && !seen.has(p.capId) && seen.add(p.capId));
}

function openAddOrgChartPositionModal() {
    openOrgChartPositionModal();
}

function openEditOrgChartPositionModal(positionId) {
    const position = (appState.orgChartPositions || []).find(p => String(p.id) === String(positionId));
    if (!position) return;
    openOrgChartPositionModal(position);
}

function openOrgChartPositionModal(position = null) {
    const selectedChartType = String(position?.chart_type || appState.orgChartActiveType || 'senior').toLowerCase() === 'cadet' ? 'cadet' : 'senior';
    const reportsToOptions = getOrgChartReportsToOptions(position ? position.id : null, selectedChartType);
    const selectedName = (position?.person_name || '').replace(/"/g, '&quot;');
    const selectedReportsTo = position ? String(position.reports_to_cap_id || '').trim() : '';
    const selectedCallsign = (position?.callsign || '').replace(/"/g, '&quot;');
    const selectedPhone = (position?.phone || '').replace(/"/g, '&quot;');
    const selectedEmail = (position?.email || '').replace(/"/g, '&quot;');
    const title = position ? 'Edit Org Chart Position' : 'Add Org Chart Position';
    const modal = createModal(title, `
        <div class="form-row">
            <label class="form-label">Position Title</label>
            <input type="text" class="form-input" id="orgChartPositionTitle" placeholder="e.g., Encampment Commander" value="${(position?.position_title || '').replace(/"/g, '&quot;')}">
        </div>
        <div class="form-row">
            <label class="form-label">Chart</label>
            <select class="form-select" id="orgChartChartType">
                <option value="senior" ${selectedChartType === 'senior' ? 'selected' : ''}>Senior Member</option>
                <option value="cadet" ${selectedChartType === 'cadet' ? 'selected' : ''}>Cadet</option>
            </select>
        </div>
        <div class="form-row">
            <label class="form-label">Person Name</label>
            <input type="text" class="form-input" id="orgChartPersonName" placeholder="Enter name" value="${selectedName}">
        </div>
        <div class="form-row">
            <label class="form-label">Callsign</label>
            <input type="text" class="form-input" id="orgChartPositionCallsign" placeholder="e.g., Alpha 1" value="${selectedCallsign}">
        </div>
        <div class="form-row">
            <label class="form-label">Phone</label>
            <input type="text" class="form-input" id="orgChartPositionPhone" placeholder="Phone number" value="${selectedPhone}">
        </div>
        <div class="form-row">
            <label class="form-label">Email</label>
            <input type="email" class="form-input" id="orgChartPositionEmail" placeholder="Email address" value="${selectedEmail}">
        </div>
        <div class="form-row">
            <label class="form-label">Reports To</label>
            <select class="form-select" id="orgChartReportsToCapId">
                <option value="">None - Top Commander</option>
                ${reportsToOptions.map(p => `<option value="${p.capId}" ${p.capId === selectedReportsTo ? 'selected' : ''}>${p.label}</option>`).join('')}
            </select>
        </div>
        <div class="resource-details" id="orgChartPositionError" style="color:#f87171;margin-top:8px;"></div>
    `, `
        <button class="btn btn-blue" onclick="submitOrgChartPosition('${position ? 'edit' : 'add'}', '${position ? position.id : ''}')">Save</button>
        <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
    `);
    showModal(modal);
}

function wouldCreateOrgChartCycle(positionId, capId, reportsToCapId) {
    const normalize = (v) => String(v || '').trim();
    const targetCap = normalize(capId);
    const parentCap = normalize(reportsToCapId);
    if (!targetCap || !parentCap) return false;
    if (targetCap === parentCap) return true;

    const temp = (appState.orgChartPositions || []).map(p => ({ ...p }));
    if (positionId) {
        const idx = temp.findIndex(p => String(p.id) === String(positionId));
        if (idx >= 0) {
            temp[idx].cap_id = targetCap;
            temp[idx].reports_to_cap_id = parentCap || null;
        }
    } else {
        temp.push({ id: '__new__', cap_id: targetCap, reports_to_cap_id: parentCap });
    }

    const parentByCap = {};
    temp.forEach(p => {
        const child = normalize(p.cap_id);
        const parent = normalize(p.reports_to_cap_id);
        if (!child || !parent) return;
        if (!parentByCap[child]) parentByCap[child] = new Set();
        parentByCap[child].add(parent);
    });

    const visited = new Set();
    const stack = [parentCap];
    while (stack.length) {
        const current = stack.pop();
        if (!current) continue;
        if (current === targetCap) return true;
        if (visited.has(current)) continue;
        visited.add(current);
        const parents = parentByCap[current];
        if (parents) parents.forEach(p => stack.push(p));
    }
    return false;
}

async function submitOrgChartPosition(mode, positionId = '') {
    const titleEl = document.getElementById('orgChartPositionTitle');
    const chartTypeEl = document.getElementById('orgChartChartType');
    const nameEl = document.getElementById('orgChartPersonName');
    const callsignEl = document.getElementById('orgChartPositionCallsign');
    const phoneEl = document.getElementById('orgChartPositionPhone');
    const emailEl = document.getElementById('orgChartPositionEmail');
    const reportsEl = document.getElementById('orgChartReportsToCapId');
    const errEl = document.getElementById('orgChartPositionError');
    const setErr = (m) => { if (errEl) errEl.textContent = m; };

    const positionTitle = (titleEl?.value || '').trim();
    const chartType = String(chartTypeEl?.value || appState.orgChartActiveType || 'senior').toLowerCase() === 'cadet' ? 'cadet' : 'senior';
    const personName = (nameEl?.value || '').trim();
    const callsign = (callsignEl?.value || '').trim();
    const phone = (phoneEl?.value || '').trim();
    const email = (emailEl?.value || '').trim();
    const reportsToCapId = String(reportsEl?.value || '').trim();

    setErr('');
    if (!appState.selectedEvent || !appState.selectedEvent.id) { setErr('Select an event first.'); return; }
    if (!positionTitle) { setErr('Position title is required.'); return; }
    if (!personName) { setErr('Person name is required.'); return; }

    const existing = (appState.orgChartPositions || []).find(p => String(p.id) === String(positionId));
    const nodeKey = mode === 'edit' && existing ? String(existing.cap_id || '').trim() : makeOrgChartNodeKey();
    if (!nodeKey) { setErr('Unable to generate org chart node key.'); return; }

    if (reportsToCapId && wouldCreateOrgChartCycle(positionId || null, nodeKey, reportsToCapId)) {
        setErr('Reporting structure creates a cycle. Choose a different Reports To value.');
        return;
    }

    showLoading();
    try {
        if (mode === 'edit' && positionId) {
            await updateOrgChartPosition(positionId, {
                cap_id: nodeKey,
                chart_type: chartType,
                person_name: personName,
                position_title: positionTitle,
                callsign: callsign || null,
                phone: phone || null,
                email: email || null,
                reports_to_cap_id: reportsToCapId || null
            });
        } else {
            await createOrgChartPosition({
                event_id: appState.selectedEvent.id,
                cap_id: nodeKey,
                chart_type: chartType,
                person_name: personName,
                position_title: positionTitle,
                callsign: callsign || null,
                phone: phone || null,
                email: email || null,
                reports_to_cap_id: reportsToCapId || null
            });
        }
        await loadOrgChartDataForSelectedEvent();
        closeModal();
        renderCurrentView();
    } catch (error) {
        console.error('Save org chart position failed:', error);
        setErr(error.message || 'Failed to save position.');
    } finally {
        hideLoading();
    }
}

async function deleteOrgChartPositionAction(positionId) {
    if (!positionId) return;
    if (!confirm('Delete this org chart position?')) return;
    showLoading();
    try {
        await deleteOrgChartPosition(positionId);
        await loadOrgChartDataForSelectedEvent();
        renderCurrentView();
    } catch (error) {
        console.error('Delete org chart position failed:', error);
        alert('Failed to delete position.');
    } finally {
        hideLoading();
    }
}

function returnToEvents() {
    appState.selectedEvent = null;
    localStorage.removeItem('cap-event-selected-event-id');
    appState.currentView = 'events';
    persistCurrentView();
    appState.inprocessProfile = null;
    appState.inprocessMessage = '';
    appState.approvalWarning = null;
    appState.manualEntryOpen = false;
    appState.inprocessMissingCapId = '';
    renderCurrentView();
    updateContextUI();
}

function openManualEntry() {
    appState.manualEntryOpen = true;
    renderCurrentView();
}

async function saveManualEntry(e) {
    if (e) e.preventDefault();
    if (!appState.selectedEvent) {
        alert('Select an event first.');
        return;
    }
    const capId = normalizeCapId(document.getElementById('manualCapId').value);
    if (!capId) return alert('CAP ID is required.');
    const payload = {
        cap_id: capId,
        full_name: document.getElementById('manualFullName').value.trim(),
        rank: document.getElementById('manualRank').value.trim(),
        member_type: document.getElementById('manualMemberType').value,
        shirt_size: document.getElementById('manualShirtSize').value.trim(),
        cell_phone: document.getElementById('manualCellPhone').value.trim(),
        emergency_contact_name: document.getElementById('manualEmergName').value.trim(),
        emergency_contact_phone: document.getElementById('manualEmergPhone').value.trim(),
        email: document.getElementById('manualEmail').value.trim()
    };
    showLoading();
    try {
        await addEventRosterEntry(appState.selectedEvent.id, payload);
        appState.manualEntryOpen = false;
        appState.inprocessMissingCapId = '';
        await lookupAfterCreate(capId);
    } catch (error) {
        console.error('Manual entry failed:', error);
        alert('Failed to add person.');
    } finally {
        hideLoading();
    }
}

async function lookupAfterCreate(capId) {
    const { roster, accommodations, allergies } = await getEventProfile(appState.selectedEvent.id, capId);
    if (!roster) {
        appState.inprocessProfile = null;
        appState.inprocessMessage = 'Could not load new record.';
    } else {
        appState.inprocessProfile = {
            capId: roster.cap_id,
            name: roster.full_name || roster.name || '',
            rank: roster.rank,
            memberType: roster.member_type,
            memberStatus: roster.member_status,
            membershipExpiration: roster.expiration,
            shirtSize: roster.shirt_size,
            cellPhone: roster.cell_phone,
            homePhone: roster.home_phone,
            emergencyContact: roster.emergency_contact_name,
            emergencyPhone: roster.emergency_contact_phone,
            email: roster.email,
            accommodations,
            allergies
        };
        appState.inprocessMessage = '';
    }
    renderCurrentView();
}

function cancelManualEntry() {
    appState.manualEntryOpen = false;
    renderCurrentView();
}

async function proceedApprovalBypass() {
    const warn = appState.approvalWarning;
    if (!warn) return;
    const profile = warn.profile;
    appState.inprocessProfile = profile;
    appState.approvalWarning = null;
    appState.inprocessMessage = '';
    try {
        const user = getCurrentUser ? getCurrentUser() : null;
        await addLogEntry({
            type: 'audit',
            action: 'inprocessing-bypass',
            entity_type: 'registration',
            entity_id: profile.capId,
            message: `Bypass approvals for CAP ${profile.capId} (Unit: ${warn.unitApproved || 'N/A'}, Parent: ${warn.parentApproved || 'N/A'})`,
            actor_cap_id: user?.cap_id || '',
            created_at: new Date().toISOString()
        });
    } catch (err) {
        console.error('Bypass log failed:', err);
    }
    renderCurrentView();
}

function cancelApprovalBypass() {
    appState.approvalWarning = null;
    appState.inprocessProfile = null;
    appState.inprocessMessage = 'Approval required. Lookup another CAP ID.';
    renderCurrentView();
    resetScannerReady();
}

function focusCapInput() {
    const input = document.getElementById('inprocessCapId');
    if (input) input.focus();
    const field = document.querySelector('.cap-id-input');
    if (field) field.classList.add('scanner-ready');
}

function attachCapEnterHandler() {
    const input = document.getElementById('inprocessCapId');
    if (!input) return;
    input.removeEventListener('keydown', input.__capEnterHandler || (() => {}));
    const handler = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            lookupInprocessingCadet();
        }
    };
    input.__capEnterHandler = handler;
    input.addEventListener('keydown', handler);
}

function resetScannerReady() {
    const input = document.getElementById('inprocessCapId');
    if (input) input.value = '';
    focusCapInput();
}

async function loadBilletingDataForSelectedEvent() {
    if (appState.selectedEvent && appState.selectedEvent.id) {
        let bldgs = [];
        try {
            bldgs = await getBuildingsForEvent(appState.selectedEvent.id);
        } catch (err) {
            console.warn('loadBilletingData: buildings fetch failed', err);
        }
        appState.billetingBuildings = bldgs || [];
        const floorsBy = {};
        const roomsBy = {};
        const assignmentsByRoom = {};
        for (const b of (bldgs || [])) {
            let floors = [];
            try {
                floors = await getFloorsForBuilding(b.id);
            } catch (err) {
                console.warn(`loadBilletingData: floors fetch failed for building ${b.id}`, err);
            }
            floorsBy[b.id] = floors || [];
            for (const f of floorsBy[b.id]) {
                let rooms = [];
                try {
                    rooms = await getRoomsForFloor(f.id);
                } catch (err) {
                    console.warn(`loadBilletingData: rooms fetch failed for floor ${f.id}`, err);
                }
                roomsBy[f.id] = rooms || [];
                for (const r of roomsBy[f.id]) {
                    try {
                        assignmentsByRoom[r.id] = await getAssignmentsForRoom(r.id);
                    } catch (err) {
                        console.warn(`loadBilletingData: assignments fetch failed for room ${r.id}`, err);
                        assignmentsByRoom[r.id] = [];
                    }
                }
            }
        }
        appState.billetingFloors = floorsBy;
        appState.billetingRooms = roomsBy;
        appState.billetingBunks = {};
        appState.billetingAssignmentsByRoom = assignmentsByRoom;
        appState.billetingByCap = {};
        const allowedBuildingIds = new Set((bldgs || []).map(b => String(b.id)));
        const allowedFloorIds = new Set(Object.values(floorsBy).flat().map(f => String(f.id)));
        const prevBuildingExpanded = appState.billetingExpandedBuildings || {};
        const prevFloorExpanded = appState.billetingExpandedFloors || {};
        appState.billetingExpandedBuildings = Object.fromEntries(
            Object.entries(prevBuildingExpanded).filter(([id, expanded]) => !!expanded && allowedBuildingIds.has(String(id)))
        );
        appState.billetingExpandedFloors = Object.fromEntries(
            Object.entries(prevFloorExpanded).filter(([id, expanded]) => !!expanded && allowedFloorIds.has(String(id)))
        );
        return;
    }

    appState.billetingBuildings = [];
    appState.billetingFloors = {};
    appState.billetingRooms = {};
    appState.billetingBunks = {};
    appState.billetingAssignmentsByRoom = {};
    appState.billetingByCap = {};
    appState.billetingExpandedBuildings = {};
    appState.billetingExpandedFloors = {};
}

async function loadOrgChartDataForSelectedEvent() {
    if (appState.selectedEvent && appState.selectedEvent.id) {
        const positions = await getOrgChartPositionsByEvent(appState.selectedEvent.id);
        appState.orgChartPositions = Array.isArray(positions) ? positions : [];
        return;
    }
    appState.orgChartPositions = [];
    appState.orgChartCollapsedCapIds = {};
}

function nextInprocessPerson() {
    // Clear current lookup/profile and UI state for the next scan
    appState.inprocessProfile = null;
    appState.inprocessMessage = '';
    appState.inprocessStation = null;
    appState.approvalWarning = null;
    appState.inprocessMissingCapId = '';
    appState.manualEntryOpen = false;
    const input = document.getElementById('inprocessCapId');
    if (input) input.value = '';
    const staffBox = document.getElementById('staffOverride');
    if (staffBox) staffBox.checked = false;
    renderCurrentView();
    focusCapInput();
}

async function loadInprocessingStations(eventId) {
    if (!eventId) {
        const container = document.getElementById('inprocessingStationsContainer');
        if (container) container.innerHTML = '<div class="empty-state"><div class="empty-state-text">Select an event</div></div>';
        return;
    }

    showLoading();
    try {
        appState.selectedInprocessingEvent = eventId;
        const stations = appState.isOnline ? await getStations(eventId) : (offlineStore ? await offlineStore.getCachedStations(eventId) : []);
        appState.stations = stations || [];

        const checkinsArr = appState.isOnline ? await Promise.all((stations || []).map(s => getCheckins(s.id))) : [];
        appState.checkins = (checkinsArr || []).flat();

        const container = document.getElementById('inprocessingStationsContainer');
        if (container) {
            const activeEntry = typeof getActiveRosterEntry === 'function' ? getActiveRosterEntry() : null;
            container.innerHTML = (appState.inprocessProfile && activeEntry)
                ? renderInprocessingStationsForProfile(appState.stations, appState.inprocessProfile, appState.checkins)
                : '';
        }
    } catch (error) {
        console.error('Failed to load stations:', error);
        alert('Failed to load stations');
    } finally {
        hideLoading();
    }
}

async function loadAllStations() {
    if (!appState.selectedEvent) {
        const adminList = document.getElementById('adminStationsList');
        if (adminList) adminList.innerHTML = '<div class="empty-state-text text-center">Select an event.</div>';
        return;
    }
    showLoading();
    try {
        const stations = await getStations(appState.selectedEvent.id);
        appState.stations = stations || [];
        const checkinsArr = await Promise.all((appState.stations || []).map(s => getCheckins(s.id)));
        appState.checkins = (checkinsArr || []).flat();
        // re-render admin panel list area if present
        const adminList = document.getElementById('adminStationsList');
        if (adminList) adminList.innerHTML = (appState.stations.length ? appState.stations.map(station => {
            const evt = appState.events.find(e => e.id === station.event_id) || {};
            return `
                <div class="resource-item">
                    <div>
                        <div class="resource-name">${station.name}</div>
                        <div class="resource-details">Event: ${evt.title || '-'}</div>
                    </div>
                    <div class="flex gap-2">
                        <button class="btn btn-outline btn-small" onclick="openEditStationModal('${station.id.replace(/'/g, "\\'")}')">Edit</button>
                        <button class="btn btn-ghost btn-small" onclick="deleteStationAction('${station.id.replace(/'/g, "\\'")}')">Delete</button>
                    </div>
                </div>
            `;
        }).join('') : '<div class="empty-state-text text-center">No stations configured.</div>');
    } catch (error) {
        console.error('Failed to load all stations:', error);
    } finally {
        hideLoading();
    }
}

// ==================== REGISTRATION IMPORT ====================

async function handleRegistrationUpload() {
    const statusEl = document.getElementById('registrationUploadStatus');
    const messageEl = document.getElementById('registrationUploadMessage');
    const fileInput = document.getElementById('registrationUploadFile');
    const eventId = appState.selectedEvent ? appState.selectedEvent.id : '';

    if (!fileInput || !fileInput.files || !fileInput.files.length) {
        alert('Select a .xlsx file to upload.');
        return;
    }

    if (!eventId) {
        alert('Select an event first.');
        return;
    }

    const file = fileInput.files[0];
    statusEl.textContent = 'Reading file...';
    messageEl.textContent = '';

    try {
        showLoading();
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

        if (!rows || rows.length < 2) {
            throw new Error('No data rows found in the worksheet.');
        }

        const col = (letter) => XLSX.utils.decode_col(letter);
        const mapRow = (row) => {
            const val = (letter) => normalizeCell(row[col(letter)]);
            const capId = val('B');
            if (!capId) return null;
            const lastName = val('G');
            const firstName = val('H');
            return {
                cap_id: capId,
                name_first: firstName,
                name_last: lastName,
                full_name: [firstName, lastName].filter(Boolean).join(' ').trim(),
                rank: val('F'),
                region: val('J'),
                wing: val('K'),
                unit: val('L'),
                gender: val('M'),
                dob: val('N'),
                age: Number(val('O')) || null,
                shirt_size: val('T'),
                member_type: val('U'),
                expiration: val('V'),
                member_status: val('W'),
                home_phone: val('X'),
                cell_phone: val('Y'),
                emergency_contact_name: val('Z'),
                emergency_contact_phone: val('AA'),
                email: val('AB'),
                unit_approved: val('AR'),
                parent_approved: val('CM'),
            };
        };

        const dataRows = rows.slice(1) // skip header
            .map(mapRow)
            .filter(Boolean);

        if (!dataRows.length) {
            throw new Error('No valid CAP IDs found in column B.');
        }

        statusEl.textContent = 'Uploading...';

        const count = await uploadRegistrations(eventId, dataRows);

        statusEl.textContent = '';
        messageEl.textContent = `✓ Uploaded ${count} registrations.`;

        // Refresh roster cache for the selected event if it matches
        if (appState.selectedEvent && appState.selectedEvent.id === eventId) {
            appState.roster = await getRoster(eventId);
            renderCurrentView();
        }
    } catch (error) {
        console.error('Registration upload failed:', error);
        statusEl.textContent = '';
        messageEl.textContent = `Error: ${error.message || error}`;
        alert('Upload failed: ' + (error.message || error));
    } finally {
        hideLoading();
    }
}

function normalizeCell(value) {
    if (value == null) return '';
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    if (typeof value === 'number' && value > 20000 && value < 50000 && XLSX?.SSF?.parse_date_code) {
        const d = XLSX.SSF.parse_date_code(value);
        if (d) {
            const pad = (n) => String(n).padStart(2, '0');
            return `${d.y}-${pad(d.m)}-${pad(d.d)}`;
        }
    }
    return String(value).trim();
}

function isYes(val) {
    const s = String(val || '').trim().toLowerCase();
    if (!s) return false;
    return ['yes', 'y', 'true', 't', '1', 'approved'].includes(s);
}

function setupConnectionMonitoring() {
    window.addEventListener('online', () => {
        appState.isOnline = true;
        renderCurrentView();
        syncPendingNow();
    });
    window.addEventListener('offline', () => {
        appState.isOnline = false;
        renderCurrentView();
    });
    refreshPendingCount();
    setInterval(async () => {
        const online = await confirmOnline();
        if (online !== appState.isOnline) {
            appState.isOnline = online;
            if (online) syncPendingNow();
            renderCurrentView();
        }
        refreshPendingCount();
    }, 15000);
}

async function confirmOnline() {
    if (!supabaseClient) return navigator.onLine;
    try {
        const { error } = await supabaseClient.from('events').select('id').limit(1);
        if (error) throw error;
        return true;
    } catch {
        return navigator.onLine && false;
    }
}

async function refreshPendingCount() {
    if (!window.offlineStore) return;
    const pending = await offlineStore.getPendingCheckins();
    appState.pendingCount = pending.length;
}

async function syncPendingNow() {
    if (!window.offlineStore || appState.syncingPending) return;
    const pending = await offlineStore.getPendingCheckins();
    appState.pendingCount = pending.length;
    if (!pending.length || !appState.isOnline) {
        renderCurrentView();
        return;
    }
    appState.syncingPending = true;
    renderCurrentView();
    try {
        for (const item of pending) {
            await checkInPersonnel(item.stationId, item.personnelId, item.checkedInBy || '');
            await offlineStore.removePendingCheckin(item.id);
        }
    } catch (err) {
        console.error('Sync failed:', err);
    } finally {
        const remaining = await offlineStore.getPendingCheckins();
        appState.pendingCount = remaining.length;
        appState.syncingPending = false;
        renderCurrentView();
    }
}

async function handleAccommodationsUpload() {
    const statusEl = document.getElementById('accommodationsUploadStatus');
    const messageEl = document.getElementById('accommodationsUploadMessage');
    const fileInput = document.getElementById('accommodationsUploadFile');
    const eventId = appState.selectedEvent ? appState.selectedEvent.id : '';
    if (!eventId) return alert('Select an event first.');
    if (!fileInput || !fileInput.files || !fileInput.files.length) return alert('Select a .xlsx file to upload.');

    statusEl.textContent = 'Reading file...';
    messageEl.textContent = '';
    try {
        showLoading();
        const file = fileInput.files[0];
        const arrayBuffer = await file.arrayBuffer();
        const sheet = XLSX.read(arrayBuffer, { type: 'array' }).Sheets[XLSX.read(arrayBuffer, { type: 'array' }).SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
        const col = (letter) => XLSX.utils.decode_col(letter);
        const mapRow = (row) => {
            const val = (letter) => normalizeCell(row[col(letter)]);
            const capId = val('C');
            if (!capId) return null;
            return {
                cap_id: capId,
                full_name: val('D'),
                member_type: val('E'),
                accommodation_type: val('F'),
                temporary: val('G'),
                start_date: val('H'),
                end_date: val('I'),
                description: val('J')
            };
        };
        const dataRows = rows.slice(1).map(mapRow).filter(Boolean);
        if (!dataRows.length) throw new Error('No valid rows found.');
        statusEl.textContent = 'Uploading...';
        const count = await uploadAccommodations(eventId, dataRows);
        statusEl.textContent = '';
        messageEl.textContent = `✓ Uploaded ${count} accommodations.`;
    } catch (error) {
        console.error('Accommodations upload failed:', error);
        statusEl.textContent = '';
        messageEl.textContent = `Error: ${error.message || error}`;
        alert('Upload failed: ' + (error.message || error));
    } finally {
        hideLoading();
    }
}

async function handleAllergiesUpload() {
    const statusEl = document.getElementById('allergiesUploadStatus');
    const messageEl = document.getElementById('allergiesUploadMessage');
    const fileInput = document.getElementById('allergiesUploadFile');
    const eventId = appState.selectedEvent ? appState.selectedEvent.id : '';
    if (!eventId) return alert('Select an event first.');
    if (!fileInput || !fileInput.files || !fileInput.files.length) return alert('Select a .xlsx file to upload.');

    statusEl.textContent = 'Reading file...';
    messageEl.textContent = '';
    try {
        showLoading();
        const file = fileInput.files[0];
        const arrayBuffer = await file.arrayBuffer();
        const sheet = XLSX.read(arrayBuffer, { type: 'array' }).Sheets[XLSX.read(arrayBuffer, { type: 'array' }).SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
        const col = (letter) => XLSX.utils.decode_col(letter);
        const mapRow = (row) => {
            const val = (letter) => normalizeCell(row[col(letter)]);
            const capId = val('C');
            if (!capId) return null;
            return {
                cap_id: capId,
                is_anaphyaxis: val('D'),
                has_epipen: val('E'),
                has_albuterol_inhaler: val('F'),
                full_name: val('G'),
                allergy_name: val('H'),
                allergy_type: val('I'),
                typical_reactions: val('J'),
                treatments: val('K'),
                contact_name: val('L'),
                emergency_contact: val('M'),
                commander_name: val('N'),
                commander_contact: val('O'),
                other_medications: val('P'),
                other_reactions: val('Q'),
            };
        };
        const dataRows = rows.slice(1).map(mapRow).filter(Boolean);
        if (!dataRows.length) throw new Error('No valid rows found.');
        statusEl.textContent = 'Uploading...';
        const count = await uploadAllergies(eventId, dataRows);
        statusEl.textContent = '';
        messageEl.textContent = `✓ Uploaded ${count} allergy records.`;
    } catch (error) {
        console.error('Allergies upload failed:', error);
        statusEl.textContent = '';
        messageEl.textContent = `Error: ${error.message || error}`;
        alert('Upload failed: ' + (error.message || error));
    } finally {
        hideLoading();
    }
}

async function handleProfileUploadGeneric(opts) {
    const { fileInputId, statusId, messageId, field, valueHeaders } = opts;
    const statusEl = document.getElementById(statusId);
    const messageEl = document.getElementById(messageId);
    const fileInput = document.getElementById(fileInputId);
    const eventId = appState.selectedEvent ? appState.selectedEvent.id : '';

    if (!eventId) {
        alert('Select an event first.');
        return;
    }
    if (!fileInput || !fileInput.files || !fileInput.files.length) {
        alert('Select a .xlsx file to upload.');
        return;
    }

    statusEl.textContent = 'Reading file...';
    messageEl.textContent = '';

    try {
        showLoading();
        const file = fileInput.files[0];
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
        if (!rows || rows.length < 2) {
            throw new Error('No data rows found.');
        }

        const headers = rows[0].map(h => String(h || '').trim().toLowerCase());
        const capIdx = findHeaderIndex(headers, ['capid', 'cap id', 'cap_id', 'id', 'memberid', 'member id'], 1);
        const valIdx = findHeaderIndex(headers, valueHeaders, 2);

        const updates = rows.slice(1).map(r => {
            const cap = normalizeCapId(r[capIdx]);
            const val = normalizeCell(r[valIdx]);
            if (!cap || !val) return null;
            const existing = (appState.roster || []).find(entry => normalizeCapId(entry.cap_id) === cap);
            const mergedProfile = { ...(existing?.profile || {}), [field]: val };
            return { cap_id: cap, profile: mergedProfile };
        }).filter(Boolean);

        if (!updates.length) {
            throw new Error('No valid rows found.');
        }

        statusEl.textContent = 'Uploading...';
        await applyRosterProfileUpdates(eventId, updates);

        statusEl.textContent = '';
        messageEl.textContent = `Updated ${updates.length} records.`;

        if (appState.selectedEvent && appState.selectedEvent.id === eventId) {
            appState.roster = await getRoster(eventId);
            renderCurrentView();
        }
    } catch (error) {
        console.error('Profile upload failed:', error);
        statusEl.textContent = '';
        messageEl.textContent = `Error: ${error.message || error}`;
        alert('Upload failed: ' + (error.message || error));
    } finally {
        hideLoading();
    }
}

function findHeaderIndex(headers, candidates, fallbackIndex = 0) {
    for (let i = 0; i < headers.length; i++) {
        if (candidates.includes(headers[i])) return i;
    }
    return fallbackIndex;
}

function openEditStationModal(stationId) {
    const station = (appState.stations || []).find(s => s.id === stationId);
    if (!station) return alert('Station not found');
    const modalContent = `
        <form id="editStationForm" onsubmit="saveEditedStation(event, '${stationId}')">
            <div class="form-row">
                <label class="form-label">Station Name</label>
                <input type="text" class="form-input" id="editStationName" value="${(station.name||'').replace(/"/g,'&quot;')}" required>
            </div>
            <div class="form-row">
                <label class="form-label">Description</label>
                <textarea class="form-textarea" id="editStationDescription">${(station.description||'')}</textarea>
            </div>
            <div class="form-row">
                <label class="form-label">Order</label>
                <input type="number" class="form-input" id="editStationOrder" value="${station.station_order || 0}">
            </div>
        </form>
    `;
    const modalFooter = `
        <button class="btn btn-blue" onclick="document.getElementById('editStationForm').requestSubmit()">SAVE</button>
        <button class="btn btn-outline" onclick="closeModal()">CANCEL</button>
    `;
    showModal(createModal('EDIT STATION', modalContent, modalFooter));
}

async function saveEditedStation(e, stationId) {
    e.preventDefault();
    const updates = {
        name: document.getElementById('editStationName').value,
        description: document.getElementById('editStationDescription').value,
        station_order: parseInt(document.getElementById('editStationOrder').value) || 0
    };
    showLoading();
    closeModal();
    try {
        await updateStation(stationId, updates);
        await loadAllStations();
    } catch (error) {
        console.error('Failed to update station:', error);
        alert('Failed to update station');
    } finally {
        hideLoading();
    }
}

async function deleteStationAction(stationId) {
    if (!confirm('Delete this station?')) return;
    showLoading();
    try {
        await deleteStation(stationId);
        await loadAllStations();
    } catch (error) {
        console.error('Failed to delete station:', error);
        alert('Failed to delete station');
    } finally {
        hideLoading();
    }
}

async function checkInPersonnelAtStation(stationId, personnelId) {
    showLoading();
    try {
        if (!appState.isOnline && window.offlineStore) {
            await offlineStore.addPendingCheckin(stationId, personnelId, currentUser ? currentUser.cap_id : '', appState.selectedEvent?.id);
            appState.pendingCount = (await offlineStore.getPendingCheckins()).length;
            appState.checkins = appState.checkins || [];
            appState.checkins.push({ station_id: stationId, personnel_id: personnelId, checked_in_at: new Date().toISOString() });
            alert('✓ Checked in (pending sync)');
        } else {
            await checkInPersonnel(stationId, personnelId, currentUser ? currentUser.cap_id : '');
            await loadInprocessingStations(appState.selectedInprocessingEvent);
        }
        resetScannerReady();
    } catch (error) {
        console.error('Check-in failed:', error);
        alert('Check-in failed');
    } finally {
        hideLoading();
    }
}

// Helper to load stations in the Event Detail view
async function loadEventStations(eventId) {
    try {
        const stations = await getStations(eventId);
        appState.stations = stations || [];
        const checkinsArr = await Promise.all((stations || []).map(s => getCheckins(s.id)));
        appState.checkins = (checkinsArr || []).flat();
        const container = document.getElementById('eventStationsList');
        if (container) container.innerHTML = '';
    } catch (error) {
        console.error('Failed to load event stations:', error);
    }
}

function openStationModal() {
    const modalContent = `
        <form id="stationForm" onsubmit="saveStation(event)">
            <div class="form-row">
                <label class="form-label">Station Name</label>
                <input type="text" class="form-input" id="stationName" required>
            </div>
            <div class="form-row">
                <label class="form-label">Description</label>
                <textarea class="form-textarea" id="stationDescription"></textarea>
            </div>
            <div class="form-row">
                <label class="form-label">Order</label>
                <input type="number" class="form-input" id="stationOrder" value="0">
            </div>
        </form>
    `;

    const modalFooter = `
        <button class="btn btn-blue" onclick="document.getElementById('stationForm').requestSubmit()">SAVE</button>
        <button class="btn btn-outline" onclick="closeModal()">CANCEL</button>
    `;

    showModal(createModal('NEW STATION', modalContent, modalFooter));
}

async function saveStation(e, eventId) {
    e.preventDefault();
    const chosenEventId = appState.selectedEvent ? appState.selectedEvent.id : eventId;
    if (!chosenEventId) return alert('Please select an event for the station.');
    const stationData = {
        event_id: chosenEventId,
        name: document.getElementById('stationName').value,
        description: document.getElementById('stationDescription').value,
        station_order: parseInt(document.getElementById('stationOrder').value) || 0
    };

    showLoading();
    closeModal();
    try {
        await createStation(stationData);
        await loadAllStations();
        if (eventId) await selectEvent(eventId, 'events');
    } catch (error) {
        console.error('Failed to create station:', error);
        alert('Failed to create station');
    } finally {
        hideLoading();
    }
}

async function switchView(viewName) {
    const prevView = appState.currentView;
    appState.currentView = viewName;
    persistCurrentView();

    // Privacy: clear any loaded person data when leaving in/out-processing
    if (prevView === 'inprocessing' && viewName !== 'inprocessing') {
        appState.inprocessProfile = null;
        appState.inprocessMessage = '';
        appState.inprocessStation = null;
        appState.approvalWarning = null;
        appState.manualEntryOpen = false;
        appState.inprocessMissingCapId = '';
    }
    if (prevView === 'outprocessing' && viewName !== 'outprocessing') {
        appState.outprocessProfile = null;
        appState.outprocessMessage = '';
    }
    
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
        case 'Assets & Vehicles':
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
        if (value === null || value === undefined || value === '') return '-';
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
        return value;
    };

    const formatObjectLine = (obj) => {
        if (!obj || typeof obj !== 'object') return formatInlineValue(obj);
        const keys = Object.keys(obj).sort((a, b) => a.localeCompare(b));
        if (!keys.length) return '-';
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
            if (!keys.length) return ['-'];
            return keys.map(key => `${key}=${formatInlineValue(value[key])}`);
        }
        return [String(formatInlineValue(value))];
    };

    const formatRecord = (record) => {
        if (!record) return '-';
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
            const inprocessed = roster.filter(r => r.signed_in_at && !r.signed_out_at);
            if (!inprocessed.length) {
                lines.push('No inprocessing records.');
                break;
            }
            inprocessed.forEach((entry, index) => {
                lines.push(`Record ${index + 1} | ${formatName(entry)} | CAP ${entry.cap_id || 'N/A'}`);
                lines.push(formatRecord(entry));
                lines.push('------------------------------------------------------------');
            });
            break;
        }
        case 'Outprocessing': {
            const outprocessed = roster.filter(r => !!r.signed_out_at);
            if (!outprocessed.length) {
                lines.push('No outprocessing records.');
                break;
            }
            outprocessed.forEach((entry, index) => {
                lines.push(`Record ${index + 1} | ${formatName(entry)} | CAP ${entry.cap_id || 'N/A'}`);
                lines.push(formatRecord(entry));
                lines.push('------------------------------------------------------------');
            });
            break;
        }
        case 'Assets':
        case 'Assets & Vehicles': {
            if (!assets.length) {
                lines.push('No assets/vehicles available.');
                break;
            }
            assets.forEach((asset, index) => {
                lines.push(`Record ${index + 1} | ${asset.type || 'Asset/Vehicle'} ${asset.asset_id || asset.id || ''}`.trim());
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
            'Assets & Vehicles': ['asset', 'asset_personnel', 'activity_asset'],
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
        name: person ? (person.name || '') : (user.name || ''),
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

async function removeUserAccess(capId) {
    if (!capId) return;
    if (String(capId) === '217545') {
        alert('Cannot remove reserved admin user.');
        return;
    }
    showLoading();
    try {
        await deleteUser(capId);
        appState.users = await getUsers();
        renderCurrentView();
    } catch (error) {
        console.error('Remove user failed:', error);
        alert('Failed to remove user.');
    } finally {
        hideLoading();
    }
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
        appState.inprocessMissingCapId = '';
        appState.manualEntryOpen = false;
        appState.approvalWarning = null;
        renderCurrentView();
        return;
    }
    if (!appState.selectedEvent) {
        appState.inprocessProfile = null;
        appState.inprocessMessage = 'Select an event first.';
        appState.inprocessMissingCapId = '';
        appState.manualEntryOpen = false;
        appState.approvalWarning = null;
        renderCurrentView();
        return;
    }
    showLoading();
    const profileSource = appState.isOnline ? getEventProfile(appState.selectedEvent.id, capId) : (offlineStore ? offlineStore.getCachedProfile(appState.selectedEvent.id, capId) : Promise.resolve({ roster: null, accommodations: [], allergies: [] }));
    profileSource
        .then(({ roster, accommodations, allergies }) => {
            if (!roster) {
                appState.inprocessProfile = null;
                appState.inprocessMessage = 'CAP ID not found in registration. Add manually?';
                appState.inprocessMissingCapId = capId;
                appState.manualEntryOpen = false;
                appState.approvalWarning = null;
                return;
            }
            const memberType = roster.member_type || '';
            const firstName = roster.name_first || roster.firstName || '';
            const lastName = roster.name_last || roster.lastName || '';
            const fullName = roster.full_name || `${firstName} ${lastName}`.trim();
            const profile = {
                capId: roster.cap_id,
                name: fullName,
                full_name: fullName,
                firstName,
                lastName,
                rank: roster.rank,
                memberType: roster.member_type,
                memberStatus: roster.member_status,
                membershipExpiration: roster.expiration,
                shirtSize: roster.shirt_size,
                cellPhone: roster.cell_phone,
                homePhone: roster.home_phone,
                emergencyContact: roster.emergency_contact_name,
                emergencyPhone: roster.emergency_contact_phone,
                email: roster.email,
                accommodations,
                allergies,
                stations: roster.stations || buildDefaultStations(),
                flags: roster.flags || []
            };
            const unitYes = isYes(roster.unit_approved);
            const parentRaw = roster.parent_approved || '';
            const parentYes = isYes(parentRaw);
            const parentNA = String(parentRaw || '').trim().toLowerCase() === 'n/a';
            const ageNum = Number(roster.age);
            const parentOk = parentYes || parentNA || (Number.isFinite(ageNum) && ageNum >= 18);
            const isCadet = memberType && memberType.toLowerCase() === 'cadet';
            if (isCadet && (!unitYes || !parentOk)) {
                appState.approvalWarning = {
                    capId,
                    profile,
                    unitApproved: roster.unit_approved || '',
                    parentApproved: roster.parent_approved || ''
                };
                appState.inprocessProfile = null;
                appState.inprocessMessage = '';
            } else {
                appState.approvalWarning = null;
                appState.inprocessProfile = profile;
                appState.inprocessMessage = '';
                if (!appState.inprocessStation) {
                    const keys = Object.keys(profile.stations || {});
                    appState.inprocessStation = keys[0] || null;
                }
            }
            appState.inprocessMissingCapId = '';
            appState.manualEntryOpen = false;
            appState.inprocessStation = null;
        })
        .catch(err => {
            console.error('Inprocessing lookup failed:', err);
            appState.inprocessProfile = null;
            appState.inprocessMessage = 'Unable to load registration data.';
            appState.inprocessMissingCapId = '';
            appState.manualEntryOpen = false;
            appState.approvalWarning = null;
        })
        .finally(() => {
            hideLoading();
            renderCurrentView();
            // Load billeting summary if profile was found
            if (appState.inprocessProfile && appState.inprocessProfile.capId) {
                setTimeout(() => {
                    renderBilletingSummaryData(appState.inprocessProfile.capId);
                }, 100);
            }
        });
}

async function lookupOutprocessingCadet() {
    const input = document.getElementById('outprocessCapId');
    if (!input) return;
    const capId = normalizeCapId(input.value);
    if (!capId) {
        appState.outprocessProfile = null;
        appState.outprocessMessage = 'Enter a CAP ID to search.';
        renderCurrentView();
        return;
    }
    if (!appState.selectedEvent) {
        appState.outprocessProfile = null;
        appState.outprocessMessage = 'Select an event first.';
        renderCurrentView();
        return;
    }
    showLoading();
    try {
        // refresh roster to be sure
        appState.roster = await getRoster(appState.selectedEvent.id);
        const entry = appState.roster.find(r => normalizeCapId(r.cap_id) === capId && !r.signed_out_at);
        if (!entry) {
            appState.outprocessProfile = null;
            appState.outprocessMessage = 'Not currently signed in.';
            return;
        }
        const profile = entry.profile || {
            capId: entry.cap_id,
            name: entry.name || '',
            full_name: entry.name || '',
            rank: entry.rank || '',
            memberType: entry.role === 'staff' ? 'Senior' : 'Cadet',
            memberStatus: entry.member_status || '',
            membershipExpiration: entry.expiration || '',
            shirtSize: entry.shirt_size || '',
            cellPhone: entry.cell_phone || '',
            homePhone: entry.home_phone || '',
            emergencyContact: entry.emergency_contact_name || '',
            emergencyPhone: entry.emergency_contact_phone || '',
            email: entry.email || '',
            accommodations: [],
            allergies: [],
            stations: entry.stations || {},
            flags: entry.flags || []
        };
        appState.outprocessProfile = profile;
        appState.outprocessMessage = '';
    } catch (err) {
        console.error('Outprocessing lookup failed:', err);
        appState.outprocessProfile = null;
        appState.outprocessMessage = 'Lookup failed.';
    } finally {
        hideLoading();
        renderCurrentView();
        // Load billeting summary if profile was found
        if (appState.outprocessProfile && appState.outprocessProfile.capId) {
            setTimeout(() => {
                renderBilletingSummaryData(appState.outprocessProfile.capId);
            }, 100);
        }
    }
}

// Billeting building
function openAddBuildingModal() {
    const modal = createModal('ADD BUILDING', `
        <div class="form-row">
            <label class="form-label">Building Name</label>
            <input type="text" class="form-input" id="buildingName" placeholder="Name" required>
        </div>
        <div class="form-row">
            <label class="form-label">Gender Restriction</label>
            <select class="form-select" id="buildingGender">
                <option value="mixed">Mixed</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
            </select>
        </div>
        <div class="resource-details" id="buildingError" style="color:#f87171;margin-top:8px;"></div>
    `, `
        <button class="btn btn-blue" onclick="submitAddBuilding()">Save</button>
        <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
    `);
    showModal(modal);
}

async function submitAddBuilding() {
    const nameEl = document.getElementById('buildingName');
    const genderEl = document.getElementById('buildingGender');
    const errEl = document.getElementById('buildingError');
    const setErr = (m) => { if (errEl) errEl.textContent = m; };
    setErr('');
    if (!appState.selectedEvent) { setErr('Select an event first.'); return; }
    const name = nameEl?.value.trim();
    const gender = genderEl?.value || 'mixed';
    if (!name) { setErr('Name required'); return; }
    showLoading();
    try {
        await createBuilding(appState.selectedEvent.id, name, gender);
        appState.billetingBuildings = await getBuildingsForEvent(appState.selectedEvent.id);
        closeModal();
        renderCurrentView();
    } catch (e) {
        console.error(e);
        setErr(e.message || 'Failed to add building.');
    } finally {
        hideLoading();
    }
}

function editBuildingModal(id) {
    const b = (appState.billetingBuildings || []).find(x => x.id === id);
    if (!b) return;
    const modal = createModal('EDIT BUILDING', `
        <div class="form-row">
            <label class="form-label">Building Name</label>
            <input type="text" class="form-input" id="buildingName" value="${b.name || ''}" required>
        </div>
        <div class="form-row">
            <label class="form-label">Gender Restriction</label>
            <select class="form-select" id="buildingGender">
                <option value="mixed" ${b.gender_restriction === 'mixed' ? 'selected' : ''}>Mixed</option>
                <option value="male" ${b.gender_restriction === 'male' ? 'selected' : ''}>Male</option>
                <option value="female" ${b.gender_restriction === 'female' ? 'selected' : ''}>Female</option>
            </select>
        </div>
        <div class="resource-details" id="buildingError" style="color:#f87171;margin-top:8px;"></div>
    `, `
        <button class="btn btn-blue" onclick="submitUpdateBuilding('${id}')">Save</button>
        <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
    `);
    showModal(modal);
}

async function submitUpdateBuilding(id) {
    const nameEl = document.getElementById('buildingName');
    const genderEl = document.getElementById('buildingGender');
    const errEl = document.getElementById('buildingError');
    const setErr = (m) => { if (errEl) errEl.textContent = m; };
    setErr('');
    const name = nameEl?.value.trim();
    const gender = genderEl?.value || 'mixed';
    if (!name) { setErr('Name required'); return; }
    showLoading();
    try {
        await updateBuilding(id, { name, gender_restriction: gender });
        appState.billetingBuildings = await getBuildingsForEvent(appState.selectedEvent.id);
        closeModal();
        renderCurrentView();
    } catch (e) {
        console.error(e);
        setErr(e.message || 'Failed to update building.');
    } finally {
        hideLoading();
    }
}

function openAddFloorModal(buildingId, buildingName) {
    const modal = createModal(`Add Floor to: ${buildingName}`, `
        <div class="form-row">
            <label class="form-label">Floor Number/Label</label>
            <input type="text" class="form-input" id="floorNumber" placeholder="e.g., 1, 2, 3, Ground">
        </div>
        <div class="resource-details" id="floorError" style="color:#f87171;margin-top:8px;"></div>
    `, `
        <button class="btn btn-blue" onclick="submitAddFloor('${buildingId}')">Save</button>
        <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
    `);
    showModal(modal);
}

async function submitAddFloor(buildingId) {
    const numEl = document.getElementById('floorNumber');
    const errEl = document.getElementById('floorError');
    const num = numEl?.value.trim();
    const setErr = (m) => { if (errEl) errEl.textContent = m; };
    setErr('');
    if (!num) { setErr('Floor number required'); return; }
    showLoading();
    try {
        await createFloor(buildingId, num);
        // refresh floors for building
        appState.billetingFloors[buildingId] = await getFloorsForBuilding(buildingId);
        closeModal();
        renderCurrentView();
    } catch (e) {
        console.error(e);
        setErr(e.message || 'Failed to add floor.');
    } finally {
        hideLoading();
    }
}

async function confirmDeleteBuilding(id) {
    if (!confirm('Delete building and all floors/rooms/bunks?')) return;
    showLoading();
    try {
        await deleteBuilding(id);
        await loadBilletingDataForSelectedEvent();
        renderCurrentView();
    } catch (e) {
        console.error(e);
        alert('Failed to delete building.');
    } finally {
        hideLoading();
    }
}

function openAddRoomsModal(floorId, floorNumber, buildingId, buildingName) {
    const modal = createModal(`Add Rooms and Bunks: ${buildingName} (Floor ${floorNumber})`, `
        <div class="tag-input-row" style="margin-bottom:8px;">
            <div class="resource-details" style="max-width:140px; width:100%; font-weight:700;">Room Number</div>
            <div class="resource-details" style="max-width:100px; width:100%; font-weight:700;">Bunks</div>
        </div>
        <div id="roomsContainer">
            ${renderRoomRow()}
        </div>
        <button class="btn btn-outline btn-small" onclick="addRoomRow()">+ Add Another Room</button>
        <div class="resource-details" id="roomsError" style="color:#f87171;margin-top:8px;"></div>
    `, `
        <button class="btn btn-blue" onclick="submitAddRooms('${floorId}', '${buildingId}')">Save All</button>
        <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
    `);
    showModal(modal);
}

function renderRoomRow() {
    return `
        <div class="room-row" style="margin-top:8px;">
            <div class="tag-input-row">
                <input type="text" class="form-input room-number" placeholder="e.g. 101" style="max-width:140px;">
                <input type="number" class="form-input room-beds" placeholder="Beds" value="4" min="1" style="max-width:100px;">
            </div>
        </div>
    `;
}

function addRoomRow() {
    const container = document.getElementById('roomsContainer');
    if (container) container.insertAdjacentHTML('beforeend', renderRoomRow());
}

async function submitAddRooms(floorId, buildingId) {
    const errEl = document.getElementById('roomsError');
    const setErr = (m) => { if (errEl) errEl.textContent = m; };
    setErr('');
    const rows = Array.from(document.querySelectorAll('.room-row'));
    const roomsData = rows.map(row => {
        const num = row.querySelector('.room-number')?.value.trim();
        const beds = parseInt(row.querySelector('.room-beds')?.value || '0', 10) || 0;
        return { room_number: num, bunk_capacity: beds };
    }).filter(r => r.room_number && r.bunk_capacity > 0);
    if (!roomsData.length) { setErr('Enter at least one valid room.'); return; }
    showLoading();
    try {
        await createRoomsWithBunks(floorId, roomsData);
        appState.billetingRooms[floorId] = await getRoomsForFloor(floorId);
        closeModal();
        renderCurrentView();
    } catch (e) {
        console.error(e);
        setErr(e.message || 'Failed to add rooms.');
    } finally {
        hideLoading();
    }
}

async function confirmDeleteRoom(roomId) {
    if (!confirm('Delete this room and its bunks?')) return;
    showLoading();
    try {
        await deleteRoom(roomId);
        const floorId = Object.keys(appState.billetingRooms || {}).find(fid => (appState.billetingRooms[fid] || []).some(r => r.id === roomId));
        if (floorId) {
            appState.billetingRooms[floorId] = await getRoomsForFloor(floorId);
        }
        if (appState.billetingAssignmentsByRoom) delete appState.billetingAssignmentsByRoom[roomId];
        if (appState.billetingBunks) delete appState.billetingBunks[roomId];
        renderCurrentView();
    } catch (e) {
        console.error(e);
        alert('Failed to delete room.');
    } finally {
        hideLoading();
    }
}

function openAssignBunksModal(buildingId, floorId, roomId, buildingName, floorNumber, roomNumber) {
    showLoading();
    (async () => {
        try {
            const bunks = await getBunksForRoom(roomId);
            const assignments = await getAssignmentsForRoom(roomId);
            appState.billetingBunks[roomId] = bunks;
            appState.billetingAssignmentsByRoom[roomId] = assignments;
            const html = renderAssignBunksModal(buildingId, floorId, roomId, buildingName, floorNumber, roomNumber, bunks, assignments);
            showModal(html);
        } catch (e) {
            console.error(e);
            alert(`Failed to load beds. ${e?.message || ''}`.trim());
        } finally {
            hideLoading();
        }
    })();
}

function renderAssignBunksModal(buildingId, floorId, roomId, buildingName, floorNumber, roomNumber, bunks, assignments) {
    const formatOccupantLabel = (capId) => {
        const cap = normalizeCapId(capId || '');
        const rosterEntry = (appState.roster || []).find(r => normalizeCapId(r.cap_id) === cap) || null;
        const name = (rosterEntry?.full_name || rosterEntry?.name || '').trim();
        const rank = (rosterEntry?.rank || '').trim();
        if (rank && name) return `${rank} ${name} (CAP ${cap})`;
        if (name) return `${name} (CAP ${cap})`;
        return `CAP ${cap || capId || ''}`.trim();
    };

    const rows = bunks.map(b => {
        const asn = assignments.find(a => a.bunk_id === b.id);
        const label = asn ? formatOccupantLabel(asn.cap_id) : '[Empty]';
        const btn = asn
            ? `<button class="btn btn-outline btn-small" onclick="removeBedAssignmentAction('${asn.id}', '${roomId}', '${buildingId}', '${floorId}')">Remove</button>`
            : `<button class="btn btn-blue btn-small" onclick="openAssignBedModal('${b.id}', '${roomId}', '${buildingId}', '${floorId}')">Assign Bed</button>`;
        return `<div class="resource-item"><div class="flex-between" style="align-items:center;"><div class="resource-name">Bunk ${b.bunk_number}: ${label}</div><div>${btn}</div></div></div>`;
    }).join('');

    return createModal(`Room ${roomNumber} (Floor ${floorNumber}) - ${buildingName}`, `
        <div class="resource-list">
            ${rows || '<div class="empty-state-text text-center">No bunks.</div>'}
        </div>
    `, `<button class="btn btn-outline" onclick="closeModal()">Close</button>`);
}

function openAssignBedModal(bedId, roomId, buildingId, floorId) {
    appState.billetingAssignCandidate = null;
    const modal = createModal('Assign Bed', `
        <div class="form-row">
            <label class="form-label">CAP ID</label>
            <div class="tag-input-row">
                <input type="text" class="form-input" id="assignBedCapId" placeholder="Enter CAP ID" maxlength="10" style="max-width:180px;">
                <button class="btn btn-outline btn-small" onclick="lookupAssignMember()">Lookup</button>
            </div>
        </div>
        <div class="resource-item" id="assignBedMemberCard" style="display:none;">
            <div class="resource-name" id="assignBedMemberName">Name</div>
            <div class="resource-details" id="assignBedMemberMeta">Rank | Age</div>
        </div>
        <div class="resource-details" id="assignError" style="color:#f87171;margin-top:8px;"></div>
    `, `
        <button class="btn btn-blue" onclick="submitAssignBed('${bedId}', '${roomId}', '${buildingId}', '${floorId}')">Assign</button>
        <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
    `);
    showModal(modal);
}

async function lookupAssignMember() {
    const capInput = document.getElementById('assignBedCapId');
    const errEl = document.getElementById('assignError');
    const cardEl = document.getElementById('assignBedMemberCard');
    const nameEl = document.getElementById('assignBedMemberName');
    const metaEl = document.getElementById('assignBedMemberMeta');
    const setErr = (m) => { if (errEl) errEl.textContent = m; };
    setErr('');
    if (cardEl) cardEl.style.display = 'none';
    appState.billetingAssignCandidate = null;

    const capId = normalizeCapId(capInput?.value || '');
    if (!capId) { setErr('Enter a CAP ID.'); return; }
    if (!appState.selectedEvent || !appState.selectedEvent.id) { setErr('Select an event first.'); return; }

    showLoading();
    try {
        let rosterEntry = (appState.roster || []).find(r => normalizeCapId(r.cap_id) === capId) || null;
        if (!rosterEntry) {
            const profile = await getEventProfile(appState.selectedEvent.id, capId);
            rosterEntry = profile?.roster || null;
        }
        if (!rosterEntry) {
            setErr('CAP ID not found in this event roster.');
            return;
        }

        const name = rosterEntry.full_name || rosterEntry.name || 'Unknown';
        const rank = rosterEntry.rank || 'N/A';
        const age = Number.isFinite(Number(rosterEntry.age)) ? String(Number(rosterEntry.age)) : 'N/A';
        const gender = (rosterEntry.gender || rosterEntry.Gender || '').toString();

        appState.billetingAssignCandidate = {
            capId: normalizeCapId(rosterEntry.cap_id || capId),
            name,
            rank,
            age,
            gender
        };

        if (nameEl) nameEl.textContent = `${name} (CAP ${appState.billetingAssignCandidate.capId})`;
        if (metaEl) metaEl.textContent = `Rank: ${rank} | Age: ${age}`;
        if (cardEl) cardEl.style.display = 'block';
    } catch (e) {
        console.error(e);
        setErr(e.message || 'Lookup failed.');
    } finally {
        hideLoading();
    }
}

async function submitAssignBed(bedId, roomId, buildingId, floorId) {
    const errEl = document.getElementById('assignError');
    const setErr = (m) => { if (errEl) errEl.textContent = m; };
    setErr('');
    const candidate = appState.billetingAssignCandidate;
    if (!candidate || !candidate.capId) { setErr('Lookup a member by CAP ID first.'); return; }
    const capId = candidate.capId;
    // Occupancy validation
    const existing = (appState.billetingAssignmentsByRoom?.[roomId] || []).find(a => String(a.bunk_id) === String(bedId));
    if (existing) { setErr('Bunk already assigned.'); return; }
    // Gender validation
    const building = (appState.billetingBuildings || []).find(b => b.id === buildingId);
    if (building && building.gender_restriction && building.gender_restriction !== 'mixed') {
        const g = (candidate.gender || '').toString().toLowerCase();
        const restriction = building.gender_restriction.toLowerCase();
        if (restriction === 'male' && g.startsWith('f')) { setErr('Building is male only.'); return; }
        if (restriction === 'female' && g.startsWith('m')) { setErr('Building is female only.'); return; }
    }
    showLoading();
    try {
        const actor = getCurrentUser();
        await assignBunkToCadet(bedId, capId, actor ? actor.cap_id : null, appState.selectedEvent ? appState.selectedEvent.id : null);
        appState.billetingAssignmentsByRoom[roomId] = await getAssignmentsForRoom(roomId);
        appState.billetingBunks[roomId] = await getBunksForRoom(roomId);
        const building = (appState.billetingBuildings || []).find(b => b.id === buildingId);
        const floor = (appState.billetingFloors[buildingId] || []).find(f => f.id === floorId);
        const room = (appState.billetingRooms[floorId] || []).find(r => r.id === roomId);
        showModal(renderAssignBunksModal(buildingId, floorId, roomId, building?.name || '', floor?.floor_number || '', room?.room_number || '', appState.billetingBunks[roomId], appState.billetingAssignmentsByRoom[roomId]));
        renderCurrentView();
    } catch (e) {
        console.error(e);
        setErr(e.message || 'Failed to assign bed.');
    } finally {
        hideLoading();
    }
}

async function removeBedAssignmentAction(assignmentId, roomId, buildingId, floorId) {
    showLoading();
    try {
        await removeBedAssignment(assignmentId);
        appState.billetingAssignmentsByRoom[roomId] = await getAssignmentsForRoom(roomId);
        appState.billetingBunks[roomId] = await getBunksForRoom(roomId);
        const building = (appState.billetingBuildings || []).find(b => b.id === buildingId);
        const floor = (appState.billetingFloors[buildingId] || []).find(f => f.id === floorId);
        const room = (appState.billetingRooms[floorId] || []).find(r => r.id === roomId);
        showModal(renderAssignBunksModal(buildingId, floorId, roomId, building?.name || '', floor?.floor_number || '', room?.room_number || '', appState.billetingBunks[roomId], appState.billetingAssignmentsByRoom[roomId]));
        renderCurrentView();
    } catch (e) {
        console.error(e);
        alert('Failed to remove assignment.');
    } finally {
        hideLoading();
    }
}
function openAddUserModal() {
    showModal(renderAddUserModal());
}

async function submitAddUser() {
    const nameEl = document.getElementById('newUserName');
    const capEl = document.getElementById('newUserCapId');
    const pinEl = document.getElementById('newUserPin');
    const pin2El = document.getElementById('newUserPinConfirm');
    const roleEl = document.getElementById('newUserRole');
    const errorEl = document.getElementById('newUserError');
    if (!nameEl || !capEl || !pinEl || !pin2El || !roleEl) return;
    const name = nameEl.value.trim();
    const capId = capEl.value.trim();
    const pin = pinEl.value.trim();
    const pin2 = pin2El.value.trim();
    const role = roleEl.value;
    const setError = (msg) => { if (errorEl) errorEl.textContent = msg; };
    setError('');
    if (!name || !capId || !pin || !pin2 || !role) { setError('All fields are required.'); return; }
    if (!/^\d{8}$/.test(pin)) { setError('PIN must be exactly 8 digits.'); return; }
    if (pin !== pin2) { setError('PINs do not match.'); return; }
    if (capId === '217545') { setError('CAP ID 217545 is reserved.'); return; }
    showLoading();
    try {
        const exists = await userExists(capId);
        if (exists) { setError('User already exists.'); hideLoading(); return; }
        await createNewUser({ capId, name, pin, role });
        appState.users = await getUsers();
        closeModal();
        renderCurrentView();
    } catch (err) {
        console.error('Add user failed', err);
        setError(err.message || 'Failed to create user.');
    } finally {
        hideLoading();
    }
}

function handleInprocessAction() {
    const alreadyIn = (typeof getActiveRosterEntry === 'function') ? getActiveRosterEntry() : null;
    const capIdBypass = appState.inprocessProfile ? normalizeCapId(appState.inprocessProfile.capId) : '';
    if (alreadyIn && capIdBypass !== '217545') {
        appState.inprocessMessage = 'Already signed in.';
        renderCurrentView();
        return;
    }
    // If a profile is already loaded, sign in immediately (no need to re-enter CAP ID)
    if (appState.inprocessProfile) {
        const role = (appState.inprocessProfile.memberType || '').toLowerCase() === 'senior' ? 'staff' : 'student';
        signInInprocessing(role);
        return;
    }
    const input = document.getElementById('inprocessCapId');
    const capId = normalizeCapId(input ? input.value : '');
    if (!capId) {
        focusCapInput();
        return;
    }
    if (!appState.inprocessProfile && appState.inprocessMissingCapId === capId) {
        openManualEntry();
        return;
    }
    lookupInprocessingCadet();
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
    const profile = appState.inprocessProfile;
    if (!profile) {
        alert('Lookup a CAP ID first.');
        return;
    }
    const capId = normalizeCapId(profile.capId);
    if (!capId) {
        alert('Invalid CAP ID.');
        return;
    }
    const allEntries = appState.roster.filter(r => normalizeCapId(r.cap_id) === capId);
    const latestEntry = allEntries.sort((a, b) => (b.signed_in_at || '').localeCompare(a.signed_in_at || '')).shift();
    const staffOverride = document.getElementById('staffOverride')?.checked;
    if (staffOverride) {
        role = 'staff';
    }
    const activeEntry = allEntries.find(r => !r.signed_out_at);
    if (activeEntry && capId !== '217545') {
        appState.inprocessMessage = 'Already signed in.';
        renderCurrentView();
        return;
    }
    console.log('signIn check', { capId, latestEntry });
        const firstName = profile.firstName || profile.name_first || '';
        const lastName = profile.lastName || profile.name_last || '';
        const fullName = profile.name || `${firstName} ${lastName}`.trim();
        const now = new Date();
        showLoading();
        try {
        let updatedEntry = null;
        // Preserve existing station state; fall back to profile or defaults, and add any missing event stations.
        const mergeStations = (base = {}) => {
            const merged = { ...buildDefaultStations(), ...(base || {}) };
            (appState.stations || []).forEach(s => {
                if (!merged[s.name]) merged[s.name] = { status: 'pending', flagged: false };
            });
            return merged;
        };
        if (latestEntry) {
            updatedEntry = { ...latestEntry };
            updatedEntry.event_id = appState.selectedEvent.id;
            updatedEntry.rank = profile.rank || '';
            updatedEntry.name = fullName || '';
            updatedEntry.role = role;
            updatedEntry.signed_in_at = now.toISOString();
            updatedEntry.signed_out_at = null;
            updatedEntry.stations = mergeStations(latestEntry.stations || profile.stations);
            updatedEntry.flags = updatedEntry.flags || [];
            updatedEntry.profile = { ...profile };
            await updateRosterEntry(updatedEntry);
        } else {
            updatedEntry = {
                event_id: appState.selectedEvent.id,
                cap_id: capId,
                rank: profile.rank || '',
                name: fullName || '',
                role,
                signed_in_at: now.toISOString(),
                signed_out_at: null,
                stations: mergeStations(profile.stations),
                flags: [],
                profile: { ...profile }
            };
            await addRosterEntry(updatedEntry);
        }
        appState.roster = await getRoster(appState.selectedEvent.id);
        // keep profile visible and refresh stations/flags from roster
        appState.inprocessProfile = {
            ...profile,
            name: updatedEntry.name,
            full_name: updatedEntry.name,
            stations: updatedEntry.stations,
            flags: updatedEntry.flags
        };
        const stationKeys = Object.keys(updatedEntry.stations || {});
        if (!appState.inprocessStation && stationKeys.length) {
            appState.inprocessStation = stationKeys[0];
        }
        await loadInprocessingStations(appState.selectedEvent.id);
        appState.inprocessMessage = '';
        renderCurrentView();
        if (appState.inprocessProfile && appState.inprocessProfile.capId) {
            setTimeout(() => renderBilletingSummaryData(appState.inprocessProfile.capId), 80);
        }
    } catch (error) {
        console.error('Sign in failed:', error);
        const msg = error?.message || String(error);
        alert('Failed to sign in: ' + msg);
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
            alert('Resolve all flags before completing inprocessing.');
            return;
        }
        // Require all configured stations (except Complete Inprocessing) to be complete
        const requiredNames = (appState.stations || [])
            .map(s => s.name)
            .filter(n => n && n.toLowerCase() !== 'complete inprocessing');
        const incomplete = requiredNames.filter(name => (entry.stations?.[name]?.status || 'pending') !== 'complete');
        if (incomplete.length) {
            alert(`Complete these stations first: ${incomplete.join(', ')}`);
            return;
        }
    }
    entry.stations = entry.stations || buildDefaultStations();
    entry.stations[appState.inprocessStation] = entry.stations[appState.inprocessStation] || { status: 'pending', flagged: false };
    const commentEl = document.getElementById('stationComment');
    if (commentEl) {
        entry.stations[appState.inprocessStation].comment = commentEl.value.trim();
    }
    entry.stations[appState.inprocessStation].status = 'complete';
    if (appState.inprocessStation === 'Complete Inprocessing') {
        entry.inprocess_completed_at = entry.inprocess_completed_at || new Date().toISOString();
    }
    showLoading();
    try {
        await updateRosterEntry(entry);
        appState.roster = await getRoster(appState.selectedEvent.id);
        // Keep the active profile/selection so station status updates in-place.
        if (appState.inprocessProfile) {
            appState.inprocessProfile = {
                ...appState.inprocessProfile,
                stations: entry.stations
            };
        }
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
    // Deprecated modal; flag is now taken from the inline comment box.
    if (!getActiveRosterEntry() || !appState.inprocessStation) return;
    saveFlagFromComment();
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
    if (e) e.preventDefault();
    // Kept for backward compatibility; prefer saveFlagFromComment
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

async function saveFlagFromComment() {
    const entry = getActiveRosterEntry();
    if (!entry || !appState.inprocessStation) return;
    const commentEl = document.getElementById('stationComment');
    const reason = commentEl ? commentEl.value.trim() : '';
    if (!reason) {
        alert('Add a comment before flagging.');
        return;
    }
    const actor = getCurrentUser();
    entry.flags = entry.flags || [];
    entry.flags.push({
        station: appState.inprocessStation,
        reason,
        owner: '',
        created_at: new Date().toISOString(),
        created_by: actor ? actor.cap_id : '',
        resolved: false
    });
    entry.stations = entry.stations || buildDefaultStations();
    entry.stations[appState.inprocessStation] = entry.stations[appState.inprocessStation] || { status: 'pending', flagged: false };
    entry.stations[appState.inprocessStation].comment = reason;
    entry.stations[appState.inprocessStation].flagged = true;
    showLoading();
    try {
        await updateRosterEntry(entry);
        appState.roster = await getRoster(appState.selectedEvent.id);
        if (appState.inprocessProfile) {
            appState.inprocessProfile = {
                ...appState.inprocessProfile,
                stations: entry.stations,
                flags: entry.flags
            };
        }
        renderCurrentView();
    } catch (error) {
        console.error('Save flag failed:', error);
        alert('Failed to save flag.');
    } finally {
        hideLoading();
    }
}

async function resolveFlagInline(index) {
    const entry = getActiveRosterEntry();
    if (!entry || !entry.flags || !entry.flags[index]) return;
    const actor = getCurrentUser();
    entry.flags[index].resolved = true;
    entry.flags[index].resolved_at = new Date().toISOString();
    entry.flags[index].resolved_by = actor ? actor.cap_id : '';
    const station = entry.flags[index].station;
    // clear station flagged if no remaining open flags for that station
    const stillOpen = entry.flags.some((f, i) => i !== index && !f.resolved && f.station === station);
    entry.stations = entry.stations || buildDefaultStations();
    if (!stillOpen && entry.stations[station]) {
        entry.stations[station].flagged = false;
    }
    showLoading();
    try {
        await updateRosterEntry(entry);
        appState.roster = await getRoster(appState.selectedEvent.id);
        if (appState.inprocessProfile) {
            appState.inprocessProfile = {
                ...appState.inprocessProfile,
                stations: entry.stations,
                flags: entry.flags
            };
        }
        renderCurrentView();
    } catch (error) {
        console.error('Resolve flag failed:', error);
        alert('Failed to resolve flag.');
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
    const profile = appState.outprocessProfile || appState.inprocessProfile;
    if (!profile) {
        alert('Lookup a CAP ID first.');
        return;
    }
    const capId = normalizeCapId(profile.capId);
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
        appState.outprocessProfile = null;
        appState.inprocessProfile = null;
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

function renderInprocessingProfile(profile, accommodations = [], allergies = []) {
    const fullName = `${profile.firstName || ''} ${profile.lastName || ''}`.trim();
    const fmtYes = (val) => (String(val || '').toLowerCase() === 'yes' ? 'Yes' : 'No');
    
    return `
        <div class="profile-section">
            <div class="resource-header status-blue">PROFILE</div>
            <div class="profile-grid">
                <div class="profile-field"><div class="profile-label">Name</div><div class="profile-value">${fullName || 'N/A'}</div></div>
                <div class="profile-field"><div class="profile-label">CAP ID</div><div class="profile-value">${profile.capId || 'N/A'}</div></div>
                <div class="profile-field"><div class="profile-label">Rank</div><div class="profile-value">${profile.rank || 'N/A'}</div></div>
                <div class="profile-field"><div class="profile-label">Member Type</div><div class="profile-value">${profile.member_type || 'N/A'}</div></div>
                <div class="profile-field"><div class="profile-label">Status</div><div class="profile-value">${profile.memberStatus || 'N/A'}</div></div>
                <div class="profile-field"><div class="profile-label">Membership Expires</div><div class="profile-value">${profile.membershipExpiration || 'N/A'}</div></div>
                <div class="profile-field"><div class="profile-label">Shirt Size</div><div class="profile-value">${profile.shirtSize || 'N/A'}</div></div>
                <div class="profile-field"><div class="profile-label">Cell Phone</div><div class="profile-value">${profile.cellPhone || 'N/A'}</div></div>
                <div class="profile-field"><div class="profile-label">Emergency Contact</div><div class="profile-value">${profile.emergencyContact || 'N/A'}</div></div>
                <div class="profile-field"><div class="profile-label">Emergency Phone</div><div class="profile-value">${profile.emergencyPhone || 'N/A'}</div></div>
            </div>
        </div>

        <div class="profile-section">
            <div class="resource-header status-blue">ACCOMMODATIONS</div>
            ${accommodations && accommodations.length ? `
                ${accommodations.map(a => `
                    <div class="profile-grid">
                        <div class="profile-field"><div class="profile-label">Type</div><div class="profile-value">${a.accommodation_type || 'N/A'}</div></div>
                        <div class="profile-field"><div class="profile-label">Details</div><div class="profile-value">${a.description || 'N/A'}</div></div>
                    </div>
                `).join('')}
            ` : '<div class="resource-details">No accommodations on file.</div>'}
        </div>

        <div class="profile-section">
            <div class="resource-header status-blue">ALLERGIES</div>
            ${allergies && allergies.length ? `
                ${allergies.map((a, idx) => `
                    <div class="card" style="margin-bottom:10px;">
                        <div class="resource-name">Allergy ${idx + 1}: ${a.allergy_name || 'N/A'}</div>
                        <div class="profile-grid">
                            <div class="profile-field"><div class="profile-label">Type</div><div class="profile-value">${a.allergy_type || 'N/A'}</div></div>
                            <div class="profile-field"><div class="profile-label">Anaphylaxis Risk</div><div class="profile-value">${fmtYes(a.is_anaphyaxis)}</div></div>
                            <div class="profile-field"><div class="profile-label">Has EpiPen</div><div class="profile-value">${fmtYes(a.has_epipen)}</div></div>
                            <div class="profile-field"><div class="profile-label">Has Inhaler</div><div class="profile-value">${fmtYes(a.has_albuterol_inhaler)}</div></div>
                            <div class="profile-field"><div class="profile-label">Typical Reactions</div><div class="profile-value">${a.typical_reactions || 'N/A'}</div></div>
                            <div class="profile-field"><div class="profile-label">Treatments</div><div class="profile-value">${a.treatments || 'N/A'}</div></div>
                            <div class="profile-field"><div class="profile-label">Other Medications</div><div class="profile-value">${a.other_medications || 'N/A'}</div></div>
                            <div class="profile-field"><div class="profile-label">Other Reactions</div><div class="profile-value">${a.other_reactions || 'N/A'}</div></div>
                        </div>
                    </div>
                `).join('')}
            ` : '<div class="resource-details">No allergies on file.</div>'}
        </div>

        <div class="profile-section">
            <div class="resource-header status-blue">BILLETING ASSIGNMENT</div>
            <div class="profile-grid" id="billetingSummary">
                <div class="profile-field">
                    <div class="profile-label">Status</div>
                    <div class="profile-value">Loading...</div>
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
        localStorage.setItem('cap-event-selected-event-id', eventId);
        appState.currentView = targetView;
        persistCurrentView();
        appState.roster = await getRoster(eventId);
        await loadBilletingDataForSelectedEvent();
        await loadOrgChartDataForSelectedEvent();
        appState.selectedInprocessingEvent = eventId;
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
                <div class="event-dates" style="opacity:0.6;">Build ${BUILD_ID}</div>
            </div>
            <div class="flex gap-2"></div>
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
            <div class="flex gap-2" style="align-items:center;">
                <label class="toggle-row toggle-switch" style="margin:0;">
                    <input type="checkbox" ${appState.showActivitiesWithNeeds ? 'checked' : ''} onchange="toggleActivitiesWithNeeds()">
                    <span class="toggle-track"></span>
                    <span class="toggle-label">Show Activities With Needs</span>
                </label>
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

function openEventEdit(eventId) {
    openEventModal(eventId);
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
                        ${appState.assets.map(a => `<option value="${a.id}">${a.name} (${a.type}) - ${a.details || 'ID N/A'}</option>`).join('')}
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
    // Count all personnel assignments (manual + auto-driver) toward staffing totals.
    return entries.length;
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
            <span>${item.label ? `${item.label} - ` : ''}${item.start_date}–${item.end_date} - ${item.start_time}–${item.end_time}</span>
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
    if (!availability.length) return true; // treat no availability as always available
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
            return { id: String(entry), role: '', type: '', assignment_date: '', assignment_start_time: '', assignment_end_time: '', auto_driver: false, asset_id: '', operator_id: '', from_location_id: '', to_location_id: '', stay_at_location: false };
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
            operator_id: entry.operator_id || '',
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
    return `${dateStr} - ${activity.start_time}–${activity.end_time}`;
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
        const asset = entry.asset_id ? appState.assets.find(a => String(a.id) === String(entry.asset_id)) : null;
        const assetText = asset ? ` - Asset: ${asset.name}` : '';
        const roleText = entry.role ? ` - ${entry.role}` : '';
        return { id: entry.id, label: `${label}${roleText}${assetText}${time}`, index };
    });
    const assignedAssets = assignedAssetsEntries.map((entry, index) => {
        const asset = appState.assets.find(a => a.id === entry.id);
        const label = asset ? `${asset.name} (${asset.type})` : entry.id;
        const time = entry.assignment_start_time && entry.assignment_end_time ? ` (${entry.assignment_start_time}-${entry.assignment_end_time})` : '';
        const operator = entry.operator_id ? appState.personnel.find(p => String(p.id) === String(entry.operator_id)) : null;
        const opText = operator ? ` - Operator: ${operator.name}` : '';
        return { id: entry.id, label: entry.type ? `${label} - ${entry.type}${time}${opText}` : `${label}${time}${opText}`, index };
    });

    // Show all personnel/assets so users can assign freely; availability conflicts will warn later.
    const availablePersonnel = [...appState.personnel];
    const availableAssets = [...appState.assets];
    const roleOptions = Array.from(new Set([
        ...getSupportRoles(),
        ...assignedPersonnelEntries.map(r => r.role).filter(r => r)
    ]));

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
                        ${appState.assets.map(a => `<option value="${a.id}">${a.name} (${a.type}) - ${a.details || 'ID N/A'}</option>`).join('')}
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
                        ${roleOptions.map(r => `<option value="${r}">${r}</option>`).join('')}
                    </select>
                    <select class="form-select" id="assignPersonnelAssetSelect">
                        <option value="">(No asset)</option>
                        ${availableAssets.map(a => `<option value="${a.id}">${a.name}</option>`).join('')}
                    </select>
                    <div class="tag-input-row">
                        <input type="time" class="form-input" id="assignPersonnelStartTime" placeholder="Start">
                        <input type="time" class="form-input" id="assignPersonnelEndTime" placeholder="End">
                        <button type="button" class="btn btn-outline btn-small" onclick="assignPersonnelToActivityAction('${activityId}')">Assign</button>
                    </div>
                    <label class="form-label" style="margin: 0; display:flex; align-items:center; gap:8px;">
                        <input type="checkbox" id="assignPersonnelFullEvent" onchange="toggleAssignPersonnelFullEvent('${activityId}')">
                        Full event
                    </label>
                </div>
            </div>
            <div class="form-row">
                <label class="form-label">Assigned Personnel</label>
                <div class="resource-list">
                    ${assignedPersonnel.length ? assignedPersonnel.map((entry) => {
                        const id = entry.id;
                        return `
                            <div class="resource-item">
                                <div class="flex-between">
                                    <div class="resource-name">${entry.label}</div>
                                    <div class="flex gap-2">
                                        <button class="btn btn-small btn-outline" onclick="unassignPersonnelAction('${activityId}', '${id}')">Remove</button>
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('') : '<div class="empty-state-text text-center">No personnel assigned</div>'}
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
                                        <button class="btn btn-small btn-outline" onclick="unassignAssetAction('${activityId}', '${id}')">Remove</button>
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
    const currentActivity = appState.activities.find(a => a.id === activityId) || {};
    const updates = {
        title: document.getElementById('activityEditTitle').value,
        description: document.getElementById('activityEditDescription').value,
        location_id: document.getElementById('activityEditLocation').value || null,
        activity_date: document.getElementById('activityEditDate').value || null,
        start_time: document.getElementById('activityEditStartTime').value || null,
        end_time: document.getElementById('activityEditEndTime').value || null,
        support_personnel_required: JSON.parse(document.getElementById('activityEditSupportHidden').value || '[]'),
        assets_required: JSON.parse(document.getElementById('activityEditAssetHidden').value || '[]'),
        assigned_personnel: currentActivity.assigned_personnel || [],
        assigned_assets: currentActivity.assigned_assets || []
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
    const assetSelect = document.getElementById('assignPersonnelAssetSelect');
    const startInput = document.getElementById('assignPersonnelStartTime');
    const endInput = document.getElementById('assignPersonnelEndTime');
    const useActivityTime = document.getElementById('assignPersonnelUseActivityTime');
    const fullEvent = document.getElementById('assignPersonnelFullEvent')?.checked;
    const activity = appState.activities.find(a => a.id === activityId);
    if (!select || !select.value) {
        alert('Select a staff member.');
        return;
    }
    // Minimal validation: person required
    if (!select || !select.value) {
        alert('Select a staff member.');
        return;
    }
    const personId = String(select.value);
    const assetId = assetSelect ? assetSelect.value : '';
    // No blocking validations; only console warnings
    console.debug('Assign clicked', {
        personId,
        role: roleSelect?.value || '',
        assetId,
        start: startInput?.value || '',
        end: endInput?.value || ''
    });
    showLoading();
    try {
        // Force persist personnel assignment directly
        const act = appState.activities.find(a => a.id === activityId) || {};
        const activityStart = act.start_time || '06:00';
        const activityEnd = act.end_time || '23:30';
        const startVal = fullEvent ? activityStart : (startInput?.value || '');
        const endVal = fullEvent ? activityEnd : (endInput?.value || '');
        if (fullEvent) {
            if (startInput) startInput.value = startVal;
            if (endInput) endInput.value = endVal;
        }
        const personnelEntries = normalizeAssignmentEntries(act.assigned_personnel || [], 'personnel');
        personnelEntries.push({
            id: personId,
            role: roleSelect.value || '',
            assignment_date: act?.activity_date || '',
            assignment_start_time: startVal,
            assignment_end_time: endVal,
            auto_driver: false,
            asset_id: assetId || '',
            operator_id: '',
            from_location_id: '',
            to_location_id: '',
            stay_at_location: false
        });
        console.log('Assign personnel -> updateActivity', {
            activityId,
            personId,
            role: roleSelect.value,
            start: startInput?.value || '',
            end: endInput?.value || '',
            assetId: assetId || '',
            beforePersonnel: act?.assigned_personnel,
            afterPersonnel: personnelEntries
        });
        // Build asset assignments once so we can persist personnel + assets together.
        const assetEntries = normalizeAssignmentEntries(act.assigned_assets || [], 'assets');
        if (assetId) {
            let updated = false;
            for (const entry of assetEntries) {
                if (String(entry.id) === String(assetId)) {
                    entry.operator_id = personId;
                    entry.assignment_start_time = startVal;
                    entry.assignment_end_time = endVal;
                    updated = true;
                    break;
                }
            }
            if (!updated) {
                assetEntries.push({
                    id: assetId,
                    asset_id: assetId,
                    operator_id: personId,
                    assignment_date: act?.activity_date || '',
                    assignment_start_time: startVal,
                    assignment_end_time: endVal,
                    role: '',
                    type: '',
                    auto_driver: false,
                    from_location_id: '',
                    to_location_id: '',
                    stay_at_location: false
                });
            }
        }
        console.log('Assign operator -> updateActivity', {
            activityId,
            assetId,
            operatorId: personId,
            start: startInput?.value || '',
            end: endInput?.value || '',
            beforeAssets: act?.assigned_assets,
            afterAssets: assetEntries
        });
        await updateActivity(activityId, { assigned_personnel: personnelEntries, assigned_assets: assetEntries });
        const verify = await supabaseClient
            .from('activities')
            .select('assigned_personnel, assigned_assets')
            .eq('id', activityId)
            .single();
        console.log('VERIFY DATABASE AFTER UPDATE:', {
            sent: { assigned_personnel: personnelEntries, assigned_assets: assetEntries },
            received: verify.data
        });
        await loadAllData();
        const finalAct = appState.activities.find(a => a.id === activityId);
        console.log('After assignment reload', {
            activityId,
            assigned_personnel: finalAct?.assigned_personnel,
            assigned_assets: finalAct?.assigned_assets
        });
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
    const useActivity = document.getElementById('assignPersonnelUseActivityTime');
    const fullEvent = document.getElementById('assignPersonnelFullEvent');
    const startInput = document.getElementById('assignPersonnelStartTime');
    const endInput = document.getElementById('assignPersonnelEndTime');
    if (!startInput || !endInput) return;

    if (fullEvent && fullEvent.checked) {
        startInput.value = '';
        endInput.value = '';
        startInput.disabled = true;
        endInput.disabled = true;
        if (useActivity) useActivity.checked = false;
        return;
    }

    if (!useActivity || !useActivity.checked) {
        startInput.disabled = false;
        endInput.disabled = false;
        return;
    }
    if (!activity || !activity.start_time || !activity.end_time) {
        useActivity.checked = false;
        alert('Set the activity start/end time first.');
        return;
    }
    startInput.value = activity.start_time;
    endInput.value = activity.end_time;
    startInput.disabled = true;
    endInput.disabled = true;
}

function toggleAssignPersonnelFullEvent(activityId) {
    const activity = appState.activities.find(a => a.id === activityId) || {};
    const fullEvent = document.getElementById('assignPersonnelFullEvent');
    const startInput = document.getElementById('assignPersonnelStartTime');
    const endInput = document.getElementById('assignPersonnelEndTime');
    const defaultStart = activity.start_time || '06:00';
    const defaultEnd = activity.end_time || '23:30';
    if (!startInput || !endInput || !fullEvent) return;
    if (fullEvent.checked) {
        startInput.value = defaultStart;
        endInput.value = defaultEnd;
    } else {
        startInput.value = '';
        endInput.value = '';
    }
}

function toggleAssignAssetActivityTime(activityId) {
    const activity = appState.activities.find(a => a.id === activityId);
    const checkbox = document.getElementById('assignAssetUseActivityTime');
    const fullEvent = document.getElementById('assignAssetFullEvent');
    const startInput = document.getElementById('assignAssetStartTime');
    const endInput = document.getElementById('assignAssetEndTime');
    if (!startInput || !endInput) return;
    if (fullEvent && fullEvent.checked) {
        startInput.value = '';
        endInput.value = '';
        startInput.disabled = true;
        endInput.disabled = true;
        if (checkbox) checkbox.checked = false;
        return;
    }
    if (!checkbox || !checkbox.checked) {
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
    const useActivityTime = document.getElementById('assignAssetUseActivityTime');
    const activity = appState.activities.find(a => a.id === activityId);
    if (!select || !select.value || !startInput || !endInput) return;
    if (useActivityTime && useActivityTime.checked && activity) {
        startInput.value = activity.start_time || '';
        endInput.value = activity.end_time || '';
    }
    if (!startInput.value || !endInput.value) return;

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

    // asset assignment flow deprecated in favor of person+asset single-step
    alert('Use the personnel assignment to attach assets and operators.');
    return;
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
                <div class="form-row" style="margin-top:6px;">
                    <label class="form-label" style="display:flex; align-items:center; gap:8px;">
                        <input type="checkbox" id="assetAvailFullEvent" onchange="fillAssetFullEvent()">
                        Full event availability
                    </label>
                </div>
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
                                    <div class="resource-name">${label} - ${entry.role || 'Driver'}${time}</div>
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
        ${asset ? `<button class="btn btn-outline" style="margin-left:8px;" onclick="deleteAssetAction('${assetId}')">DELETE</button>` : ''}
        <button class="btn btn-outline" onclick="closeModal()">CANCEL</button>
    `;

    showModal(createModal(asset ? 'EDIT ASSET' : 'NEW ASSET', modalContent, modalFooter));
    setupAvailabilityList('asset');
}

async function assignOperatorToAssetAction(activityId) {
    const assetSelect = document.getElementById('assignOperatorAssetSelect');
    const personSelect = document.getElementById('assignOperatorPersonnelSelect');
    if (!assetSelect || !personSelect) return;
    const assetId = assetSelect.value;
    const personId = personSelect.value;
    if (!assetId || !personId) return;
    const activity = appState.activities.find(a => a.id === activityId);
    if (!activity) return;
    const entries = normalizeAssignmentEntries(activity.assigned_assets || [], 'assets');
    const updated = entries.map(e => e.id === assetId ? { ...e, operator_id: personId } : e);
    showLoading();
    try {
        await updateActivity(activityId, { assigned_assets: updated });
        await loadAllData();
        renderCurrentView();
        openActivityDetail(activityId);
    } catch (err) {
        console.error('Failed to assign operator to asset:', err);
        alert('Failed to assign operator to asset.');
    } finally {
        hideLoading();
    }
}

function fillAssetFullEvent() {
    const box = document.getElementById('assetAvailFullEvent');
    const startDate = document.getElementById('assetAvailStartDate');
    const endDate = document.getElementById('assetAvailEndDate');
    const startTime = document.getElementById('assetAvailStart');
    const endTime = document.getElementById('assetAvailEnd');
    if (!box || !startDate || !endDate || !startTime || !endTime) return;
    if (!box.checked) {
        startDate.value = '';
        endDate.value = '';
        startTime.value = '';
        endTime.value = '';
        return;
    }
    const evt = appState.selectedEvent;
    if (!evt || !evt.start_date || !evt.end_date) {
        box.checked = false;
        alert('Event dates are not set.');
        return;
    }
    const start = (evt.start_date || '').split('T')[0] || '';
    const end = (evt.end_date || '').split('T')[0] || '';
    startDate.value = start;
    endDate.value = end;
    startTime.value = '06:00';
    endTime.value = '23:30';
}

function fillPersonnelFullEvent() {
    const box = document.getElementById('personnelAvailFullEvent');
    const startDate = document.getElementById('personnelAvailStartDate');
    const endDate = document.getElementById('personnelAvailEndDate');
    const startTime = document.getElementById('personnelAvailStart');
    const endTime = document.getElementById('personnelAvailEnd');
    if (!box || !startDate || !endDate || !startTime || !endTime) return;
    if (!box.checked) {
        startDate.value = '';
        endDate.value = '';
        startTime.value = '';
        endTime.value = '';
        return;
    }
    const evt = appState.selectedEvent;
    if (!evt || !evt.start_date || !evt.end_date) {
        box.checked = false;
        alert('Event dates are not set.');
        return;
    }
    const start = (evt.start_date || '').split('T')[0] || '';
    const end = (evt.end_date || '').split('T')[0] || '';
    startDate.value = start;
    endDate.value = end;
    startTime.value = '06:00';
    endTime.value = '23:30';
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
    let lat = null;
    let lng = null;
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
        lat: lat,
        lng: lng
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
        alert('Failed to save location: ' + (error?.message || 'Unknown error'));
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
                <label class="form-label" style="display:flex; align-items:center; gap:8px;">
                    <input type="checkbox" id="assignDriverFullEvent" onchange="toggleDriverFullEvent()">
                    Full event (no specific times)
                </label>
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
    const fullEvent = document.getElementById('assignDriverFullEvent')?.checked;
    const date = fullEvent ? null : document.getElementById('assignDriverDate').value;
    const startTime = fullEvent ? null : document.getElementById('assignDriverStartTime').value;
    const endTime = fullEvent ? null : document.getElementById('assignDriverEndTime').value;
    if (!driverId || !role || (!fullEvent && (!date || !startTime || !endTime))) return;

    const asset = appState.assets.find(a => a.id === assetId);
    if (!asset) return;

    const existingDrivers = normalizeAssignmentEntries(asset.assigned_personnel || [], 'personnel')
        .filter(entry => isAssetOperatorRole(entry.role));
    const driverAlready = existingDrivers.some(entry => entry.id === String(driverId));
    if (driverAlready) {
        alert('This person is already assigned to this vehicle.');
        return;
    }
    const overlap = fullEvent ? false : existingDrivers.some(entry => {
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

function toggleDriverFullEvent() {
    const full = document.getElementById('assignDriverFullEvent')?.checked;
    ['assignDriverDate','assignDriverStartTime','assignDriverEndTime'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.disabled = full;
            if (full) el.value = '';
        }
    });
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
                <label class="form-label">Lookup Registration</label>
                <div class="tag-input-row">
                    <input type="text" class="form-input" id="personnelLookupCapId" placeholder="Enter CAP ID to auto-fill">
                    <button type="button" class="btn btn-outline btn-small" onclick="lookupPersonnelFromRegistration()">Lookup</button>
                </div>
                <div class="resource-details" id="personnelLookupStatus"></div>
            </div>
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
                <div class="form-row" style="margin-top:6px;">
                    <label class="form-label" style="display:flex; align-items:center; gap:8px;">
                        <input type="checkbox" id="personnelAvailFullEvent" onchange="fillPersonnelFullEvent()">
                        Full event availability
                    </label>
                </div>
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
        ${person ? `<button class="btn btn-outline" style="margin-left:8px;" onclick="deletePersonnelAction('${personnelId}')">DELETE</button>` : ''}
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

async function lookupPersonnelFromRegistration() {
    const capInput = document.getElementById('personnelLookupCapId');
    const statusEl = document.getElementById('personnelLookupStatus');
    if (!capInput) return;
    const capId = normalizeCapId(capInput.value);
    if (!capId) {
        if (statusEl) statusEl.textContent = 'Enter a CAP ID.';
        return;
    }
    if (!appState.selectedEvent) {
        if (statusEl) statusEl.textContent = 'Select an event first.';
        return;
    }
    if (statusEl) statusEl.textContent = 'Looking up...';
    try {
        const { roster } = await getEventProfile(appState.selectedEvent.id, capId);
        if (!roster) {
            if (statusEl) statusEl.textContent = 'Not found in registrations.';
            return;
        }
        const name = roster.full_name || `${roster.name_first || ''} ${roster.name_last || ''}`.trim();
        document.getElementById('personnelName').value = name || '';
        document.getElementById('personnelCapId').value = roster.cap_id || '';
        document.getElementById('personnelRank').value = roster.rank || '';
        document.getElementById('personnelSpecialties').value = roster.member_type || '';
        if (statusEl) statusEl.textContent = 'Filled from registration.';
    } catch (err) {
        console.error('Lookup failed', err);
        if (statusEl) statusEl.textContent = 'Lookup failed.';
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
                    <optgroup label="Assets & Vehicles">
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
            const entryId = typeof entry === 'string'
                ? entry
                : (entry.id || entry.personnel_id || '');
            return String(entryId) !== String(personnelId);
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

// Billeting summary loader
async function renderBilletingSummaryData(capId) {
    const container = document.getElementById('billetingSummary');
    if (!container || !appState.selectedEvent) return;
    try {
        const asn = await getBilletingAssignment(appState.selectedEvent.id, capId);
        if (asn) {
            const resolved = asn.resolved_location || {};
            appState.billetingByCap = appState.billetingByCap || {};
            appState.billetingByCap[capId] = {
                building: resolved.building || asn.billeting_bunks?.billeting_rooms?.billeting_floors?.billeting_buildings?.name || '',
                floor: resolved.floor || asn.billeting_bunks?.billeting_rooms?.billeting_floors?.floor_number || '',
                room: resolved.room || asn.billeting_bunks?.billeting_rooms?.room_number || '',
                bunk: resolved.bunk || asn.billeting_bunks?.bunk_number || ''
            };
        }
        const cached = appState.billetingByCap ? appState.billetingByCap[capId] : null;
        if (cached) {
            container.innerHTML = `
                <div class="profile-field"><div class="profile-label">Building</div><div class="profile-value">${cached.building || 'N/A'}</div></div>
                <div class="profile-field"><div class="profile-label">Floor</div><div class="profile-value">${cached.floor || 'N/A'}</div></div>
                <div class="profile-field"><div class="profile-label">Room</div><div class="profile-value">${cached.room || 'N/A'}</div></div>
                <div class="profile-field"><div class="profile-label">Bunk</div><div class="profile-value">${cached.bunk || 'N/A'}</div></div>
            `;
        } else {
            container.innerHTML = '<div class="resource-details">Not assigned.</div>';
        }
        if (isPrivileged()) {
            container.insertAdjacentHTML('beforeend', `<div style="margin-top:8px;"><button class="btn btn-outline btn-small" onclick="switchView('billeting')">Assign Billeting</button></div>`);
        }
    } catch (err) {
        console.error('Billeting summary load failed', err);
        container.innerHTML = '<div class="resource-details">Error loading billeting.</div>';
    }
}

