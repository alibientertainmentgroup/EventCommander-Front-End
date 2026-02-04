// UI Components and Rendering Functions

const ROLE_COLORS = {
    'driver': { bg: 'rgba(59, 130, 246, 0.7)', border: 'rgba(59, 130, 246, 0.95)' },
    'safety officer': { bg: 'rgba(16, 185, 129, 0.7)', border: 'rgba(16, 185, 129, 0.95)' },
    'hso': { bg: 'rgba(245, 158, 11, 0.7)', border: 'rgba(245, 158, 11, 0.95)' },
    'support staff': { bg: 'rgba(139, 92, 246, 0.7)', border: 'rgba(139, 92, 246, 0.95)' },
    'orientation pilot': { bg: 'rgba(14, 116, 144, 0.7)', border: 'rgba(14, 116, 144, 0.95)' },
    'to': { bg: 'rgba(244, 63, 94, 0.7)', border: 'rgba(244, 63, 94, 0.95)' },
    'other': { bg: 'rgba(148, 163, 184, 0.7)', border: 'rgba(148, 163, 184, 0.95)' }
};

function roleKey(role) {
    return (role || '').toLowerCase().trim();
}

function roleStyle(role) {
    const key = roleKey(role);
    return ROLE_COLORS[key] || ROLE_COLORS.other;
}

function formatEventDates(event) {
    const start = event.start_date ? parseDateLocal(event.start_date) : null;
    const end = event.end_date ? parseDateLocal(event.end_date) : null;

    if (!start && !end) return 'Dates TBD';
    if (start && !end) {
        return start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
    if (!start && end) {
        return end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
    if (sameMonth) {
        const month = start.toLocaleDateString('en-US', { month: 'short' });
        const year = start.getFullYear();
        return `${month} ${start.getDate()}â€“${end.getDate()}, ${year}`;
    }

    const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const endStr = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return `${startStr}â€“${endStr}`;
}

// ==================== DASHBOARD COMPONENTS ====================

function renderDashboard(events, personnel, assets) {
    if (isPrivileged()) {
        return renderAdminHome(events);
    }
    return renderSchedule(getUserSchedule());
}


function renderAdminHome(events) {
    return `
        <div class="page-header">
            <div>
                <h2 class="page-title">SELECT EVENT</h2>
                <p class="page-subtitle">Choose an event to manage or create a new one</p>
            </div>
            <div class="flex gap-2" style="align-items:center;">
                <label class="toggle-row toggle-switch" style="margin:0;">\n                    <input type="checkbox" ${appState.sandboxMode ? 'checked' : ''} onchange="toggleSandboxMode()">\n                    <span class="toggle-track"></span>\n                    <span class="toggle-label">Sandbox Mode</span>\n                    ${appState.sandboxMode ? '<span class="sandbox-flag">Sandbox</span>' : ''}\n                </label>
                ${isPrivileged() ? `
                <button class="btn btn-blue" onclick="openEventModal()">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="12" y1="5" x2="12" y2="19"></line>
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                    NEW EVENT
                </button>
                ` : ''}
            </div>
        </div>

        <div class="events-grid">
            ${events.map(event => renderEventCard(event)).join('')}
        </div>

        ${events.length === 0 ? `
            <div class="empty-state">
                <div class="empty-state-text">No events yet</div>
            </div>
        ` : ''}
    `;
}

function renderEventsByStatus(status, events) {
    const filteredEvents = events.filter(e => e.status === status);
    const statusColors = {
        active: 'green',
        upcoming: 'yellow',
        completed: 'blue'
    };

    return `
        <div class="resource-section">
            <h3 class="resource-header status-${statusColors[status]}">${status.toUpperCase()} Events</h3>
            <div class="resource-list">
                ${filteredEvents.length === 0 ? 
                    `<div class="empty-state">
                        <div class="empty-state-text">No ${status} events</div>
                    </div>` :
                    filteredEvents.map(event => {
                        const personnelFilled = (event.assigned_personnel || []).length >= parseInt(event.personnel_needed || 0);
                        const assetsFilled = (event.assigned_assets || []).length >= parseInt(event.assets_needed || 0);
                        
                        return `
                            <div class="resource-item cursor-pointer" onclick="showEventDetail('${event.id}')">
                                <div class="resource-name">${event.title}</div>
                                <div class="flex gap-2 mt-4">
                                    <span class="badge ${personnelFilled ? 'status-green' : 'status-red'}" style="background: ${personnelFilled ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)'}">
                                        P: ${(event.assigned_personnel || []).length}/${event.personnel_needed || 0}
                                    </span>
                                    <span class="badge ${assetsFilled ? 'status-green' : 'status-red'}" style="background: ${assetsFilled ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)'}">
                                        A: ${(event.assigned_assets || []).length}/${event.assets_needed || 0}
                                    </span>
                                </div>
                            </div>
                        `;
                    }).join('')
                }
            </div>
        </div>
    `;
}

// ==================== EVENTS COMPONENTS ====================

function renderEvents(events) {
    return `
        <div class="page-header">
            <div>
                <h2 class="page-title">EVENTS</h2>
            </div>
            <div class="flex gap-2" style="align-items:center;">
                <label class="toggle-row toggle-switch" style="margin:0;">\n                    <input type="checkbox" ${appState.sandboxMode ? 'checked' : ''} onchange="toggleSandboxMode()">\n                    <span class="toggle-track"></span>\n                    <span class="toggle-label">Sandbox Mode</span>\n                    ${appState.sandboxMode ? '<span class="sandbox-flag">Sandbox</span>' : ''}\n                </label>
                ${isPrivileged() ? `
                    <button class="btn btn-blue" onclick="openEventModal()">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="12" y1="5" x2="12" y2="19"></line>
                            <line x1="5" y1="12" x2="19" y2="12"></line>
                        </svg>
                        NEW EVENT
                    </button>
                ` : ''}
            </div>
        </div>

        <div class="events-grid">
            ${events.map(event => renderEventCard(event)).join('')}
        </div>

        ${events.length === 0 ? `
            <div class="empty-state">
                <div class="empty-state-icon">??</div>
                <div class="empty-state-text">No events yet</div>
            </div>
        ` : ''}
    `;
}

// ==================== INPROCESSING COMPONENTS ====================

function renderInprocessing() {
    const activeProfile = appState.inprocessProfile;
    const activeCapId = activeProfile ? String(activeProfile.capId || '').trim() : '';
    const activeEntry = activeCapId
        ? appState.roster.find(r => String(r.capId) === activeCapId && !r.signed_out_at)
        : null;
    const isSignedIn = !!activeEntry;
    const isStudent = isSignedIn && activeEntry.role === 'student';
    const stations = ['Forms Review', 'Medical', 'Inspection', 'Billeting', 'Supply', 'Complete Inprocessing'];
    const inprocessAverage = calculateInprocessAverage(appState.roster);
    return `
        <div class="page-header">
            <div>
                <h2 class="page-title">INPROCESSING</h2>
                <p class="page-subtitle">Look up cadets by CAP ID and complete inprocessing steps.</p>
            </div>
            <div class="metrics-grid" style="grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));">
                <div class="metric-card">
                    <div class="metric-header">
                        <svg class="metric-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10"></circle>
                            <path d="M12 6v6l4 2"></path>
                        </svg>
                        <div class="metric-value status-blue">${inprocessAverage.label}</div>
                    </div>
                    <div class="metric-label">Avg Inprocessing Time (Students)</div>
                </div>
            </div>
        </div>

        <div class="inprocess-lookup">
            <div class="form-row">
                <label class="form-label">CAP ID</label>
                <div class="tag-input-row">
                    <input type="text" class="form-input cap-id-input" id="inprocessCapId" placeholder="Enter CAP ID" maxlength="6" inputmode="numeric">
                    <button class="btn btn-blue" onclick="lookupInprocessingCadet()">GO</button>
                    ${isSignedIn ? `<button class="btn btn-outline btn-small" onclick="resetInprocessingForActive()">Clear Inprocessing</button>` : ''}
                </div>
            </div>
            <div class="form-row" style="display:flex; gap:12px; flex-wrap: wrap;">
                ${activeProfile && !isSignedIn ? `
                    <button class="btn btn-outline" onclick="signInInprocessing('staff')">Sign In Staff</button>
                    <button class="btn btn-outline" onclick="signInInprocessing('student')">Sign In Student</button>
                ` : ''}
                ${activeProfile && isSignedIn ? `<div class="resource-details">Signed in.</div>` : ''}
            </div>
            ${!activeProfile ? `
                <div class="resource-details">${appState.inprocessMessage || 'Google Sheet lookup not connected yet.'}</div>
            ` : ''}
        </div>

        ${isStudent ? `
            <div class="profile-section">
                <div class="resource-header status-blue">STATIONS</div>
                <div class="station-grid">
                    ${stations.map(name => {
                        const status = activeEntry?.stations?.[name] || { status: 'pending', flagged: false };
                        const cls = status.status === 'complete' ? 'station-complete' : (status.flagged ? 'station-flag' : '');
                        return `<button class="btn btn-outline station-btn ${cls}" onclick="setInprocessStation('${name}')">${name}</button>`;
                    }).join('')}
                </div>
            </div>

            ${appState.inprocessStation ? (() => {
                const hasUnresolvedFlags = ((activeEntry?.flags || []).some(f => !f.resolved)) ||
                    Object.values(activeEntry?.stations || {}).some(s => s?.flagged);
                return `
                <div class="profile-section">
                    <div class="resource-header status-blue">${appState.inprocessStation}</div>
                    <div class="resource-details">Station details will populate here.</div>
                    <div class="form-row" style="display:flex; gap:12px; flex-wrap: wrap; margin-top: 12px;">
                        ${appState.inprocessStation !== 'Complete Inprocessing' ? `
                            <button class="btn btn-blue" onclick="completeStation()">Complete</button>
                            <button class="btn btn-flag" onclick="openFlagModal()">Flag</button>
                        ` : `
                            ${hasUnresolvedFlags ? '' : `<button class="btn btn-blue" onclick="completeStation()">Complete</button>`}
                            <button class="btn btn-flag" onclick="openFlagModal()">Flag</button>
                        `}
                    </div>
                    ${appState.inprocessStation === 'Complete Inprocessing' ? `
                        <div class="resource-details" style="margin-top: 8px;">Complete only after all stations and flags are resolved.</div>
                        ${renderFlagSummary(activeEntry)}
                    ` : ''}
                </div>
            `;
            })() : ''}
        ` : ''}

        ${isSignedIn && !isStudent ? `
            <div class="resource-details" style="margin-top: 8px;">Staff signed in. Stations apply to students only.</div>
        ` : ''}

        ${activeProfile ? renderInprocessingProfile(activeProfile) : ''}

    `;
}

function renderOutprocessing() {
    const activeProfile = appState.inprocessProfile;
    const activeCapId = activeProfile ? String(activeProfile.capId || '').trim() : '';
    const activeEntry = activeCapId
        ? appState.roster.find(r => String(r.capId) === activeCapId && !r.signed_out_at)
        : null;

    return `
        <div class="page-header">
            <div>
                <h2 class="page-title">OUTPROCESSING</h2>
                <p class="page-subtitle">Look up cadets by CAP ID and sign them out.</p>
            </div>
        </div>

        <div class="card">
            <div class="form-row">
                <label class="form-label">CAP ID</label>
                <div class="tag-input-row">
                    <input type="text" class="form-input cap-id-input" id="inprocessCapId" placeholder="Enter CAP ID" maxlength="6" inputmode="numeric">
                    <button class="btn btn-blue" onclick="lookupInprocessingCadet()">GO</button>
                </div>
            </div>
            <div class="form-row" style="display:flex; gap:12px; flex-wrap: wrap;">
                ${activeProfile && activeEntry ? `<button class="btn btn-outline" onclick="signOutInprocessing()">Sign Out</button>` : ''}
                ${activeProfile && !activeEntry ? `<div class="resource-details">Not currently signed in.</div>` : ''}
            </div>
            <div id="inprocessResult" class="resource-details">
                ${activeProfile ? renderInprocessingProfile(activeProfile) : (appState.inprocessMessage || 'Google Sheet lookup not connected yet.')}
            </div>
        </div>
    `;
}

function renderFlagSummary(entry) {
    const flags = entry?.flags || [];
    if (!flags.length) {
        return `<div class="resource-details" style="margin-top: 8px;">No flags.</div>`;
    }
    return `
        <div class="resource-list" style="margin-top: 12px;">
            ${flags.map((flag, idx) => `
                <div class="resource-item">
                    <div class="resource-name">${flag.station}</div>
                    <div class="resource-details">${flag.reason}</div>
                    ${flag.owner ? `<div class="resource-details">Owner: ${flag.owner}</div>` : ''}
                    <div class="resource-details">Flagged: ${new Date(flag.created_at).toLocaleString()}</div>
                    ${flag.resolved ? `
                        <div class="resource-details">Status: Resolved</div>
                        ${flag.resolution_notes ? `<div class="resource-details">Resolution: ${flag.resolution_notes}</div>` : ''}
                        ${flag.resolved_at ? `<div class="resource-details">Resolved: ${new Date(flag.resolved_at).toLocaleString()}</div>` : ''}
                        ${flag.resolved_by ? `<div class="resource-details">Resolved By: ${flag.resolved_by}</div>` : ''}
                    ` : `<button class="btn btn-outline btn-small" onclick="openResolveFlagModal(${idx})">Resolve Flag</button>`}
                </div>
            `).join('')}
        </div>
    `;
}

// ==================== ROSTER COMPONENTS ====================

function renderRoster(roster) {
    const filter = window.__rosterFilter || 'all';
    const query = (window.__rosterQuery || '').toLowerCase().trim();
    const filtered = roster
        .filter(r => filter === 'all' ? true : r.role === filter)
        .filter(r => {
            if (!query) return true;
            const name = (r.name || '').toLowerCase();
            const cap = String(r.capId || r.cap_id || '').toLowerCase();
            return name.includes(query) || cap.includes(query);
        })
        .sort((a, b) => (b.signed_in_at || '').localeCompare(a.signed_in_at || ''));
    const deduped = [];
    const seen = new Set();
    filtered.forEach(r => {
        const key = String(r.capId || r.cap_id || '');
        if (!key || seen.has(key)) return;
        seen.add(key);
        deduped.push(r);
    });

    const sorted = deduped.sort((a, b) => {
        const aLast = (a.lastName || '').toLowerCase();
        const bLast = (b.lastName || '').toLowerCase();
        if (aLast !== bLast) return aLast.localeCompare(bLast);
        const aFirst = (a.firstName || '').toLowerCase();
        const bFirst = (b.firstName || '').toLowerCase();
        if (aFirst !== bFirst) return aFirst.localeCompare(bFirst);
        const aRank = (a.rank || '').toLowerCase();
        const bRank = (b.rank || '').toLowerCase();
        return aRank.localeCompare(bRank);
    });

    return `
        <div class="page-header">
            <div>
                <h2 class="page-title">EVENT ROSTER</h2>
                <p class="page-subtitle">Signed-in staff and students</p>
            </div>
            <div class="flex gap-2" style="align-items:center;">
                <input type="text" class="form-input roster-search" placeholder="Search CAP ID or Name" value="${window.__rosterQuery || ''}" oninput="setRosterSearch(this.value)">
                <button class="btn btn-outline btn-small ${filter === 'all' ? 'btn-toggle active' : ''}" onclick="setRosterFilter('all')">All</button>
                <button class="btn btn-outline btn-small ${filter === 'staff' ? 'btn-toggle active' : ''}" onclick="setRosterFilter('staff')">Staff</button>
                <button class="btn btn-outline btn-small ${filter === 'student' ? 'btn-toggle active' : ''}" onclick="setRosterFilter('student')">Students</button>
            </div>
        </div>

        <div class="roster-table-wrap">
            <table class="roster-table">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Rank</th>
                        <th>CAP ID</th>
                        <th>Sign In</th>
                        <th>Sign Out</th>
                    </tr>
                </thead>
                <tbody>
                    ${sorted.length ? sorted.map(r => `
                        <tr class="roster-line" onclick="openRosterProfile('${r.id}')">
                            <td>${r.lastName ? `${r.lastName}${r.firstName ? `, ${r.firstName}` : ''}` : (r.name || 'Unknown')}</td>
                            <td>${r.rank || 'â€”'}</td>
                            <td>${r.capId || r.cap_id || 'N/A'}</td>
                            <td>${formatSignedIn(r.signed_in_at)}</td>
                            <td>${r.signed_out_at ? formatSignedIn(r.signed_out_at) : 'â€”'}</td>
                        </tr>
                    `).join('') : '<tr><td class="empty-state-text text-center" colspan="5">No roster entries yet</td></tr>'}
                </tbody>
            </table>
        </div>
    `;
}

function formatSignedIn(value) {
    if (!value) return 'N/A';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// ==================== LOCATIONS COMPONENTS ====================

function renderLocations(locations) {
    return `
        <div class="page-header">
            <div>
                <h2 class="page-title">LOCATIONS</h2>
            </div>
            ${isPrivileged() ? `
                <button class="btn btn-blue" onclick="openLocationModal()">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="12" y1="5" x2="12" y2="19"></line>
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                    ADD LOCATION
                </button>
            ` : ''}
        </div>

        <div class="resource-list">
            ${locations.map(loc => {
                const lat = loc.lat || loc.latitude;
                const lng = loc.lng || loc.longitude;
                const address = [loc.street, loc.city, loc.state, loc.zip].filter(Boolean).join(', ');
                const gps = lat && lng ? `${lat}, ${lng}` : '';
                const display = gps ? `GPS: ${gps}` : address;
                const query = gps || address;
                const hasAddress = Boolean(query);
                return `
                <div class="resource-item">
                    <div class="flex-between">
                        <div style="flex: 1;">
                            <div class="resource-name">${loc.name}</div>
                            <div class="resource-details">${display}</div>
                        </div>
                        <div class="flex gap-2">
                            ${hasAddress ? `
                                <a class="directions-btn directions-btn-compact" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}" target="_blank" rel="noopener noreferrer" title="Directions">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                        <circle cx="12" cy="12" r="9"></circle>
                                        <path d="M8 12h7"></path>
                                        <path d="M12.5 8.5l3.5 3.5-3.5 3.5"></path>
                                    </svg>
                                </a>
                            ` : ''}
            ${isPrivileged() ? `
                <button class="btn btn-small btn-outline" onclick="openLocationModal('${loc.id}')">Edit</button>
                <button class="btn btn-small btn-outline" onclick="deleteLocationAction('${loc.id}')">Delete</button>
            ` : ''}
                        </div>
                    </div>
                </div>
            `;
            }).join('')}
            ${locations.length === 0 ? '<div class="empty-state-text text-center">No locations yet</div>' : ''}
        </div>
    `;
}

// ==================== SCHEDULE COMPONENTS ====================

function renderSchedule(entries) {
    if (!entries.length) {
        return `
            <div class="page-header">
                <div>
                    <h2 class="page-title">SCHEDULE</h2>
                </div>
                <div class="flex gap-2" style="align-items:center;">
                    <label class="toggle-row toggle-switch" style="margin:0;">
                        <input type="checkbox" ${appState.sandboxMode ? 'checked' : ''} onchange="toggleSandboxMode()">
                        <span class="toggle-track"></span>
                        <span class="toggle-label">Sandbox Mode</span>
                        ${appState.sandboxMode ? '<span class="sandbox-flag">Sandbox</span>' : ''}
                    </label>
                </div>
            </div>
            <div class="empty-state">
                <div class="empty-state-text">No assignments yet</div>
            </div>
        `;
    }

    const grouped = entries.reduce((acc, item) => {
        const key = item.date || 'No Date';
        acc[key] = acc[key] || [];
        acc[key].push(item);
        return acc;
    }, {});

    return `
        <div class="page-header">
            <div>
                <h2 class="page-title">SCHEDULE</h2>
            </div>
            <div class="flex gap-2" style="align-items:center;">
                <label class="toggle-row toggle-switch" style="margin:0;">
                    <input type="checkbox" ${appState.sandboxMode ? 'checked' : ''} onchange="toggleSandboxMode()">
                    <span class="toggle-track"></span>
                    <span class="toggle-label">Sandbox Mode</span>
                    ${appState.sandboxMode ? '<span class="sandbox-flag">Sandbox</span>' : ''}
                </label>
            </div>
        </div>

        ${Object.keys(grouped).sort().map(date => `
            <div class="resource-section">
                <h3 class="resource-header status-blue">${date}</h3>
                <div class="resource-list">
                    ${grouped[date].map(item => `
                        <div class="resource-item schedule-item">
                            <div class="schedule-info">
                                <div class="resource-name">${item.title}${item.role ? ` â€¢ ${item.role}` : ''}${item.stayAtLocation ? ` â€¢ <span class="stay-label">Remain Onsite</span>` : ''}</div>
                                <div class="resource-details">${item.start || 'TBD'}â€“${item.end || 'TBD'}</div>
                                ${item.asset ? `<div class="resource-details">Asset: ${item.asset.type || item.asset.name} ${item.asset.details || ''}</div>` : ''}
                                ${item.fromLocation ? `<div class="resource-details">From: ${item.fromLocation}</div>` : ''}
                                ${item.toLocation ? `<div class="resource-details">To: ${item.toLocation}</div>` : ''}
                                ${!item.fromLocation && !item.toLocation && item.location ? `<div class="resource-details">Location: ${item.location.name || item.location}</div>` : ''}
                            </div>
                            ${item.address ? `
                                <a class="directions-btn" href="${
                                    (item.fromAddress && item.toAddress)
                                        ? `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(item.fromAddress)}&destination=${encodeURIComponent(item.toAddress)}`
                                        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.toAddress || item.address)}`
                                }" target="_blank" rel="noopener noreferrer" title="Directions">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                        <circle cx="12" cy="12" r="9"></circle>
                                        <path d="M8 12h7"></path>
                                        <path d="M12.5 8.5l3.5 3.5-3.5 3.5"></path>
                                    </svg>
                                </a>
                            ` : ''}
                        </div>
                    `).join('')}
                </div>
            </div>
        `).join('')}
    `;
}

function renderStayLabel() {
    return ` â€¢ <span class="stay-label">Remain Onsite</span>`;
}

function calculateInprocessAverage(roster) {
    const completed = (roster || []).filter(r =>
        r.role === 'student' &&
        r.signed_in_at &&
        r.inprocess_completed_at &&
        !((r.flags || []).length)
    );
    if (!completed.length) {
        return { label: 'N/A', minutes: 0 };
    }
    const totalMs = completed.reduce((sum, r) => {
        const start = new Date(r.signed_in_at).getTime();
        const end = new Date(r.inprocess_completed_at).getTime();
        if (!start || !end || Number.isNaN(start) || Number.isNaN(end)) return sum;
        return sum + Math.max(0, end - start);
    }, 0);
    const avgMs = totalMs / completed.length;
    const totalMinutes = Math.round(avgMs / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const label = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
    return { label, minutes: totalMinutes };
}

function renderEventCard(event) {
    const personnelFilled = (event.assigned_personnel || []).length >= parseInt(event.personnel_needed || 0);
    const assetsFilled = (event.assigned_assets || []).length >= parseInt(event.assets_needed || 0);

    return `
        <div class="event-card" onclick="selectEvent('${event.id}', 'dashboard')">
            <h3 class="event-title">${event.title}</h3>
            <p class="event-description">${event.description || ''}</p>
            <div class="event-dates">${formatEventDates(event)}</div>
            <span class="event-status status-${event.status}">${event.status.toUpperCase()}</span>
        </div>
    `;
}

// ==================== EVENT DASHBOARD ====================

function renderEventDashboard(event, activities, assets, personnel) {
    const planning = activities.filter(a => a.column === 'Planning').length;
    const ready = activities.filter(a => a.column === 'Ready').length;
    const inProgress = activities.filter(a => a.column === 'In Progress').length;
    const completed = activities.filter(a => a.column === 'Completed').length;
    const totalActivities = activities.length;

    const personnelAssigned = (event.assigned_personnel || []).length;
    const assetsAssigned = (event.assigned_assets || []).length;
    const inprocessAverage = calculateInprocessAverage(appState.roster);

    const today = formatDateLocal(new Date());
    const selectedDate = appState.dashboardDate || today;
    const dayActivities = activities
        .filter(a => a.activity_date === selectedDate)
        .sort((a, b) => {
            const aTime = a.start_time || '99:99';
            const bTime = b.start_time || '99:99';
            return aTime.localeCompare(bTime);
        });

    return `
        <div class="page-header">
            <div>
                <h2 class="page-title">${event.title}</h2>
                <p class="page-subtitle">${event.description || ''}</p>
                <div class="event-dates">${formatEventDates(event)}</div>
            </div>
            <button class="btn btn-blue" onclick="selectEvent('${event.id}', 'events')">
                VIEW EVENT
            </button>
        </div>

        <div class="metrics-grid">
            <div class="metric-card">
                <div class="metric-header">
                    <svg class="metric-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                        <line x1="16" y1="2" x2="16" y2="6"></line>
                        <line x1="8" y1="2" x2="8" y2="6"></line>
                        <line x1="3" y1="10" x2="21" y2="10"></line>
                    </svg>
                    <div class="metric-value status-blue">${totalActivities}</div>
                </div>
                <div class="metric-label">Subevents</div>
            </div>

            <div class="metric-card">
                <div class="metric-header">
                    <svg class="metric-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                    </svg>
                    <div class="metric-value status-yellow">${planning}</div>
                </div>
                <div class="metric-label">Planning</div>
            </div>

            <div class="metric-card">
                <div class="metric-header">
                    <svg class="metric-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="8" x2="12" y2="12"></line>
                        <line x1="12" y1="16" x2="12.01" y2="16"></line>
                    </svg>
                    <div class="metric-value status-blue">${ready}</div>
                </div>
                <div class="metric-label">Ready</div>
            </div>

            <div class="metric-card">
                <div class="metric-header">
                    <svg class="metric-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <polyline points="12 6 12 12 16 14"></polyline>
                    </svg>
                    <div class="metric-value status-green">${inProgress}</div>
                </div>
                <div class="metric-label">In Progress</div>
            </div>

            <div class="metric-card">
                <div class="metric-header">
                    <svg class="metric-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                        <polyline points="22 4 12 14.01 9 11.01"></polyline>
                    </svg>
                    <div class="metric-value status-blue">${completed}</div>
                </div>
                <div class="metric-label">Completed</div>
            </div>

            <div class="metric-card">
                <div class="metric-header">
                    <svg class="metric-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <path d="M12 6v6l4 2"></path>
                    </svg>
                    <div class="metric-value status-blue">${inprocessAverage.label}</div>
                </div>
                <div class="metric-label">Avg Inprocessing Time</div>
            </div>
        </div>

        <div class="resource-section">
            <div class="flex-between" style="margin-bottom: 12px;">
                <h3 class="resource-header status-blue">DAILY SCHEDULE</h3>
                <div class="tag-input-row" style="gap: 8px; align-items: center;">
                    <label class="form-label" style="margin: 0;">Date</label>
                    <input type="date" class="form-input" style="width: 170px;" value="${selectedDate}" onchange="setDashboardDate(this.value)">
                </div>
            </div>
            <div class="resource-list">
                ${dayActivities.length ? dayActivities.map(a => `
                    <div class="resource-item cursor-pointer" onclick="openActivityDetail('${a.id}', { readOnly: true })">
                        <div class="resource-name">${a.title}</div>
                        <div class="resource-details">${a.description || ''}</div>
                        ${a.location_id ? `<div class="event-dates">Location: ${formatLocationLabel(appState.locations.find(l => l.id === a.location_id))}</div>` : ''}
                        <div class="event-dates">${formatActivityDateTime(a)}</div>
                        <div class="kanban-card-badges" style="margin-top: 8px;">
                            <span class="badge badge-blue">P: ${getNonDriverAssignedCount(a)}/${getRequiredCount(a.support_personnel_required)}</span>
                            <span class="badge badge-purple">A: ${getAssignedIds(a.assigned_assets, 'assets').length}/${getRequiredCount(a.assets_required)}</span>
                        </div>
                    </div>
                `).join('') : '<div class="empty-state-text text-center">No activities scheduled for this date.</div>'}
            </div>
        </div>
    `;
}

// ==================== ASSETS COMPONENTS ====================

function renderAssets(assets, activities, selectedDate) {
    return renderTimelineView('ASSETS', assets, activities, selectedDate, 'assets');
}

function renderPersonnel(personnel, activities, selectedDate) {
    return renderTimelineView('PERSONNEL', personnel, activities, selectedDate, 'personnel');
}

function renderTimelineView(title, rows, activities, selectedDate, type) {
    const date = selectedDate || getDefaultTimelineDateFromData(activities || [], rows || []);
    const dates = getTimelineDates(date, appState.timelineDays || 1);
    const activitiesByDate = groupActivitiesByDate(activities || []);

    return `
        <div class="page-header">
            <div>
                <h2 class="page-title">${title}</h2>
                <p class="page-subtitle">Timeline view</p>
            </div>
            <div class="flex gap-2" style="align-items:center;">
                <button class="btn btn-outline btn-small" onclick="shiftTimelineDate(-1)">Prev Day</button>
                <input type="date" class="form-input" value="${date}" onchange="setTimelineDate(this.value)">
                <button class="btn btn-outline btn-small" onclick="shiftTimelineDate(1)">Next Day</button>
                <div class="timeline-toggle">
                    ${renderTimelineToggleButton(1, '1D')}
                    ${renderTimelineToggleButton(2, '2D')}
                    ${renderTimelineToggleButton(3, '3D')}
                    ${renderTimelineToggleButton(4, '4D')}
                    ${renderTimelineToggleButton(7, '1W')}
                </div>
            </div>
        </div>

        ${isPrivileged() && type === 'assets' ? `
            <div class="mb-4">
                <button class="btn btn-blue" onclick="openAssetModal()">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="12" y1="5" x2="12" y2="19"></line>
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                    ADD ASSET
                </button>
            </div>
        ` : ''}

        ${isPrivileged() && type === 'personnel' ? `
            <div class="mb-4">
                <button class="btn btn-blue" onclick="openPersonnelModal()">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="12" y1="5" x2="12" y2="19"></line>
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                    ADD PERSONNEL
                </button>
            </div>
        ` : ''}

        ${type === 'personnel' ? renderRoleLegend() : ''}

        <div class="timeline" style="--timeline-days:${dates.length};">
            ${renderTimelineHeader(dates)}
            ${rows.map(row => renderTimelineRow(row, activitiesByDate, type, dates)).join('')}
        </div>
    `;
}

function renderTimelineHeader(dates) {
    return `
        <div class="timeline-header">
            <div class="timeline-row-label">Resource</div>
            ${dates.map(d => `
                <div class="timeline-day-header">
                    ${parseDateLocal(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    <div class="timeline-hour-row">
                        ${renderTimelineHours()}
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

function renderTimelineRow(row, activitiesByDate, type, dates) {
    const signedIn = type === 'personnel' && appState.roster.some(r =>
        !r.signed_out_at && String(r.capId || r.cap_id || '') === String(row.cap_id || '')
    );
    const statusClass = type === 'personnel' ? (signedIn ? 'status-blue' : 'status-red') : '';
    return `
        <div class="timeline-row">
            <div class="timeline-row-label timeline-clickable ${statusClass}" onclick="${isPrivileged() ? (type === 'assets' ? `openAssetModal('${row.id}')` : `openPersonnelModal('${row.id}')`) : ''}">${type === 'assets' ? `${row.type || row.name} ${row.details || ''}`.trim() : row.name}</div>
            ${dates.map(d => `
                <div class="timeline-grid">
                    ${buildTimelineBars(row, activitiesByDate[d] || [], type, d).join('')}
                </div>
            `).join('')}
        </div>
    `;
}

function buildTimelineBars(resource, activities, type, date) {
    const dayStart = 6 * 60;
    const dayEnd = 22 * 60;
    const total = dayEnd - dayStart;
    const bars = [];

    const availability = getAvailabilityWindows(resource, date);
    const unavailable = buildUnavailableWindows(availability, dayStart, dayEnd);
    unavailable.forEach(block => {
        const left = Math.max(0, (block.start - dayStart) / total * 100);
        const width = Math.max(1, (block.end - block.start) / total * 100);
        bars.push(`<div class="timeline-bar timeline-bar-unavailable" style="left:${left}%;width:${width}%;" title="Unavailable"></div>`);
    });

    activities.forEach(activity => {
        const list = type === 'assets' ? (activity.assigned_assets || []) : (activity.assigned_personnel || []);
        const entries = normalizeAssignmentEntries(list, type).filter(e => e.id === String(resource.id));
        if (!entries.length) return;

        entries.forEach(entry => {
            const window = getAssignmentWindow(activity, entry);
            if (!window) return;
            const startMin = window.start.getHours() * 60 + window.start.getMinutes();
            const endMin = window.end.getHours() * 60 + window.end.getMinutes();
            const left = Math.max(0, (startMin - dayStart) / total * 100);
            const width = Math.max(2, (endMin - startMin) / total * 100);
            const label = activity.title;
            const stayIcon = entry.stay_at_location ? ` ${renderStayLabel()}` : '';
            const title = entry.stay_at_location ? `${label} â€¢ Remain Onsite` : label;
            if (type === 'personnel') {
                const style = roleStyle(entry.role);
                bars.push(`<div class="timeline-bar${entry.stay_at_location ? ' timeline-bar-stay' : ''}" data-label="${label}" style="left:${left}%;width:${width}%;background:${style.bg};border-color:${style.border};" title="${title}">${label}${stayIcon}</div>`);
            } else {
                bars.push(`<div class="timeline-bar${entry.stay_at_location ? ' timeline-bar-stay' : ''}" data-label="${label}" style="left:${left}%;width:${width}%;" title="${title}">${label}${stayIcon}</div>`);
            }
        });
    });

    return bars;
}

function renderTimelineHours() {
    const hours = [];
    for (let h = 6; h <= 22; h += 2) {
        const label = `${String(h).padStart(2, '0')}:00`;
        hours.push(`<div class="timeline-hour">${label}</div>`);
    }
    return hours.join('');
}

function renderTimelineToggleButton(days, label) {
    const active = (appState.timelineDays || 1) === days ? 'active' : '';
    return `<button class="btn btn-outline btn-small btn-toggle ${active}" onclick="setTimelineDays(${days})">${label}</button>`;
}

function getTimelineDates(startDate, days) {
    const start = parseDateLocal(startDate);
    const result = [];
    for (let i = 0; i < days; i++) {
        const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
        result.push(formatDateLocal(d));
    }
    return result;
}

function groupActivitiesByDate(activities) {
    const map = {};
    activities.forEach(a => {
        if (!a.activity_date) return;
        if (!map[a.activity_date]) map[a.activity_date] = [];
        map[a.activity_date].push(a);
    });
    return map;
}

function renderRoleLegend() {
    const items = [
        'Driver',
        'Safety Officer',
        'HSO',
        'Support Staff',
        'Orientation Pilot',
        'TO',
        'Other'
    ];
    return `
        <div class="role-legend">
            ${items.map(role => {
                const style = roleStyle(role);
                return `
                    <div class="role-legend-item">
                        <span class="role-swatch" style="background:${style.bg};border-color:${style.border};"></span>
                        <span>${role}</span>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

function buildUnavailableWindows(availability, dayStart, dayEnd) {
    if (!availability.length) {
        return [{ start: dayStart, end: dayEnd }];
    }
    const windows = availability
        .map(a => ({
            start: a.start.getHours() * 60 + a.start.getMinutes(),
            end: a.end.getHours() * 60 + a.end.getMinutes()
        }))
        .sort((a, b) => a.start - b.start);

    const result = [];
    let cursor = dayStart;
    windows.forEach(w => {
        if (w.start > cursor) result.push({ start: cursor, end: w.start });
        cursor = Math.max(cursor, w.end);
    });
    if (cursor < dayEnd) result.push({ start: cursor, end: dayEnd });
    return result;
}

// ==================== ADMIN PANEL ====================

function renderAdminPanel() {
    const roles = getSupportRoles();
    const accessRoles = ['user', 'staff', 'admin'];
    const signedIn = appState.roster.filter(r => !r.signed_out_at);
    return `
        <div class="page-header">
            <div>
                <h2 class="page-title">ADMIN</h2>
                <p class="page-subtitle">Manage roles and administrative tools.</p>
            </div>
        </div>
        <div class="card" style="max-width: 520px; width: 100%; margin-bottom: 16px;">
            <div class="form-row">
                <label class="form-label">Roles</label>
                <div class="tag-input-row">
                    <input type="text" class="form-input" id="adminRoleInput" placeholder="Add role" style="max-width: 260px;">
                    <button class="btn btn-blue btn-small" onclick="addAdminRole()">Add</button>
                </div>
            </div>
            <div class="tag-list" style="margin-top: 10px; width: 100%;">
                ${roles.map(role => `
                    <div class="tag admin-role-tag">
                        <span>${role}</span>
                        <button class="tag-remove" onclick="deleteAdminRole('${role.replace(/'/g, "\\'")}')">Ã—</button>
                    </div>
                `).join('')}
            </div>
        </div>

        <div class="card" style="max-width: 760px; width: 100%;">
            <div class="form-row">
                <label class="form-label">User Access</label>
                <div class="tag-input-row">
                    <input type="text" class="form-input" id="adminUserCapId" placeholder="CAP ID" style="max-width: 180px;">
                    <select class="form-select" id="adminUserRole" style="max-width: 160px;">
                        ${accessRoles.map(r => `<option value="${r}">${r.charAt(0).toUpperCase() + r.slice(1)}</option>`).join('')}
                    </select>
                    <button class="btn btn-blue btn-small" onclick="adminSetUserRole()">Set Role</button>
                </div>
            </div>
            <div class="resource-header status-blue" style="margin-top: 8px;">Signed In</div>
            <div class="resource-list">
                ${signedIn.length ? signedIn.map(entry => {
                    const role = getUserRoleForCapId(entry.capId);
                    const safeId = String(entry.capId).replace(/'/g, "\\'");
                    const selectId = `role-${safeId}`;
                    return `
                        <div class="resource-item">
                            <div class="flex-between" style="align-items:center; gap: 12px;">
                                <div>
                                    <div class="resource-name">${entry.name || 'Unknown'} (CAP ${entry.capId || 'N/A'})</div>
                                    <div class="resource-details">Signed In: ${formatSignedIn(entry.signed_in_at)}</div>
                                </div>
                                <div class="flex gap-2" style="align-items:center;">
                                    <select class="form-select" id="${selectId}" style="max-width: 150px;">
                                        ${accessRoles.map(r => `<option value="${r}" ${r === role ? 'selected' : ''}>${r.charAt(0).toUpperCase() + r.slice(1)}</option>`).join('')}
                                    </select>
                                    <button class="btn btn-outline btn-small" onclick="setUserAccessLevel('${safeId}', document.getElementById('${selectId}').value, '${(entry.name || '').replace(/'/g, "\\'")}')">Apply</button>
                                </div>
                            </div>
                        </div>
                    `;
                }).join('') : '<div class="empty-state-text text-center">No one currently signed in.</div>'}
            </div>
        </div>
    `;
}

function renderNotAuthorized() {
    return `
        <div class="empty-state">
            <div class="empty-state-text">Not authorized.</div>
        </div>
    `;
}

function renderReports() {
    const reportItems = ['Inprocessing', 'Outprocessing', 'Assets', 'Personnel', 'Roster', 'Locations', 'Log'];
    const activeReport = appState.reportView || '';
    return `
        <div class="page-header">
            <div>
                <h2 class="page-title">REPORTS</h2>
                <p class="page-subtitle">Operational summaries and exports.</p>
            </div>
        </div>
        <div class="reports-layout">
            <div class="card reports-list">
                <div class="resource-list">
                    ${reportItems
                        .map(item => `
                            <button class="resource-item report-item ${activeReport === item ? 'active' : ''}" onclick="setReportView('${item}')">
                                ${item}
                            </button>
                        `)
                        .join('')}
                </div>
            </div>
            ${activeReport ? `
                <div class="card reports-detail">
                    <div class="reports-detail-header">
                        <div>
                            <div class="resource-name">${activeReport} Report</div>
                            <div class="resource-details">Generated ${formatSignedIn(new Date().toISOString())}</div>
                        </div>
                        <div class="flex gap-2" style="align-items:center;">
                            <button class="btn btn-outline btn-small btn-icon" onclick="downloadReportCsv('${activeReport}')">
                                <svg viewBox="0 0 24 24" aria-hidden="true" class="icon">
                                    <path d="M12 3v10l3-3 1.4 1.4L12 16.8 7.6 11.4 9 10l3 3V3h0zM4 19h16v2H4v-2z" fill="currentColor"></path>
                                </svg>
                                CSV
                            </button>
                            <button class="btn btn-outline btn-small btn-icon" onclick="printReport('${activeReport}')">
                                <svg viewBox="0 0 24 24" aria-hidden="true" class="icon">
                                    <path d="M6 7V3h12v4H6zm12 10v4H6v-4h12zm2-8a3 3 0 0 1 3 3v5h-3v-3H4v3H1v-5a3 3 0 0 1 3-3h16zm-4 0H8v4h8V9z" fill="currentColor"></path>
                                </svg>
                                Print
                            </button>
                        </div>
                    </div>
                    <div class="report-box">
                        <pre>${escapeReportText(getReportText(activeReport))}</pre>
                    </div>
                </div>
            ` : `
                <div class="card reports-detail">
                    <div class="empty-state-text text-center">Select a report to preview.</div>
                </div>
            `}
        </div>
    `;
}

function escapeReportText(text) {
    return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}
function renderCommunications() {
    return `
        <div class="page-header">
            <div>
                <h2 class="page-title">COMMUNICATIONS</h2>
                <p class="page-subtitle">Team updates and announcements.</p>
            </div>
        </div>
        <div class="card" style="max-width: 720px;">
            <div class="empty-state-text text-center">Communications center coming soon.</div>
        </div>
    `;
}

function renderSupportTicket() {
    const tickets = Array.isArray(appState.supportTickets) ? appState.supportTickets : [];
    const openTickets = tickets.filter(t => t.status !== 'closed').sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    const closedTickets = tickets.filter(t => t.status === 'closed').sort((a, b) => (b.closed_at || b.created_at || '').localeCompare(a.created_at || ''));
    const renderTicket = (ticket, isClosed) => {
        const who = ticket.name ? `${ticket.name}` : (ticket.cap_id ? `CAP ${ticket.cap_id}` : 'Unknown');
        const rank = ticket.rank ? `${ticket.rank}` : '';
        const cap = ticket.cap_id ? `CAP ${ticket.cap_id}` : '';
        return `
            <div class="ticket-card">
                <div class="ticket-header">
                    <div class="ticket-title">${ticket.subject || 'Support Request'}</div>
                    <div class="ticket-badge ${isClosed ? 'closed' : 'open'}">${isClosed ? 'Closed' : 'Open'}</div>
                </div>
                <div class="ticket-meta-row">
                    ${cap ? `<span>${cap}</span>` : ''}
                    ${who ? `<span>${who}</span>` : ''}
                    ${rank ? `<span>${rank}</span>` : ''}
                </div>
                <div class="ticket-meta-row">
                    <span>Opened: ${formatSignedIn(ticket.created_at)}</span>
                    ${isClosed ? `<span>Closed: ${ticket.closed_at ? formatSignedIn(ticket.closed_at) : '—'}</span>` : ''}
                    ${isClosed ? `<span>Closed By: ${ticket.closed_by || '—'}</span>` : ''}
                </div>
                <div class="ticket-details">${ticket.details || ''}</div>
                ${isClosed ? `<div class="ticket-details ticket-remarks">Remarks: ${ticket.closed_remarks || '—'}</div>` : ''}
                ${isClosed ? '' : `
                    <div class="ticket-actions">
                        <button class="btn btn-outline btn-small" onclick="openResolveSupportTicket('${ticket.id}')">Close Ticket</button>
                    </div>
                `}
            </div>
        `;
    };
    return `
        <div class="page-header">
            <div>
                <h2 class="page-title">SUPPORT TICKET</h2>
                <p class="page-subtitle">Submit and track support requests.</p>
            </div>
        </div>
        <div class="card support-form">
            <div class="support-form-row">
                <div class="support-form-field">
                    <label class="form-label">Subject</label>
                    <input type="text" class="form-input" id="supportTicketSubject" placeholder="Brief summary">
                </div>
                <button class="btn btn-blue support-submit" onclick="addSupportTicketAction()">Submit</button>
            </div>
            <div class="form-row">
                <label class="form-label">Details</label>
                <textarea class="form-textarea" id="supportTicketDetails" placeholder="Describe the request" rows="3"></textarea>
            </div>
        </div>
        <div class="support-grid">
            <div class="card support-column">
                <div class="resource-name">Open Tickets</div>
                <div class="resource-list">
                    ${openTickets.length ? openTickets.map(t => renderTicket(t, false)).join('') : '<div class="empty-state-text text-center">No open tickets.</div>'}
                </div>
            </div>
            <div class="card support-column">
                <div class="resource-name">Closed Tickets</div>
                <div class="resource-list">
                    ${closedTickets.length ? closedTickets.map(t => renderTicket(t, true)).join('') : '<div class="empty-state-text text-center">No closed tickets.</div>'}
                </div>
            </div>
        </div>
    `;
}
function renderLog() {
    const logs = [...(appState.logs || [])].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    return `
        <div class="page-header">
            <div>
                <h2 class="page-title">LOG</h2>
                <p class="page-subtitle">Operational logs and audit trail.</p>
            </div>
            <button class="btn btn-outline btn-small" onclick="clearLogAction()">Clear Log</button>
        </div>
        <div class="card">
            <div class="form-row">
                <label class="form-label">New Log Entry</label>
                <div class="tag-input-row">
                    <input type="text" class="form-input" id="logEntryInput" placeholder="Enter log entry">
                    <button class="btn btn-blue btn-small" onclick="addLogEntryAction()">Add</button>
                </div>
            </div>
            <div class="resource-list">
                ${logs.length ? logs.map(entry => {
                    const isAudit = entry.type === 'audit';
                    const name = entry.lastName ? `${entry.lastName}, ${entry.firstName || ''}` : (entry.name || 'Unknown');
                    const header = isAudit
                        ? `AUDIT • ${entry.action || 'update'} • ${entry.entity_type || 'unknown'}${entry.entity_name ? ` • ${entry.entity_name}` : ''}`
                        : `${name} • CAP ${entry.cap_id || 'N/A'} • ${entry.rank || '—'}`;
                    const details = isAudit
                        ? `<pre class="log-details">${escapeReportText(JSON.stringify(entry.details || {}, null, 2))}</pre>`
                        : `<div class="resource-details">${entry.message || ''}</div>`;
                    return `
                        <div class="resource-item">
                            <div class="resource-name">${header}</div>
                            ${details}
                            <div class="resource-details">${formatSignedIn(entry.created_at)}</div>
                        </div>
                    `;
                }).join('') : '<div class="empty-state-text text-center">No log entries yet.</div>'}
            </div>
        </div>
    `;
}
// ==================== MODAL COMPONENTS ====================

function createModal(title, content, footer = '') {
    return `
        <div class="modal-overlay" onclick="closeModal(event)">
            <div class="modal" onclick="event.stopPropagation()">
                <div class="modal-header">${title}</div>
                <div class="modal-body">${content}</div>
                ${footer ? `<div class="modal-footer">${footer}</div>` : ''}
            </div>
        </div>
    `;
}

function showModal(html) {
    const container = document.getElementById('modalContainer');
    container.innerHTML = html;
}

function closeModal(event) {
    if (event && event.target.className !== 'modal-overlay') return;
    document.getElementById('modalContainer').innerHTML = '';
}

// ==================== LOADING INDICATOR ====================

function showLoading() {
    document.getElementById('loadingIndicator').style.display = 'block';
}

function hideLoading() {
    document.getElementById('loadingIndicator').style.display = 'none';
}




