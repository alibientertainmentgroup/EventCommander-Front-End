// UI Components and Rendering Functions

const ROLE_COLORS = {
    'driver': { bg: 'rgba(59, 130, 246, 0.7)', border: 'rgba(59, 130, 246, 0.95)' },
    'safety officer': { bg: 'rgba(16, 185, 129, 0.7)', border: 'rgba(16, 185, 129, 0.95)' },
    'hso': { bg: 'rgba(245, 158, 11, 0.7)', border: 'rgba(245, 158, 11, 0.95)' },
    'support staff': { bg: 'rgba(139, 92, 246, 0.7)', border: 'rgba(139, 92, 246, 0.95)' },
    'orientation pilot': { bg: 'rgba(14, 116, 144, 0.7)', border: 'rgba(14, 116, 144, 0.95)' },
    // TO is now neutral gray so availability can use red without conflict
    'to': { bg: 'rgba(107, 114, 128, 0.7)', border: 'rgba(107, 114, 128, 0.95)' },
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

    const fmt = (d) =>
        d.toLocaleDateString('en-US', { day: '2-digit', month: 'long', year: 'numeric' });

    if (!start && !end) return 'Dates TBD';
    if (start && !end) {
        return fmt(start);
    }
    if (!start && end) {
        return fmt(end);
    }

    return `${fmt(start)} - ${fmt(end)}`;
}

// ==================== DASHBOARD COMPONENTS ====================

function renderDashboard(events, personnel, assets) {
    if (isPrivileged()) {
        return renderAdminHome(events);
    }
    return renderSchedule(getUserSchedule());
}

function renderStatusIndicator() {
    const pending = appState.pendingCount || 0;
    const text = appState.isOnline ? '🟢 Online' : `🔴 Offline${pending ? ` - ${pending} pending` : ''}`;
    const cls = appState.isOnline ? 'status-online' : 'status-offline';
    const button = pending ? `<button class="btn btn-outline btn-small" style="margin-left:8px;" onclick="syncPendingNow()">Sync Now</button>` : '';
    return `<div id="connectionIndicator" class="${cls}" style="position:fixed; top:12px; right:12px; z-index:9999; padding:6px 10px; border-radius:8px; font-weight:600; background:${appState.isOnline ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)'}; color:${appState.isOnline ? '#16a34a' : '#dc2626'}; display:flex; align-items:center;">${text}${button}</div>`;
}

function renderEventBreadcrumb(event) {
    if (!event) return '';
    return `
        <div class="breadcrumb" style="display:flex; align-items:center; gap:8px; margin:8px 0 12px 0;">
            <button class="btn btn-ghost btn-small" onclick="returnToEvents()">← Events</button>
            <span class="resource-details">/</span>
            <span class="resource-name">${event.title}</span>
        </div>
    `;
}


function renderAdminHome(events) {
    return `
        <div class="page-header">
            <div>
                <h2 class="page-title">SELECT EVENT</h2>
                <p class="page-subtitle">Choose an event to manage or create a new one</p>
            </div>
            <div class="flex gap-2" style="align-items:center;">
                <label class="toggle-row toggle-switch" style="margin:0;">\n                    <input type="checkbox" ${appState.sandboxMode ? 'checked' : ''} onchange="toggleSandboxMode()">\n                    <span class="toggle-track"></span>\n                    <span class="toggle-label">Sandbox Mode</span>\n                </label>
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
                        const totals = getEventActivityTotals(event.id, appState.activities);
                        const personnelFilled = totals.assignedPersonnel >= totals.requiredPersonnel;
                        const assetsFilled = totals.assignedAssets >= totals.requiredAssets;
                        
                        return `
                            <div class="resource-item cursor-pointer" onclick="showEventDetail('${event.id}')">
                                <div class="resource-name">${event.title}</div>
                                <div class="flex gap-2 mt-4">
                                    <span class="badge ${personnelFilled ? 'status-green' : 'status-red'}" style="background: ${personnelFilled ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)'}">
                                        P: ${totals.assignedPersonnel}/${totals.requiredPersonnel}
                                    </span>
                                    <span class="badge ${assetsFilled ? 'status-green' : 'status-red'}" style="background: ${assetsFilled ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)'}">
                                        A: ${totals.assignedAssets}/${totals.requiredAssets}
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
    const filteredEvents = appState.showEventsWithNeeds
        ? events.filter(event => {
            const totals = getEventActivityTotals(event.id, appState.activities || []);
            const personnelNeed = totals.requiredPersonnel > 0 && totals.assignedPersonnel < totals.requiredPersonnel;
            const assetNeed = totals.requiredAssets > 0 && totals.assignedAssets < totals.requiredAssets;
            return personnelNeed || assetNeed;
        })
        : events;
    return `
        <div class="page-header">
            <div>
                <h2 class="page-title">EVENTS</h2>
            </div>
            <div class="flex gap-2" style="align-items:center;">
                <label class="toggle-row toggle-switch" style="margin:0;">\n                    <input type="checkbox" ${appState.sandboxMode ? 'checked' : ''} onchange="toggleSandboxMode()">\n                    <span class="toggle-track"></span>\n                    <span class="toggle-label">Sandbox Mode</span>\n                </label>
                <button class="btn btn-outline" onclick="toggleEventsWithNeeds()">
                    ${appState.showEventsWithNeeds ? 'Show All Events' : 'Show Events With Needs'}
                </button>
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
            ${filteredEvents.map(event => renderEventCard(event)).join('')}
        </div>

        ${filteredEvents.length === 0 ? `
            <div class="empty-state">
                <div class="empty-state-icon">??</div>
                <div class="empty-state-text">${appState.showEventsWithNeeds ? 'No events with open needs' : 'No events yet'}</div>
            </div>
        ` : ''}
    `;
}

// ==================== INPROCESSING COMPONENTS ====================

function renderInprocessing(events, personnel, stations, checkins) {
    const profileHtml = (typeof appState !== 'undefined' && appState.inprocessProfile) ? renderInprocessingProfile(appState.inprocessProfile) : '';
    const activeEntry = (typeof getActiveRosterEntry === 'function') ? getActiveRosterEntry() : null;
    const stationsHtml = (typeof appState !== 'undefined' && appState.inprocessProfile && activeEntry)
        ? renderInprocessingStationsForProfile(stations || [], appState.inprocessProfile, checkins || [])
        : '';

    const approvalWarning = appState.approvalWarning ? `
        <div class="warning-banner" style="background: rgba(255,165,0,0.1); border:1px solid rgba(255,165,0,0.6); padding:12px; margin-top:12px;">
            <div class="resource-name">⚠️ APPROVAL MISSING</div>
            <div class="resource-details">Unit Approved: ${appState.approvalWarning.unitApproved || 'N/A'}</div>
            <div class="resource-details">Parent Approved: ${appState.approvalWarning.parentApproved || 'N/A'}</div>
            <div class="flex gap-2" style="margin-top:8px;">
                <button class="btn btn-blue btn-small" onclick="proceedApprovalBypass()">Proceed Anyway</button>
                <button class="btn btn-outline btn-small" onclick="cancelApprovalBypass()">Cancel</button>
            </div>
        </div>
    ` : '';

    const manualPrompt = appState.inprocessMissingCapId && !appState.manualEntryOpen ? `
        <div class="card" style="margin-top:12px;">
            <div class="resource-name">CAP ID not found in registration.</div>
            <div class="resource-details">Add manually?</div>
            <button class="btn btn-blue btn-small" style="margin-top:8px;" onclick="openManualEntry()">Add Person</button>
        </div>
    ` : '';

    const manualForm = appState.manualEntryOpen ? `
        <div class="card" style="margin-top:12px;">
            <div class="resource-name">Add Person Manually</div>
            <form onsubmit="saveManualEntry(event)">
                <div class="form-row"><label class="form-label">CAP ID</label><input id="manualCapId" class="form-input" value="${appState.inprocessMissingCapId || ''}" required></div>
                <div class="form-row"><label class="form-label">Full Name</label><input id="manualFullName" class="form-input" required></div>
                <div class="form-row"><label class="form-label">Rank</label><input id="manualRank" class="form-input"></div>
                <div class="form-row"><label class="form-label">Member Type</label>
                    <select id="manualMemberType" class="form-select">
                        <option value="Cadet">Cadet</option>
                        <option value="Senior">Senior</option>
                    </select>
                </div>
                <div class="form-row"><label class="form-label">Shirt Size</label><input id="manualShirtSize" class="form-input"></div>
                <div class="form-row"><label class="form-label">Cell Phone</label><input id="manualCellPhone" class="form-input"></div>
                <div class="form-row"><label class="form-label">Emergency Contact Name</label><input id="manualEmergName" class="form-input"></div>
                <div class="form-row"><label class="form-label">Emergency Contact Phone</label><input id="manualEmergPhone" class="form-input"></div>
                <div class="form-row"><label class="form-label">Email</label><input id="manualEmail" class="form-input"></div>
                <div class="form-row flex gap-2">
                    <button class="btn btn-blue" type="submit">Save</button>
                    <button class="btn btn-outline" type="button" onclick="cancelManualEntry()">Cancel</button>
                </div>
            </form>
        </div>
    ` : '';

    const hasProfile = !!appState.inprocessProfile;
    const checkinLabel = hasProfile ? 'Sign In' : 'Lookup / Sign In';
    const checkinCard = `
        <div class="card" style="margin-bottom:16px;">
            <div class="resource-name">Check In</div>
            <div class="resource-details">${appState.selectedEvent ? appState.selectedEvent.title : ''}</div>
            <div class="tag-input-row">
                <input type="text" class="form-input cap-id-input" id="inprocessCapId" placeholder="Enter CAP ID" maxlength="6" inputmode="numeric">
                ${!activeEntry ? `<button class="btn btn-blue" onclick="handleInprocessAction()">${checkinLabel}</button>` : `<div class="resource-details" style="font-weight:600;">Already signed in</div>`}
                <button class="btn btn-outline btn-small" onclick="nextInprocessPerson()">Next Person</button>
            </div>
            <div class="form-row" style="margin-top:8px;">
                <label class="form-label" style="display:flex; align-items:center; gap:6px;">
                    <input type="checkbox" id="staffOverride">
                    Mark as Staff
                </label>
            </div>
            ${appState.inprocessMessage ? `<div class="resource-details" style="margin-top:8px;">${appState.inprocessMessage}</div>` : ''}
        </div>
    `;

    return `
        <div class="page-header">
            <h2 class="page-title">INPROCESSING</h2>
        </div>

        ${checkinCard}

        ${stationsHtml ? `<div id="inprocessingStationsContainer">${stationsHtml}</div>` : ''}

        ${profileHtml}
        ${approvalWarning}
        ${manualPrompt}
        ${manualForm}
    `;
}

function renderInprocessingStations(stations, personnel, checkins) {
    return ''; // old station/personnel list no longer used
}

function renderInprocessingStationsForProfile(stations, profile, checkins) {
    const stationList = Array.isArray(stations) ? [...stations] : [];
    if (stationList.length) {
        const hasComplete = stationList.some(s => (s.name || '').toLowerCase() === 'complete inprocessing');
        if (!hasComplete) {
            stationList.push({
                name: 'Complete Inprocessing',
                description: 'Finish once all stations are complete and flags resolved',
                station_order: 9999
            });
        }
    }
    if (!stationList.length) {
        return '';
    }
    const selected = appState.inprocessStation;
    const stationLookup = profile.stations || {};

    return `
        <div class="space-y-4">
            <div class="flex gap-2" style="flex-wrap: wrap; margin-bottom:8px;">
                ${stationList.map(station => {
                    const status = stationLookup[station.name]?.status || 'pending';
                    const flagged = stationLookup[station.name]?.flagged;
                    const badge = status === 'complete' ? '✓' : status === 'in_progress' ? '…' : '';
                    const flagMark = flagged ? '⚑' : '';
                    // Priority: flagged (red) > complete (green) > selected (blue) > default
                    let btnClass = 'btn-outline';
                    if (flagged) btnClass = 'btn-red';
                    else if (status === 'complete') btnClass = 'btn-green';
                    else if (selected === station.name) btnClass = 'btn-blue';
                    const extraStyle = btnClass === 'btn-red'
                        ? 'background:#dc2626;border-color:#dc2626;'
                        : btnClass === 'btn-green'
                            ? 'background:#16a34a;border-color:#16a34a;'
                            : '';
                    return `<button class="btn ${btnClass}" style="min-width:260px; padding:14px 20px; font-size:16px; flex:0 0 auto; display:inline-flex; align-items:center; justify-content:center; width:auto;${extraStyle}" onclick="setInprocessStation('${station.name.replace(/'/g, "\\'")}')">${station.name} ${badge} ${flagMark}</button>`;
                }).join('')}
            </div>
            ${selected ? (() => {
                const station = stationList.find(s => s.name === selected);
                const note = stationLookup[selected]?.comment || '';
                return `
                    <div class="card">
                        <div class="resource-name">${selected}</div>
                        <div class="resource-details">${station ? station.description || '' : ''}</div>
                        <div class="form-row" style="margin-top:12px;">
                            <label class="form-label">Comment</label>
                            <textarea class="form-textarea" id="stationComment" placeholder="Add a note (optional)">${note || ''}</textarea>
                        </div>
                        <div class="flex gap-2" style="margin-top:12px;">
                            <button class="btn btn-blue" onclick="completeStation()">Complete</button>
                            <button class="btn btn-outline" onclick="saveFlagFromComment()">Flag</button>
                        </div>
                    </div>
                `;
            })() : ''}
            ${(profile.flags || []).length ? `
                <div class="card">
                    <div class="resource-name">Flags</div>
                    <div class="resource-list">
                        ${(profile.flags || []).map((f, idx) => `
                            <div class="resource-item">
                                <div class="resource-name">${f.station || 'Station'}</div>
                                <div class="resource-details">${f.reason || ''}</div>
                                ${f.owner ? `<div class="resource-details">Owner: ${f.owner}</div>` : ''}
                                ${f.created_at ? `<div class="resource-details">${new Date(f.created_at).toLocaleString()}</div>` : ''}
                                ${f.resolved ? `<div class="badge status-green">Resolved</div>` : `
                                    <div class="flex gap-2" style="margin-top:8px;">
                                        <button class="btn btn-blue btn-small" onclick="resolveFlagInline(${idx})">Mark Resolved</button>
                                    </div>
                                `}
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}
        </div>
    `;
}

function renderOutprocessing() {
    const activeProfile = appState.outprocessProfile || null;
    const activeCapId = activeProfile ? (typeof normalizeCapId === 'function' ? normalizeCapId(activeProfile.capId) : String(activeProfile.capId || '').trim()) : '';
    const activeEntry = activeCapId
        ? appState.roster.find(r => {
            const rosterCap = typeof normalizeCapId === 'function'
                ? normalizeCapId(r.cap_id || r.capId)
                : String(r.cap_id || r.capId || '').trim();
            return rosterCap === activeCapId && !r.signed_out_at;
        })
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
                    <input type="text" class="form-input cap-id-input" id="outprocessCapId" placeholder="Enter CAP ID" maxlength="6" inputmode="numeric" onkeydown="if(event.key==='Enter'){lookupOutprocessingCadet();}" oninput="if(this.value.length>=6){lookupOutprocessingCadet();}">
                    <button class="btn btn-blue" onclick="lookupOutprocessingCadet()">Lookup</button>
                    <button class="btn btn-outline btn-small" onclick="nextInprocessPerson()">Next Person</button>
                </div>
            </div>
            <div class="form-row" style="display:flex; gap:12px; flex-wrap: wrap;">
                ${activeProfile && activeEntry ? `<button class="btn btn-outline" onclick="signOutInprocessing()">Sign Out</button>` : ''}
                ${activeProfile && !activeEntry ? `<div class="resource-details">Not currently signed in.</div>` : ''}
            </div>
            <div id="inprocessResult" class="resource-details">
                ${activeProfile ? renderInprocessingProfile(activeProfile) : (appState.outprocessMessage || '')}
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
                        <th>Status</th>
                        <th>Role</th>
                        <th>Sign In</th>
                        <th>Sign Out</th>
                    </tr>
                </thead>
                <tbody>
                    ${sorted.length ? sorted.map(r => `
                        <tr class="roster-line" onclick="openRosterProfile('${r.id}')">
                            <td>${r.lastName ? `${r.lastName}${r.firstName ? ` ${r.firstName}` : ''}` : (r.name || 'Unknown')}</td>
                            <td>${r.rank || '—'}</td>
                            <td>${r.capId || r.cap_id || 'N/A'}</td>
                            <td>${r.signed_out_at ? 'Signed Out' : 'Signed In'}</td>
                            <td>${(r.role || '').toLowerCase() === 'staff' ? 'Staff' : 'Student'}</td>
                            <td>${formatSignedIn(r.signed_in_at)}</td>
                            <td>${r.signed_out_at ? formatSignedIn(r.signed_out_at) : ''}</td>
                        </tr>
                    `).join('') : '<tr><td class="empty-state-text text-center" colspan="7">No roster entries yet</td></tr>'}
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
                                <div class="resource-name">${item.title}${item.role ? ` • ${item.role}` : ''}${item.stayAtLocation ? ` • <span class="stay-label">Remain Onsite</span>` : ''}</div>
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
    return ` • <span class="stay-label">Remain Onsite</span>`;
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
            <div class="flex-between">
                <h3 class="event-title">${event.title}</h3>
                <button class="btn btn-outline btn-small" style="padding:4px 8px;" onclick="event.stopPropagation(); openEventEdit('${event.id}')">
                    ✏️
                </button>
            </div>
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
    return renderTimelineView('ASSETS & VEHICLES', assets, activities, selectedDate, 'assets');
}

function renderPersonnel(personnel, activities, selectedDate) {
    return renderTimelineView('PERSONNEL & ASSIGNMENTS', personnel, activities, selectedDate, 'personnel');
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
                    ADD ASSET/VEHICLE
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
        !r.signed_out_at && String(r.cap_id || r.capId || '') === String(row.cap_id || '')
    );
    const statusClass = type === 'personnel' ? (signedIn ? 'status-blue' : 'status-red') : '';
    return `
        <div class="timeline-row">
            <div class="timeline-row-label timeline-clickable ${statusClass}" onclick="${isPrivileged() ? (type === 'assets' ? `openAssetModal('${row.id}')` : `openPersonnelModal('${row.id}')`) : ''}">${type === 'assets' ? `${row.name || row.type || 'Asset'}${row.details ? ' — ' + row.details : ''}` : row.name}</div>
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
    const available = buildAvailableWindows(availability, dayStart, dayEnd);
    available.forEach(block => {
        const left = Math.max(0, (block.start - dayStart) / total * 100);
        const width = Math.max(1, (block.end - block.start) / total * 100);
        bars.push(`<div class="timeline-bar timeline-bar-unavailable" style="left:${left}%;width:${width}%;" title="Available"></div>`);
    });

    activities.forEach(activity => {
        const list = type === 'assets' ? (activity.assigned_assets || []) : (activity.assigned_personnel || []);
        let entries = normalizeAssignmentEntries(list, type).filter(e => e.id === String(resource.id));
        // Only show assets on the timeline when they are actually assigned with time + operator,
        // not merely listed as required.
        if (type === 'assets') {
            entries = entries.filter(e =>
                e.operator_id &&
                e.assignment_start_time &&
                e.assignment_end_time
            );
        }
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
            const title = entry.stay_at_location ? `${label} • Remain Onsite` : label;
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

function buildAvailableWindows(availability, dayStart, dayEnd) {
    if (!availability.length) return [];
    return availability
        .map(a => ({
            start: a.start.getHours() * 60 + a.start.getMinutes(),
            end: a.end.getHours() * 60 + a.end.getMinutes()
        }))
        .filter(w => w.end > w.start)
        .map(w => ({
            start: Math.max(dayStart, w.start),
            end: Math.min(dayEnd, w.end)
        }))
        .filter(w => w.end > w.start);
}

// ==================== ADMIN PANEL ====================

function renderAdminPanel() {
    const roles = getSupportRoles();
    const accessRoles = ['user', 'staff', 'admin'];
    const signedIn = appState.roster.filter(r => !r.signed_out_at);
    const eventLabel = appState.selectedEvent ? appState.selectedEvent.title : 'Select an event';
    let activeTab = appState.adminTab || 'roles';

    const tabs = [
        { id: 'roles', label: 'Roles' },
        { id: 'stations', label: 'Stations' },
        { id: 'user', label: 'User Access' },
        { id: 'signed', label: 'Signed In' },
        { id: 'uploads', label: 'Upload Data' },
        { id: 'billeting', label: 'Billeting' },
        { id: 'orgchart', label: 'Org Chart' },
    ];

    const tabsHtml = `
        <div class="admin-tabs" style="display:flex; gap:10px; margin:12px 0 16px 0; flex-wrap: wrap;">
            ${tabs.map(t => `
                <button class="btn btn-outline btn-small admin-tab-btn ${activeTab === t.id ? 'active' : ''}"
                    style="flex:0 0 auto;"
                    onclick="setAdminTab('${t.id}')">
                    ${t.label}
                </button>
            `).join('')}
        </div>
    `;

    const rolesSection = `
        <div class="card" style="max-width: 520px; width: 100%; margin-top: 12px;">
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
                        <button class="tag-remove" title="Remove role" aria-label="Remove role" onclick="deleteAdminRole('${role.replace(/'/g, "\\'")}')">&times;</button>
                    </div>
                `).join('')}
            </div>
        </div>
    `;

    const usersList = (appState.users || []).slice().sort((a, b) => String(a.cap_id || '').localeCompare(String(b.cap_id || '')));
    const usersListHtml = usersList.length ? usersList.map(u => `
        <div class="resource-item">
            <div class="flex-between" style="align-items:center; gap: 12px;">
                <div>
                    <div class="resource-name">${u.name || 'Unknown'} (CAP ${u.cap_id || 'N/A'})</div>
                    <div class="resource-details">Access: ${u.role || 'user'}</div>
                </div>
                <div class="flex gap-2" style="align-items:center;">
                    <div class="resource-details">${u.updated_at ? new Date(u.updated_at).toLocaleString() : ''}</div>
                    <button class="btn btn-outline btn-small" onclick="removeUserAccess('${String(u.cap_id).replace(/'/g, "\\'")}')">Remove</button>
                </div>
            </div>
        </div>
    `).join('') : '<div class="empty-state-text text-center">No users found.</div>';

    const userAccessSection = `
        <div class="card" style="max-width: 760px; width: 100%; margin-bottom: 16px;">
            <div class="flex-between" style="align-items:center; gap: 12px;">
                <div class="form-label">User Access</div>
                <button class="btn btn-blue btn-small" onclick="openAddUserModal()">Add User</button>
            </div>
            <div class="resource-list" style="margin-top: 12px;">
                ${usersListHtml}
            </div>
        </div>
    `;

    const signedInSection = `
        <div class="card" style="max-width: 760px; width: 100%; margin-bottom: 16px;">
            <div class="resource-header status-blue" style="margin-top: 8px;">Signed In (Current Event)</div>
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

    const uploadsSection = `
        <div class="card" style="margin-top:16px;">
            <div class="flex-between mb-2">
                <h3 class="page-subtitle">UPLOAD REGISTRATIONS</h3>
                <div class="resource-details" id="registrationUploadStatus"></div>
            </div>
            <div class="form-row">
                <label class="form-label">.xlsx File</label>
                <input type="file" class="form-input" id="registrationUploadFile" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet">
            </div>
            <div class="form-row">
                <button class="btn btn-blue btn-small" onclick="handleRegistrationUpload()">Upload</button>
            </div>
            <div class="resource-details" id="registrationUploadMessage"></div>
        </div>

        <div class="card" style="margin-top:16px;">
            <div class="flex-between mb-2">
                <h3 class="page-subtitle">UPLOAD ACCOMMODATIONS</h3>
                <div class="resource-details" id="accommodationsUploadStatus"></div>
            </div>
            <div class="form-row">
                <label class="form-label">.xlsx File</label>
                <input type="file" class="form-input" id="accommodationsUploadFile" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet">
            </div>
            <div class="form-row">
                <button class="btn btn-blue btn-small" onclick="handleAccommodationsUpload()">Upload</button>
            </div>
            <div class="resource-details" id="accommodationsUploadMessage"></div>
        </div>

        <div class="card" style="margin-top:16px;">
            <div class="flex-between mb-2">
                <h3 class="page-subtitle">UPLOAD ALLERGIES</h3>
                <div class="resource-details" id="allergiesUploadStatus"></div>
            </div>
            <div class="form-row">
                <label class="form-label">.xlsx File</label>
                <input type="file" class="form-input" id="allergiesUploadFile" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet">
            </div>
            <div class="form-row">
                <button class="btn btn-blue btn-small" onclick="handleAllergiesUpload()">Upload</button>
            </div>
            <div class="resource-details" id="allergiesUploadMessage"></div>
        </div>
    `;
    const stationsSection = `
        <div class="card" style="max-width: 860px; width: 100%; margin-bottom: 16px;">
            <div class="flex-between" style="align-items:center; gap: 12px;">
                <div class="form-label">Inprocessing Stations</div>
                <button class="btn btn-blue btn-small" onclick="openStationModal()">+ Add Station</button>
            </div>
            <div id="adminStationsList" class="resource-list" style="margin-top: 12px;">
                <div class="empty-state-text text-center">Loading stations...</div>
            </div>
        </div>
    `;

    let body = '';
    switch (activeTab) {
        case 'roles':
            body = rolesSection;
            break;
        case 'stations':
            body = stationsSection;
            break;
        case 'user':
            body = userAccessSection;
            break;
        case 'signed':
            body = signedInSection;
            break;
        case 'uploads':
            body = uploadsSection;
            break;
        case 'billeting':
            body = renderBilletingAdmin();
            break;
        case 'orgchart':
            body = renderOrgChartAdmin();
            break;
        default:
            body = rolesSection;
    }

    return `
        <div class="page-header">
            <div>
                <h2 class="page-title">ADMIN</h2>
                <p class="page-subtitle">${eventLabel}</p>
            </div>
        </div>

        ${tabsHtml}
        ${body}
    `;
}

function renderAddUserModal() {
    return createModal('ADD USER', `
        <div class="form-row">
            <label class="form-label">Name</label>
            <input type="text" class="form-input" id="newUserName" placeholder="Full name" required>
        </div>
        <div class="form-row">
            <label class="form-label">CAP ID</label>
            <input type="text" class="form-input" id="newUserCapId" placeholder="CAP ID" maxlength="10" required>
        </div>
        <div class="form-row">
            <label class="form-label">PIN (8 digits)</label>
            <input type="password" class="form-input" id="newUserPin" placeholder="8-digit PIN" maxlength="8" minlength="8" inputmode="numeric" pattern="[0-9]{8}" required>
        </div>
        <div class="form-row">
            <label class="form-label">Confirm PIN</label>
            <input type="password" class="form-input" id="newUserPinConfirm" placeholder="Confirm PIN" maxlength="8" minlength="8" inputmode="numeric" pattern="[0-9]{8}" required>
        </div>
        <div class="form-row">
            <label class="form-label">Role</label>
            <select class="form-select" id="newUserRole" required>
                <option value="admin">Admin</option>
                <option value="user">User</option>
            </select>
        </div>
        <div class="resource-details" id="newUserError" style="color:#f87171;margin-top:8px;"></div>
    `, `
        <button class="btn btn-blue" onclick="submitAddUser()">Create User</button>
        <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
    `);
}

// ============ Billeting Admin ============
function renderBilletingAdmin() {
    const event = appState.selectedEvent;
    if (!event) {
        return `
            <div class="card">
                <div class="resource-details">Select an event to manage billeting.</div>
            </div>
        `;
    }
    const buildings = appState.billetingBuildings || [];
    const floorsByBuilding = appState.billetingFloors || {};
    const roomsByFloor = appState.billetingRooms || {};

    const buildingList = buildings.length ? buildings.map(b => {
        const floors = floorsByBuilding[b.id] || [];
        const totalRooms = floors.reduce((sum, f) => sum + ((roomsByFloor[f.id] || []).length), 0);
        const buildingExpanded = isBilletingBuildingExpanded(b.id);
        return `
            <div class="resource-item">
                <div class="flex-between" style="align-items:center; gap:12px;">
                    <div>
                        <div class="resource-name">${b.name} (${(b.gender_restriction || 'mixed').toUpperCase()})</div>
                        <div class="resource-details">${floors.length} floor${floors.length === 1 ? '' : 's'}, ${totalRooms} room${totalRooms === 1 ? '' : 's'}</div>
                    </div>
                    <div class="flex gap-2" style="align-items:center;">
                        <button class="btn btn-outline btn-small" onclick="toggleBilletingBuilding('${b.id}')">${buildingExpanded ? 'Collapse' : 'Expand'}</button>
                        <button class="btn btn-outline btn-small" onclick="openAddFloorModal('${b.id}', '${b.name.replace(/'/g, "\\'")}')">+ Add Floor</button>
                        <button class="btn btn-outline btn-small" onclick="editBuildingModal('${b.id}')">Edit</button>
                        <button class="btn btn-ghost btn-small" onclick="confirmDeleteBuilding('${b.id}')">Delete</button>
                    </div>
                </div>
                ${buildingExpanded ? renderBilletingFloorsList(b, floors, roomsByFloor) : ''}
            </div>
        `;
    }).join('') : '<div class="empty-state-text text-center">No buildings yet.</div>';

    return `
        <div class="flex-between mb-4">
            <h3 class="page-subtitle">Billeting Layout</h3>
            <button class="btn btn-blue btn-small" onclick="openAddBuildingModal()">+ Add Building</button>
        </div>
        <div class="resource-list">
            ${buildingList}
        </div>
    `;
}

function renderBilletingFloorsList(building, floors, roomsByFloor) {
    if (!floors.length) return '';
    const floorsHtml = floors.map(f => {
        const rooms = roomsByFloor[f.id] || [];
        const floorExpanded = isBilletingFloorExpanded(f.id);
        return `
            <div class="resource-item" style="margin-top:10px;">
                <div class="flex-between" style="align-items:center; gap:12px;">
                    <div>
                        <div class="resource-name">Floor ${f.floor_number}</div>
                        <div class="resource-details">${rooms.length} room${rooms.length === 1 ? '' : 's'}</div>
                    </div>
                    <div class="flex gap-2">
                        <button class="btn btn-outline btn-small" onclick="toggleBilletingFloor('${f.id}')">${floorExpanded ? 'Collapse' : 'Expand'}</button>
                        <button class="btn btn-outline btn-small" onclick="openAddRoomsModal('${f.id}', '${f.floor_number.replace(/'/g, "\\'")}', '${building.id}', '${building.name.replace(/'/g, "\\'")}')">+ Add Rooms</button>
                    </div>
                </div>
                ${floorExpanded ? renderBilletingRoomsList(building, f, rooms) : ''}
            </div>
        `;
    }).join('');
    return `<div class="resource-list" style="margin-top:10px;">${floorsHtml}</div>`;
}

function renderBilletingRoomsList(building, floor, rooms) {
    if (!rooms.length) return '<div class="resource-details" style="margin-top:6px;">No rooms on this floor.</div>';
    const roomsHtml = rooms.map(r => {
        return `
            <div class="resource-item" style="margin-top:8px;">
                <div class="flex-between" style="align-items:center; gap:12px;">
                    <div>
                        <div class="resource-name">Room ${r.room_number} (${r.bunk_capacity} bunks)</div>
                        <div class="resource-details">Layout only</div>
                    </div>
                    <div class="flex gap-2">
                        <button class="btn btn-ghost btn-small" onclick="confirmDeleteRoom('${r.id}')">Delete</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    return `<div class="resource-list" style="margin-top:8px;">${roomsHtml}</div>`;
}

function renderBilletingPlanning() {
    const event = appState.selectedEvent;
    if (!event) {
        return `
            <div class="card">
                <div class="resource-details">Select an event to plan billeting assignments.</div>
            </div>
        `;
    }
    const buildings = appState.billetingBuildings || [];
    const floorsByBuilding = appState.billetingFloors || {};
    const roomsByFloor = appState.billetingRooms || {};

    const buildingList = buildings.length ? buildings.map(b => {
        const floors = floorsByBuilding[b.id] || [];
        const totalRooms = floors.reduce((sum, f) => sum + ((roomsByFloor[f.id] || []).length), 0);
        const totalAssigned = floors.reduce((sum, f) => {
            const rooms = roomsByFloor[f.id] || [];
            return sum + rooms.reduce((roomSum, r) => roomSum + ((appState.billetingAssignmentsByRoom?.[r.id] || []).length), 0);
        }, 0);
        const buildingExpanded = isBilletingBuildingExpanded(b.id);
        return `
            <div class="resource-item">
                <div class="flex-between" style="align-items:center; gap:12px;">
                    <div>
                        <div class="resource-name">${b.name} (${(b.gender_restriction || 'mixed').toUpperCase()})</div>
                        <div class="resource-details">${floors.length} floor${floors.length === 1 ? '' : 's'}, ${totalRooms} room${totalRooms === 1 ? '' : 's'}, ${totalAssigned} assigned</div>
                    </div>
                    <div class="flex gap-2">
                        <button class="btn btn-outline btn-small" onclick="toggleBilletingBuilding('${b.id}')">${buildingExpanded ? 'Collapse' : 'Expand'}</button>
                    </div>
                </div>
                ${buildingExpanded ? renderBilletingPlanningFloorsList(b, floors, roomsByFloor) : ''}
            </div>
        `;
    }).join('') : '<div class="empty-state-text text-center">No billeting layout is defined yet.</div>';

    return `
        <div class="page-header">
            <div>
                <h2 class="page-title">BILLETING PLANNING</h2>
                <p class="page-subtitle">${event.title}</p>
            </div>
        </div>
        <div class="resource-list">
            ${buildingList}
        </div>
    `;
}

function renderBilletingPlanningFloorsList(building, floors, roomsByFloor) {
    if (!floors.length) return '';
    const floorsHtml = floors.map(f => {
        const rooms = roomsByFloor[f.id] || [];
        const floorExpanded = isBilletingFloorExpanded(f.id);
        return `
            <div class="resource-item" style="margin-top:10px;">
                <div class="flex-between" style="align-items:center; gap:12px;">
                    <div>
                        <div class="resource-name">Floor ${f.floor_number}</div>
                        <div class="resource-details">${rooms.length} room${rooms.length === 1 ? '' : 's'}</div>
                    </div>
                    <div class="flex gap-2">
                        <button class="btn btn-outline btn-small" onclick="toggleBilletingFloor('${f.id}')">${floorExpanded ? 'Collapse' : 'Expand'}</button>
                    </div>
                </div>
                ${floorExpanded ? renderBilletingPlanningRoomsList(building, f, rooms) : ''}
            </div>
        `;
    }).join('');
    return `<div class="resource-list" style="margin-top:10px;">${floorsHtml}</div>`;
}

function renderBilletingPlanningRoomsList(building, floor, rooms) {
    if (!rooms.length) return '<div class="resource-details" style="margin-top:6px;">No rooms on this floor.</div>';
    const roomsHtml = rooms.map(r => {
        const assignments = (appState.billetingAssignmentsByRoom?.[r.id] || []);
        const assignedCount = assignments.length;
        const capacity = Number(r.bunk_capacity || 0);
        const normalize = (value) => {
            if (typeof normalizeCapId === 'function') return normalizeCapId(value);
            return String(value || '').trim();
        };
        const occupants = assignments
            .map(a => {
                const cap = normalize(a.cap_id);
                const rosterEntry = (appState.roster || []).find(x => normalize(x.cap_id) === cap);
                const name = (rosterEntry?.full_name || rosterEntry?.name || '').trim();
                const rank = (rosterEntry?.rank || '').trim();
                if (rank && name) return `${rank} ${name} (CAP ${cap || a.cap_id || ''})`;
                if (name) return `${name} (CAP ${cap || a.cap_id || ''})`;
                return `CAP ${cap || a.cap_id || ''}`.trim();
            })
            .filter(Boolean);
        const occupantsHtml = occupants.length
            ? `<div style="display:flex; flex-wrap:wrap; gap:6px; margin-top:4px;">${occupants.map(label => `<span class="resource-details" style="font-size:12px; line-height:1.2; padding:2px 8px; border:1px solid rgba(120,170,240,0.35); border-radius:999px; background:rgba(120,170,240,0.08);">${label}</span>`).join('')}</div>`
            : `<div class="resource-details" style="font-size:12px; line-height:1.35; margin-top:2px;">No occupants yet</div>`;
        return `
            <div class="resource-item" style="margin-top:8px;">
                <div class="flex-between" style="align-items:center; gap:12px;">
                    <div>
                        <div class="resource-name">Room ${r.room_number} (${capacity} bunks)</div>
                        <div class="resource-details">${assignedCount}/${capacity} assigned</div>
                        ${occupantsHtml}
                    </div>
                    <div class="flex gap-2">
                        <button class="btn btn-outline btn-small" onclick="openAssignBunksModal('${building.id}', '${floor.id}', '${r.id}', '${building.name.replace(/'/g, "\\'")}', '${floor.floor_number.replace(/'/g, "\\'")}', '${r.room_number.replace(/'/g, "\\'")}')">View/Assign</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    return `<div class="resource-list" style="margin-top:8px;">${roomsHtml}</div>`;
}

function renderOrgChartAdmin() {
    return renderOrgChartView(true);
}

function renderOrgChartHTML(positions) {
    const rows = Array.isArray(positions) ? positions : [];

    const esc = (v) =>
        String(v ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');

    const keyOf = (p) => String(p?.cap_id ?? '').trim();
    const parentKeyOf = (p) => (p?.reports_to_cap_id == null ? '' : String(p.reports_to_cap_id).trim());

    const labelOf = (p) => {
        const title = String(p?.position_title ?? '').trim();
        const name = String(p?.person_name ?? '').trim();
        if (title && name) return `${title} - ${name}`;
        return title || name || 'Unassigned';
    };
    const detailsOf = (p) => {
        const callsign = String(p?.callsign ?? '').trim();
        const phone = String(p?.phone ?? '').trim();
        const email = String(p?.email ?? '').trim();
        const parts = [];
        if (callsign) parts.push(`Callsign: ${callsign}`);
        if (phone) parts.push(`Phone: ${phone}`);
        if (email) parts.push(`Email: ${email}`);
        return parts;
    };
    const cardHtml = (p) => {
        const details = detailsOf(p);
        return `
            <div class="org-card-title">${esc(labelOf(p))}</div>
            ${details.length ? `<div class="org-card-details">${details.map(d => `<div>${esc(d)}</div>`).join('')}</div>` : ''}
        `;
    };

    const byParent = new Map();
    const byId = new Map();
    for (const row of rows) {
        const id = keyOf(row);
        if (!id) continue;
        byId.set(id, row);
        const parent = parentKeyOf(row);
        if (!byParent.has(parent)) byParent.set(parent, []);
        byParent.get(parent).push(row);
    }

    const roots = rows.filter((row) => {
        const id = keyOf(row);
        if (!id) return false;
        const parent = parentKeyOf(row);
        return !parent || !byId.has(parent);
    });

    function renderNode(node, isRoot = false) {
        const id = keyOf(node);
        const children = byParent.get(id) || [];
        const hasChildren = children.length > 0;

        if (!isRoot && !hasChildren) {
            return `<div class="org-card">${cardHtml(node)}</div>`;
        }

        let html = `<div class="org-node">`;
        html += `<div class="org-card">${cardHtml(node)}</div>`;

        if (hasChildren) {
            html += `<div class="org-line-down"></div>`;
            html += `<div class="org-children">`;
            html += `<div class="org-children-row">`;

            for (const child of children) {
                html += `<div class="org-child">`;
                html += `<div class="org-line-stub"></div>`;
                html += renderNode(child, false);
                html += `</div>`;
            }

            html += `</div>`;
            html += `</div>`;
        }

        html += `</div>`;
        return html;
    }

    return `
        <div class="org-chart-container">
            ${roots.map((root) => renderNode(root, true)).join('')}
        </div>
    `;
}

function renderOrgChartView(editable = false) {
    const event = appState.selectedEvent;
    if (!event) {
        return `
            <div class="card">
                <div class="resource-details">Select an event to view the org chart.</div>
            </div>
        `;
    }

    const activeType = String(appState.orgChartActiveType || 'senior').toLowerCase() === 'cadet' ? 'cadet' : 'senior';

    return `
        <div class="flex-between mb-4">
            <h3 class="page-subtitle">Org Chart</h3>
            ${editable ? `<button class="btn btn-blue btn-small" onclick="openAddOrgChartPositionModal()">+ Add Position</button>` : ''}
        </div>
        <div class="flex gap-2" style="margin-bottom:10px;">
            <button class="btn ${activeType === 'senior' ? 'btn-blue' : 'btn-outline'} btn-small" onclick="setOrgChartType('senior')">Senior Member Chart</button>
            <button class="btn ${activeType === 'cadet' ? 'btn-blue' : 'btn-outline'} btn-small" onclick="setOrgChartType('cadet')">Cadet Chart</button>
        </div>
        <div class="card org-chart-shell">
            <div id="orgChartMount"></div>
        </div>
    `;
}

function mountOrgChartHTML() {
    const target = document.getElementById('orgChartMount');
    if (!target) return;
    const roster = Array.isArray(appState.roster) ? appState.roster : [];
    const positions = Array.isArray(appState.orgChartPositions) ? appState.orgChartPositions : [];
    const normalize = (v) => String(v || '').trim();

    const rosterByCap = new Map();
    for (const r of roster) {
        const cap = normalize(r?.cap_id);
        if (!cap || rosterByCap.has(cap)) continue;
        rosterByCap.set(cap, (r?.full_name || r?.name || '').trim());
    }

    const activeType = String(appState.orgChartActiveType || 'senior').toLowerCase() === 'cadet' ? 'cadet' : 'senior';
    let filtered = positions.filter(p => String(p.chart_type || 'senior').toLowerCase() === activeType);
    // Backward compatibility: if chart_type is missing in DB rows, keep showing senior chart data.
    if (!filtered.length && activeType === 'senior') {
        filtered = positions.filter(p => !p.chart_type);
    }
    // If current type is empty but we do have positions, automatically fall back to senior.
    if (!filtered.length && positions.length) {
        const seniorFallback = positions.filter(p => String(p.chart_type || 'senior').toLowerCase() === 'senior' || !p.chart_type);
        if (seniorFallback.length) {
            appState.orgChartActiveType = 'senior';
            filtered = seniorFallback;
        }
    }

    const normalizedPositions = filtered.map((p) => {
        const cap = normalize(p.cap_id);
        const rosterName = rosterByCap.get(cap) || '';
        const person_name = String(p?.person_name || '').trim() || rosterName;
        return { ...p, person_name };
    });

    target.innerHTML = normalizedPositions.length
        ? renderOrgChartHTML(normalizedPositions)
        : `<div class="empty-state-text text-center">No ${activeType === 'cadet' ? 'Cadet' : 'Senior Member'} org chart positions yet.</div>`;
}

function renderNotAuthorized() {
    return `
        <div class="empty-state">
            <div class="empty-state-text">Not authorized.</div>
        </div>
    `;
}

function renderReports() {
    const reportItems = ['Inprocessing', 'Outprocessing', 'Assets & Vehicles', 'Personnel', 'Roster', 'Locations', 'Log'];
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
                    const name = entry.lastName ? `${entry.lastName}${entry.firstName ? ` ${entry.firstName}` : ''}` : (entry.name || 'Unknown');
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




