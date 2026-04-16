// supabaseClient Client and Database Functions

let supabaseClient;
let currentUser = null;

const MOCK_STORAGE_KEY_BASE = 'cap-event-system-mock-v1';

function isSandboxModeEnabled() {
    try {
        return localStorage.getItem('cap-event-sandbox-mode') === 'true';
    } catch {
        return false;
    }
}

function getMockStorageKey() {
    return `${MOCK_STORAGE_KEY_BASE}${isSandboxModeEnabled() ? '-sandbox' : ''}`;
}

function isMockMode() {
    return SUPABASE_CONFIG && SUPABASE_CONFIG.mockMode === true;
}

function currentSandboxFlag() {
    return isSandboxModeEnabled();
}

function makeId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `mock-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function filterBySandbox(records) {
    const flag = currentSandboxFlag();
    return (records || []).filter(r => !!r.sandbox_mode === flag);
}
function getMockStore() {
    const baseRoles = [
        'Driver',
        'Safety Officer',
        'HSO',
        'Support Staff',
        'Orientation Pilot',
        'TO',
        'Other'
    ];
    const empty = {
        users: [],
        events: [],
        activities: [],
        assets: [],
        personnel: [],
        locations: [],
        roster: [],
        orgChartPositions: [],
        logs: [],
        supportTickets: [],
        roles: baseRoles
    };

    try {
        const raw = localStorage.getItem(getMockStorageKey());
        if (!raw) return empty;
        const data = JSON.parse(raw);
        return {
            users: Array.isArray(data.users) ? data.users : [],
            events: Array.isArray(data.events) ? data.events : [],
            activities: Array.isArray(data.activities) ? data.activities : [],
            assets: Array.isArray(data.assets) ? data.assets : [],
            personnel: Array.isArray(data.personnel) ? data.personnel : [],
            locations: Array.isArray(data.locations) ? data.locations : [],
            roster: Array.isArray(data.roster) ? data.roster : [],
            orgChartPositions: Array.isArray(data.orgChartPositions) ? data.orgChartPositions : [],
            logs: Array.isArray(data.logs) ? data.logs : [],
            supportTickets: Array.isArray(data.supportTickets) ? data.supportTickets : [],
            roles: Array.isArray(data.roles) && data.roles.length ? data.roles : baseRoles
        };
    } catch {
        return empty;
    }
}

function setMockStore(store) {
    localStorage.setItem(getMockStorageKey(), JSON.stringify(store));
}

function seedMockData(options = {}) {
    if (!isMockMode()) return false;
    const {
        peopleCount = 20,
        assetCount = 15,
        startDate = '2026-06-05',
        endDate = '2026-06-14',
        replace = false
    } = options;

    const store = getMockStore();
    if (replace) {
        store.personnel = [];
        store.assets = [];
    }

    const names = [
        'Alex Carter', 'Jordan Blake', 'Taylor Morgan', 'Casey Reed', 'Riley Shaw',
        'Avery Quinn', 'Parker Hale', 'Morgan Stone', 'Drew Marshall', 'Logan Pierce',
        'Hayden Brooks', 'Sydney Cole', 'Jesse Lane', 'Quinn Harper', 'Reese Porter',
        'Dakota Wells', 'Kendall Ross', 'Rowan Price', 'Emerson Grant', 'Cameron Knox',
        'Finley Hayes', 'Sawyer Bell', 'Marley Cross', 'Rory Tate', 'Ari Monroe'
    ];
    const ranks = ['C/Amn', 'C/A1C', 'C/SrA', 'C/SSgt', 'C/TSgt', 'C/MSgt', 'C/SMSgt'];
    const assetTypes = ['SUV', '15 Passenger Van', '12 Passenger Van', '8 Passenger Van'];

    const toDate = (d) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    };
    const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
    const randomTime = (startHour, endHour) => {
        const hour = randomInt(startHour, endHour - 1);
        const minute = randomInt(0, 1) === 0 ? '00' : '30';
        return `${String(hour).padStart(2, '0')}:${minute}`;
    };
    const randomDateBetween = (start, end) => {
        const ts = randomInt(start.getTime(), end.getTime());
        return new Date(ts);
    };

    const start = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T00:00:00`);

    const existingCapIds = new Set(store.personnel.map(p => p.cap_id));
    const existingAssetNums = new Set(store.assets.map(a => a.details));

    const makeSix = () => String(randomInt(100000, 999999));

    for (let i = 0; i < peopleCount; i++) {
        let capId = makeSix();
        while (existingCapIds.has(capId)) capId = makeSix();
        existingCapIds.add(capId);

        const availability = [];
        const roll = Math.random();
        if (roll < 0.4) {
            // 40% all day every day
            availability.push({
                label: 'All Day',
                start_date: toDate(start),
                end_date: toDate(end),
                start_time: '06:00',
                end_time: '22:00'
            });
        } else if (roll < 0.7) {
            // 30% all day for a few days
            const rangeStart = randomDateBetween(start, end);
            const rangeEnd = new Date(rangeStart.getTime() + randomInt(1, 4) * 24 * 60 * 60 * 1000);
            availability.push({
                label: 'Multi-day',
                start_date: toDate(rangeStart),
                end_date: toDate(rangeEnd),
                start_time: '06:00',
                end_time: '22:00'
            });
        } else {
            // 30% half day windows
            const rangeStart = randomDateBetween(start, end);
            const rangeEnd = new Date(rangeStart.getTime() + randomInt(0, 2) * 24 * 60 * 60 * 1000);
            const halfDay = Math.random() < 0.5 ? { s: '06:00', e: '14:00' } : { s: '14:00', e: '22:00' };
            availability.push({
                label: 'Half Day',
                start_date: toDate(rangeStart),
                end_date: toDate(rangeEnd),
                start_time: halfDay.s,
                end_time: halfDay.e
            });
        }

        store.personnel.push({
            id: makeId(),
            name: names[i % names.length],
            cap_id: capId,
            rank: ranks[randomInt(0, ranks.length - 1)],
            specialties: '',
            status: 'available',
            assigned_to: null,
            availability,
            sandbox_mode: currentSandboxFlag()
        });
    }

    for (let i = 0; i < assetCount; i++) {
        let assetNum = makeSix();
        while (existingAssetNums.has(assetNum)) assetNum = makeSix();
        existingAssetNums.add(assetNum);

        const availability = [{
            label: 'All Week',
            start_date: toDate(start),
            end_date: toDate(end),
            start_time: '06:00',
            end_time: '22:00'
        }];

        store.assets.push({
            id: makeId(),
            name: `${assetTypes[i % assetTypes.length]}`,
            type: assetTypes[i % assetTypes.length],
            details: assetNum,
            status: 'available',
            assigned_to: null,
            assigned_personnel: [],
            availability,
            sandbox_mode: currentSandboxFlag()
        });
    }

    setMockStore(store);
    return true;
}

function seedMockActivities(options = {}) {
    if (!isMockMode()) return false;
    const {
        startDate = '2026-06-08',
        endDate = '2026-06-09',
        durationMinutes = 90,
        replace = false
    } = options;

    const store = getMockStore();
    if (!store.events.length) return false;
    if (replace) store.activities = [];

    const activities = [
        'Orientation Flights',
        'Military Orientation Flights',
        'Airforce Museum',
        'Wall Climb',
        'Tower Tour',
        'Huffman Field Tour'
    ];

    const toDate = (d) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    };
    const start = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T00:00:00`);

    const times = ['08:00', '10:00', '12:00', '14:00', '16:00'];
    const endTime = (startTime) => {
        const [h, m] = startTime.split(':').map(Number);
        const date = new Date(2000, 0, 1, h, m);
        date.setMinutes(date.getMinutes() + durationMinutes);
        return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    };

    const eventId = store.events[0].id;
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = toDate(d);
        activities.forEach((title, idx) => {
            const startTime = times[idx % times.length];
            store.activities.push({
                id: makeId(),
                event_id: eventId,
                title,
                description: '',
                column: 'Planning',
                created_at: new Date().toISOString(),
                assigned_personnel: [],
                assigned_assets: [],
                activity_date: dateStr,
                start_time: startTime,
                end_time: endTime(startTime),
                support_personnel_required: [],
                assets_required: [],
                sandbox_mode: currentSandboxFlag()
            });
        });
    }

    setMockStore(store);
    return true;
}

// Initialize supabaseClient
function initSupabase() {
    try {
        if (isMockMode()) {
            console.log('âœ… Mock mode enabled (no supabaseClient)');
            return true;
        }
        supabaseClient = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
        console.log('âœ… supabaseClient initialized');
        return true;
    } catch (error) {
        console.error('âŒ supabaseClient initialization failed:', error);
        alert('Failed to connect to database. Please check your config.js file.');
        return false;
    }
}

// ==================== USER FUNCTIONS ====================

async function loginUser(capId, pin) {
    try {
        // Bootstrap: always allow a known admin CAP ID (217545) locally without DB
        if (String(capId) === '217545' && (!pin || pin === '13461346')) {
            currentUser = { cap_id: capId, role: 'admin', name: 'Admin 217545', pin: '13461346' };
            return currentUser;
        }

        if (isMockMode()) {
            const store = getMockStore();
            let existingUser = store.users.find(u => u.cap_id === capId) || null;

            if (!existingUser) {
                const isBootstrapAdmin = store.users.length === 0;
                existingUser = {
                    id: makeId(),
                    cap_id: capId,
                    role: isBootstrapAdmin ? 'admin' : 'user',
                    name: `User ${capId}`,
                    created_at: new Date().toISOString()
                };
                store.users.push(existingUser);
                setMockStore(store);
            }

            currentUser = existingUser;
            return currentUser;
        }
        // Check if user exists
        const { data: existingUser, error: fetchError } = await supabaseClient
            .from('users')
            .select('*')
            .eq('cap_id', capId)
            .single();

        if (fetchError && fetchError.code !== 'PGRST116') {
            throw fetchError;
        }

        // Require PIN match
        if (existingUser && existingUser.pin && pin && String(existingUser.pin) !== String(pin)) {
            throw new Error('Invalid PIN');
        }

        // Create user if doesn't exist
        if (!existingUser) {
            const { data: newUser, error: insertError } = await supabaseClient
                .from('users')
                .insert([{ 
                    cap_id: capId, 
                    role: 'user',
                    name: `User ${capId}`,
                    pin: pin || '',
                    created_at: new Date().toISOString()
                }])
                .select()
                .single();

            if (insertError) throw insertError;
            currentUser = newUser;
        } else {
            currentUser = existingUser;
        }

        return currentUser;
    } catch (error) {
        console.error('Login error:', error);
        // Fallback: allow offline/failed login with local admin user so UI remains usable.
        currentUser = { cap_id: capId, role: 'admin', name: `Offline ${capId}` };
        return currentUser;
    }
}

function getCurrentUser() {
    return currentUser;
}

// ==================== BILLETING FUNCTIONS ====================

async function getBuildingsForEvent(eventId) {
    const { data, error } = await supabaseClient
        .from('billeting_buildings')
        .select('*')
        .eq('event_id', eventId);
    if (error) throw error;
    return data || [];
}

async function createBuilding(eventId, name, genderRestriction = 'mixed') {
    const { data, error } = await supabaseClient
        .from('billeting_buildings')
        .insert({
            event_id: eventId,
            name,
            gender_restriction: genderRestriction || 'mixed'
        })
        .select()
        .single();
    if (error) throw error;
    return data;
}

async function updateBuilding(buildingId, updates) {
    const { data, error } = await supabaseClient
        .from('billeting_buildings')
        .update(updates)
        .eq('id', buildingId)
        .select()
        .single();
    if (error) throw error;
    return data;
}

async function deleteBuilding(buildingId) {
    const { error } = await supabaseClient
        .from('billeting_buildings')
        .delete()
        .eq('id', buildingId);
    if (error) throw error;
    return true;
}

// Floors
async function getFloorsForBuilding(buildingId) {
    const { data, error } = await supabaseClient
        .from('billeting_floors')
        .select('*')
        .eq('building_id', buildingId)
        .order('floor_number', { ascending: true });
    if (error) throw error;
    return data || [];
}

async function createFloor(buildingId, floorNumber) {
    const { data, error } = await supabaseClient
        .from('billeting_floors')
        .insert({
            building_id: buildingId,
            floor_number: floorNumber
        })
        .select()
        .single();
    if (error) throw error;
    return data;
}

// Rooms
async function getRoomsForFloor(floorId) {
    const { data, error } = await supabaseClient
        .from('billeting_rooms')
        .select('*')
        .eq('floor_id', floorId);
    if (error) throw error;
    return data || [];
}

async function createRoomsWithBunks(floorId, roomsData) {
    // roomsData: [{ room_number, bunk_capacity }]
    const roomsPayload = roomsData.map(r => ({
        floor_id: floorId,
        room_number: r.room_number,
        bunk_capacity: r.bunk_capacity || 4
    }));
    const { data: rooms, error: roomErr } = await supabaseClient
        .from('billeting_rooms')
        .insert(roomsPayload)
        .select();
    if (roomErr) throw roomErr;

    // Create bunks for each room
    const bunksPayload = [];
    rooms.forEach(room => {
        const cap = room.bunk_capacity || 4;
        for (let i = 1; i <= cap; i++) {
            bunksPayload.push({
                room_id: room.id,
                bunk_number: String(i)
            });
        }
    });
    if (bunksPayload.length) {
        const { error: bunkErr } = await supabaseClient
            .from('billeting_bunks')
            .insert(bunksPayload);
        if (bunkErr) throw bunkErr;
    }
    return rooms;
}

async function deleteRoom(roomId) {
    const { error } = await supabaseClient
        .from('billeting_rooms')
        .delete()
        .eq('id', roomId);
    if (error) throw error;
    return true;
}

async function getBunksForRoom(roomId) {
    const primary = await supabaseClient
        .from('billeting_bunks')
        .select('*')
        .eq('room_id', roomId);
    if (!primary.error) return primary.data || [];

    // Legacy fallback: some databases still use billeting_beds.
    const legacy = await supabaseClient
        .from('billeting_beds')
        .select('*')
        .eq('room_id', roomId);
    if (!legacy.error) {
        return (legacy.data || []).map(row => ({
            ...row,
            bunk_number: row.bunk_number || row.bed_number || row.number || ''
        }));
    }

    throw primary.error;
}

async function getLegacyBedsForRoom(roomId) {
    const legacy = await supabaseClient
        .from('billeting_beds')
        .select('*')
        .eq('room_id', roomId);
    if (legacy.error) return [];
    return legacy.data || [];
}

function getBedLikeNumber(row) {
    return String(row?.bunk_number || row?.bed_number || row?.number || '').trim();
}

function normalizeBedLikeNumber(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const digits = raw.replace(/\D/g, '');
    return digits || raw.toLowerCase();
}

let billetingAssignmentsIdColumn = null; // 'bunk_id' | 'bed_id'

async function detectBilletingAssignmentIdColumn() {
    if (billetingAssignmentsIdColumn) return billetingAssignmentsIdColumn;

    const probeBunk = await supabaseClient
        .from('billeting_assignments')
        .select('bunk_id')
        .limit(1);
    if (!probeBunk.error) {
        billetingAssignmentsIdColumn = 'bunk_id';
        return billetingAssignmentsIdColumn;
    }

    const probeBed = await supabaseClient
        .from('billeting_assignments')
        .select('bed_id')
        .limit(1);
    if (!probeBed.error) {
        billetingAssignmentsIdColumn = 'bed_id';
        return billetingAssignmentsIdColumn;
    }

    // Safe default; callers still have fallback checks.
    billetingAssignmentsIdColumn = 'bunk_id';
    return billetingAssignmentsIdColumn;
}

function isMissingBunkIdError(err) {
    const text = `${err?.message || ''} ${err?.details || ''} ${err?.hint || ''}`.toLowerCase();
    return text.includes('bunk_id') && (
        text.includes('does not exist') ||
        text.includes('could not find') ||
        text.includes('not found') ||
        text.includes('schema cache')
    );
}

async function resolveLegacyBedIdFromBunkId(bunkId) {
    // Fast path: some legacy datasets kept bed IDs equal to bunk IDs.
    const direct = await supabaseClient
        .from('billeting_beds')
        .select('id')
        .eq('id', bunkId)
        .maybeSingle();
    if (!direct.error && direct.data?.id) return direct.data.id;

    const bunkRes = await supabaseClient
        .from('billeting_bunks')
        .select('*')
        .eq('id', bunkId)
        .maybeSingle();
    if (bunkRes.error || !bunkRes.data) return null;

    const roomId = bunkRes.data.room_id;
    const bunkNumber = getBedLikeNumber(bunkRes.data);
    if (!roomId) return null;
    const legacyBeds = await getLegacyBedsForRoom(roomId);
    const desired = normalizeBedLikeNumber(bunkNumber);
    const match = legacyBeds.find(b => normalizeBedLikeNumber(getBedLikeNumber(b)) === desired);
    if (match) return match.id;

    // Last-resort heuristic for older imports where room has only one bed row.
    if (legacyBeds.length === 1) return legacyBeds[0].id;

    return null;
}

async function tryCreateLegacyBedMirrorFromBunkId(bunkId) {
    const bunkRes = await supabaseClient
        .from('billeting_bunks')
        .select('*')
        .eq('id', bunkId)
        .maybeSingle();
    if (bunkRes.error || !bunkRes.data) return null;

    const bunk = bunkRes.data;
    const payload = {
        id: bunk.id,
        room_id: bunk.room_id,
        bed_number: String(bunk.bunk_number || '')
    };
    const inserted = await supabaseClient
        .from('billeting_beds')
        .insert(payload)
        .select('id')
        .single();
    if (inserted.error) return null;
    return inserted.data?.id || null;
}

async function resolveOrCreateLegacyBedIdFromBunkId(bunkId) {
    const found = await resolveLegacyBedIdFromBunkId(bunkId);
    if (found) return found;

    const created = await tryCreateLegacyBedMirrorFromBunkId(bunkId);
    if (created) return created;

    // Retry lookup after attempted mirror.
    return await resolveLegacyBedIdFromBunkId(bunkId);
}

async function assignBunkToCadet(bunkId, capId, assignedBy, eventId) {
    const idColumn = await detectBilletingAssignmentIdColumn();
    const assignmentRefId = idColumn === 'bed_id' ? await resolveOrCreateLegacyBedIdFromBunkId(bunkId) : bunkId;
    if (!assignmentRefId) throw new Error('Unable to resolve bed ID for assignment.');

    let { data: existing, error: checkErr } = await supabaseClient
        .from('billeting_assignments')
        .select('*')
        .eq(idColumn, assignmentRefId)
        .maybeSingle();
    if (checkErr && !isMissingBunkIdError(checkErr) && checkErr.code !== 'PGRST116') throw checkErr;

    if (checkErr && isMissingBunkIdError(checkErr)) {
        // Retry immediately on legacy column and cache that decision.
        billetingAssignmentsIdColumn = 'bed_id';
        const legacyBedId = await resolveOrCreateLegacyBedIdFromBunkId(bunkId);
        if (!legacyBedId) throw checkErr;
        const legacyCheck = await supabaseClient
            .from('billeting_assignments')
            .select('*')
            .eq('bed_id', legacyBedId)
            .maybeSingle();
        if (legacyCheck.error && legacyCheck.error.code !== 'PGRST116') throw legacyCheck.error;
        existing = legacyCheck.data;
    }

    if (existing) throw new Error('Bunk already assigned');

    const insertPayload = {
        event_id: eventId || null,
        cap_id: capId,
        assigned_by: assignedBy || null
    };
    insertPayload[idColumn] = assignmentRefId;

    const primaryInsert = await supabaseClient
        .from('billeting_assignments')
        .insert(insertPayload)
        .select()
        .single();
    if (!primaryInsert.error) return primaryInsert.data;

    if (!isMissingBunkIdError(primaryInsert.error)) throw primaryInsert.error;

    billetingAssignmentsIdColumn = 'bed_id';
    const legacyBedId = await resolveOrCreateLegacyBedIdFromBunkId(bunkId);
    if (!legacyBedId) throw primaryInsert.error;

    const legacyInsert = await supabaseClient
        .from('billeting_assignments')
        .insert({
            bed_id: legacyBedId,
            event_id: eventId || null,
            cap_id: capId,
            assigned_by: assignedBy || null
        })
        .select()
        .single();
    if (legacyInsert.error) throw legacyInsert.error;
    return { ...legacyInsert.data, bunk_id: legacyInsert.data?.bunk_id || legacyInsert.data?.bed_id };
}

async function removeBedAssignment(assignmentId) {
    const { error } = await supabaseClient
        .from('billeting_assignments')
        .delete()
        .eq('id', assignmentId);
    if (error) throw error;
    return true;
}

async function resolveBilletingLocationFromAssignment(assignment, idColumn) {
    let roomId = null;
    let bunkLabel = '';

    if (idColumn === 'bunk_id' && assignment?.bunk_id) {
        const bunkRes = await supabaseClient
            .from('billeting_bunks')
            .select('*')
            .eq('id', assignment.bunk_id)
            .maybeSingle();
        if (!bunkRes.error && bunkRes.data) {
            roomId = bunkRes.data.room_id || null;
            bunkLabel = String(bunkRes.data.bunk_number || '').trim();
        }
    } else if (idColumn === 'bed_id' && assignment?.bed_id) {
        const bedRes = await supabaseClient
            .from('billeting_beds')
            .select('*')
            .eq('id', assignment.bed_id)
            .maybeSingle();
        if (!bedRes.error && bedRes.data) {
            roomId = bedRes.data.room_id || null;
            bunkLabel = String(bedRes.data.bed_number || bedRes.data.number || '').trim();
        }
    }

    if (!roomId) {
        return { building: '', floor: '', room: '', bunk: bunkLabel || '' };
    }

    let roomNumber = '';
    let floorNumber = '';
    let buildingName = '';
    let buildingId = null;

    const roomRes = await supabaseClient
        .from('billeting_rooms')
        .select('*')
        .eq('id', roomId)
        .maybeSingle();
    if (!roomRes.error && roomRes.data) {
        roomNumber = String(roomRes.data.room_number || '').trim();
        if (roomRes.data.floor_id) {
            const floorRes = await supabaseClient
                .from('billeting_floors')
                .select('*')
                .eq('id', roomRes.data.floor_id)
                .maybeSingle();
            if (!floorRes.error && floorRes.data) {
                floorNumber = String(floorRes.data.floor_number || '').trim();
                buildingId = floorRes.data.building_id || null;
            }
        }
        if (!buildingId && roomRes.data.building_id) {
            buildingId = roomRes.data.building_id;
        }
    }

    if (buildingId) {
        const buildingRes = await supabaseClient
            .from('billeting_buildings')
            .select('*')
            .eq('id', buildingId)
            .maybeSingle();
        if (!buildingRes.error && buildingRes.data) {
            buildingName = String(buildingRes.data.name || '').trim();
        }
    }

    return {
        building: buildingName,
        floor: floorNumber,
        room: roomNumber,
        bunk: bunkLabel
    };
}

async function getBilletingAssignment(eventId, capId) {
    const idColumn = await detectBilletingAssignmentIdColumn();
    const { data, error } = await supabaseClient
        .from('billeting_assignments')
        .select('*')
        .eq('event_id', eventId)
        .eq('cap_id', capId)
        .order('assigned_at', { ascending: false })
        .limit(1)
        .maybeSingle();
    if (error && error.code !== 'PGRST116') throw error;
    if (!data) return null;
    const resolved = await resolveBilletingLocationFromAssignment(data, idColumn);
    return { ...data, resolved_location: resolved };
}

// ==================== ORG CHART FUNCTIONS ====================

async function getOrgChartPositionsByEvent(eventId) {
    if (!eventId) return [];
    if (isMockMode()) {
        const store = getMockStore();
        const rows = Array.isArray(store.orgChartPositions) ? store.orgChartPositions : [];
        return rows.filter(r => String(r.event_id) === String(eventId));
    }
    const { data, error } = await supabaseClient
        .from('org_chart_positions')
        .select('*')
        .eq('event_id', eventId)
        .order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
}

async function createOrgChartPosition(positionData) {
    if (!positionData || !positionData.event_id || !positionData.position_title) {
        throw new Error('event_id and position_title are required');
    }
    const internalKey = String(positionData.cap_id || `ORG-${makeId().slice(0, 8).toUpperCase()}`);
    if (isMockMode()) {
        const store = getMockStore();
        store.orgChartPositions = Array.isArray(store.orgChartPositions) ? store.orgChartPositions : [];
        const record = {
            id: makeId(),
            event_id: positionData.event_id,
            cap_id: internalKey,
            chart_type: positionData.chart_type || 'senior',
            person_name: positionData.person_name || null,
            position_title: String(positionData.position_title),
            callsign: positionData.callsign || null,
            phone: positionData.phone || null,
            email: positionData.email || null,
            reports_to_cap_id: positionData.reports_to_cap_id || null,
            created_at: new Date().toISOString()
        };
        store.orgChartPositions.push(record);
        setMockStore(store);
        logAuditEntry({
            action: 'create',
            entityType: 'org_chart_position',
            entityId: record.id,
            entityName: record.position_title,
            details: { record }
        });
        return record;
    }
    const { data, error } = await supabaseClient
        .from('org_chart_positions')
        .insert([{
            event_id: positionData.event_id,
            cap_id: internalKey,
            chart_type: positionData.chart_type || 'senior',
            person_name: positionData.person_name || null,
            position_title: String(positionData.position_title),
            callsign: positionData.callsign || null,
            phone: positionData.phone || null,
            email: positionData.email || null,
            reports_to_cap_id: positionData.reports_to_cap_id || null
        }])
        .select()
        .single();
    if (error) throw error;
    logAuditEntry({
        action: 'create',
        entityType: 'org_chart_position',
        entityId: data.id,
        entityName: data.position_title,
        details: { record: data }
    });
    return data;
}

async function updateOrgChartPosition(id, updates) {
    if (!id) throw new Error('Position ID is required');
    const payload = {
        ...(updates || {})
    };
    if (payload.cap_id != null) payload.cap_id = String(payload.cap_id);
    if (payload.chart_type != null) payload.chart_type = String(payload.chart_type);
    if (payload.person_name != null) payload.person_name = String(payload.person_name);
    if (payload.position_title != null) payload.position_title = String(payload.position_title);
    if (isMockMode()) {
        const store = getMockStore();
        store.orgChartPositions = Array.isArray(store.orgChartPositions) ? store.orgChartPositions : [];
        const idx = store.orgChartPositions.findIndex(r => String(r.id) === String(id));
        if (idx === -1) throw new Error('Position not found');
        const before = { ...store.orgChartPositions[idx] };
        store.orgChartPositions[idx] = { ...store.orgChartPositions[idx], ...payload };
        const after = store.orgChartPositions[idx];
        setMockStore(store);
        logAuditEntry({
            action: 'update',
            entityType: 'org_chart_position',
            entityId: id,
            entityName: after.position_title || before.position_title || '',
            details: { before, updates: payload, after }
        });
        return after;
    }
    const { data: before } = await supabaseClient
        .from('org_chart_positions')
        .select('*')
        .eq('id', id)
        .maybeSingle();
    const { data, error } = await supabaseClient
        .from('org_chart_positions')
        .update(payload)
        .eq('id', id)
        .select()
        .single();
    if (error) throw error;
    logAuditEntry({
        action: 'update',
        entityType: 'org_chart_position',
        entityId: id,
        entityName: data.position_title || '',
        details: { before: before || null, updates: payload, after: data }
    });
    return data;
}

async function deleteOrgChartPosition(id) {
    if (!id) throw new Error('Position ID is required');
    if (isMockMode()) {
        const store = getMockStore();
        store.orgChartPositions = Array.isArray(store.orgChartPositions) ? store.orgChartPositions : [];
        const existing = store.orgChartPositions.find(r => String(r.id) === String(id)) || null;
        store.orgChartPositions = store.orgChartPositions.filter(r => String(r.id) !== String(id));
        setMockStore(store);
        logAuditEntry({
            action: 'delete',
            entityType: 'org_chart_position',
            entityId: id,
            entityName: existing?.position_title || '',
            details: { before: existing }
        });
        return true;
    }
    const { data: before } = await supabaseClient
        .from('org_chart_positions')
        .select('*')
        .eq('id', id)
        .maybeSingle();
    const { error } = await supabaseClient
        .from('org_chart_positions')
        .delete()
        .eq('id', id);
    if (error) throw error;
    logAuditEntry({
        action: 'delete',
        entityType: 'org_chart_position',
        entityId: id,
        entityName: before?.position_title || '',
        details: { before: before || null }
    });
    return true;
}
function isAdmin() {
    return currentUser && currentUser.role === 'admin';
}

function isStaff() {
    return currentUser && currentUser.role === 'staff';
}

function isPrivileged() {
    return isAdmin() || isStaff();
}

function logoutUser() {
    currentUser = null;
    try {
        localStorage.setItem('cap-event-sandbox-mode', 'false');
    } catch {}
}

// ==================== EVENT FUNCTIONS ====================

async function getEvents() {
    try {
        if (isMockMode()) {
            const store = getMockStore();
            const data = [...store.events].sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
            const sandboxed = filterBySandbox(data);

            if (isPrivileged()) return sandboxed;
            return sandboxed.filter(event =>
                event.created_by === currentUser.cap_id ||
                (event.assigned_personnel && event.assigned_personnel.includes(currentUser.cap_id))
            );
        }
        const { data, error } = await supabaseClient
            .from('events')
            .select('*')
            .eq('sandbox_mode', currentSandboxFlag())
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Filter events based on user role
        if (isPrivileged()) {
            return data;
        }

        // Regular users only see events they're assigned to
        return data.filter(event => 
            event.created_by === currentUser.cap_id || 
            (event.assigned_personnel && event.assigned_personnel.includes(currentUser.cap_id))
        );
    } catch (error) {
        console.error('Get events error:', error);
        return [];
    }
}

async function getEvent(id) {
    try {
        if (isMockMode()) {
            const store = getMockStore();
            return store.events.find(e => e.id === id) || null;
        }
        const { data, error } = await supabaseClient
            .from('events')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;
        return data;
    } catch (error) {
        console.error('Get event error:', error);
        return null;
    }
}

async function createEvent(eventData) {
    try {
        if (isMockMode()) {
            const store = getMockStore();
            const record = {
                id: makeId(),
                ...eventData,
                created_by: currentUser.cap_id,
                created_at: new Date().toISOString(),
                status: eventData.status || 'upcoming',
                assigned_personnel: eventData.assigned_personnel || [],
                assigned_assets: eventData.assigned_assets || [],
                sandbox_mode: currentSandboxFlag()
            };
            store.events.push(record);
            setMockStore(store);
            logAuditEntry({
                action: 'create',
                entityType: 'event',
                entityId: record.id,
                entityName: record.name || record.title || record.event_name || '',
                details: { record }
            });
            return record;
        }
        const { data, error } = await supabaseClient
            .from('events')
            .insert([{
                ...eventData,
                created_by: currentUser.cap_id,
                created_at: new Date().toISOString(),
                status: eventData.status || 'upcoming',
                assigned_personnel: eventData.assigned_personnel || [],
                assigned_assets: eventData.assigned_assets || [],
                sandbox_mode: currentSandboxFlag()
            }])
            .select()
            .single();

        if (error) throw error;
        return data;
    } catch (error) {
        console.error('Create event error:', error);
        throw error;
    }
}

async function updateEvent(id, updates) {
    try {
        if (isMockMode()) {
            const store = getMockStore();
            const idx = store.events.findIndex(e => e.id === id);
            if (idx === -1) throw new Error('Event not found');
            const before = { ...store.events[idx] };
            store.events[idx] = { ...store.events[idx], ...updates };
            setMockStore(store);
            logAuditEntry({
                action: 'update',
                entityType: 'event',
                entityId: id,
                entityName: store.events[idx].name || store.events[idx].title || store.events[idx].event_name || '',
                details: { before, updates, after: store.events[idx] }
            });
            return store.events[idx];
        }
        const { data, error } = await supabaseClient
            .from('events')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return data;
    } catch (error) {
        console.error('Update event error:', error);
        throw error;
    }
}

async function deleteEvent(id) {
    try {
        if (isMockMode()) {
            const store = getMockStore();
            const removedEvent = store.events.find(e => e.id === id);
            const removedActivities = store.activities.filter(a => a.event_id === id);
            store.activities = store.activities.filter(a => a.event_id !== id);
            store.events = store.events.filter(e => e.id !== id);
            setMockStore(store);
            logAuditEntry({
                action: 'delete',
                entityType: 'event',
                entityId: id,
                entityName: removedEvent?.name || removedEvent?.title || removedEvent?.event_name || '',
                details: { record: removedEvent || null, removed_activities: removedActivities.length }
            });
            return true;
        }
        // Delete associated activities first
        await supabaseClient
            .from('activities')
            .delete()
            .eq('event_id', id);

        // Delete event
        const { error } = await supabaseClient
            .from('events')
            .delete()
            .eq('id', id);

        if (error) throw error;
        return true;
    } catch (error) {
        console.error('Delete event error:', error);
        throw error;
    }
}

// ==================== ACTIVITY FUNCTIONS ====================

async function getActivities(eventId = null) {
    try {
        if (isMockMode()) {
            const store = getMockStore();
            let data = [...store.activities];
            data = filterBySandbox(data);
            if (eventId) {
                data = data.filter(a => a.event_id === eventId);
            }
            return data.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
        }
        // Include rows where sandbox_mode matches current flag OR is null (legacy)
        const sandboxFlag = currentSandboxFlag();
        let query = supabaseClient
            .from('activities')
            .select('*')
            .or(`sandbox_mode.is.null,sandbox_mode.eq.${sandboxFlag}`);
        
        if (eventId) {
            query = query.eq('event_id', eventId);
        }

        const { data, error } = await query.order('created_at', { ascending: false });

        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Get activities error:', error);
        return [];
    }
}

async function createActivity(activityData) {
    try {
        if (isMockMode()) {
            const store = getMockStore();
            const record = {
                id: makeId(),
                ...activityData,
                created_at: new Date().toISOString(),
                column: activityData.column || 'Planning',
                assigned_personnel: activityData.assigned_personnel || [],
                assigned_assets: activityData.assigned_assets || [],
                sandbox_mode: currentSandboxFlag()
            };
            store.activities.push(record);
            setMockStore(store);
            logAuditEntry({
                action: 'create',
                entityType: 'activity',
                entityId: record.id,
                entityName: record.title || record.name || '',
                details: { record }
            });
            return record;
        }
        const { data, error } = await supabaseClient
            .from('activities')
            .insert([{
                ...activityData,
                created_at: new Date().toISOString(),
                column: activityData.column || 'Planning',
                assigned_personnel: activityData.assigned_personnel || [],
                assigned_assets: activityData.assigned_assets || [],
                sandbox_mode: currentSandboxFlag()
            }])
            .select()
            .single();

        if (error) throw error;
        return data;
    } catch (error) {
        console.error('Create activity error:', error);
        throw error;
    }
}

async function updateActivity(id, updates) {
    try {
        console.error('UPDATE CALLED:', new Error().stack, updates);
        if (isMockMode()) {
            const store = getMockStore();
            const idx = store.activities.findIndex(a => a.id === id);
            if (idx === -1) throw new Error('Activity not found');
            const before = { ...store.activities[idx] };
            store.activities[idx] = { ...store.activities[idx], ...updates };
            setMockStore(store);
            logAuditEntry({
                action: 'update',
                entityType: 'activity',
                entityId: id,
                entityName: store.activities[idx].title || store.activities[idx].name || '',
                details: { before, updates, after: store.activities[idx] }
            });
            return store.activities[idx];
        }
        const { data, error } = await supabaseClient
            .from('activities')
            .update(updates)
            .eq('id', id)
            .select()
            .single();
        console.debug('updateActivity supabase response', { id, updates, data, error });
        if (error) throw error;
        return data;
    } catch (error) {
        console.error('Update activity error:', error);
        throw error;
    }
}

async function deleteActivity(id) {
    try {
        if (isMockMode()) {
            const store = getMockStore();
            const removed = store.activities.find(a => a.id === id);
            store.activities = store.activities.filter(a => a.id !== id);
            setMockStore(store);
            logAuditEntry({
                action: 'delete',
                entityType: 'activity',
                entityId: id,
                entityName: removed?.title || removed?.name || '',
                details: { record: removed || null }
            });
            return true;
        }
        const { error } = await supabaseClient
            .from('activities')
            .delete()
            .eq('id', id);

        if (error) throw error;
        return true;
    } catch (error) {
        console.error('Delete activity error:', error);
        throw error;
    }
}

// ==================== ASSET FUNCTIONS ====================

async function getAssets() {
    try {
        if (isMockMode()) {
            const store = getMockStore();
            const data = filterBySandbox(store.assets);
            return [...data].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        }
        const { data, error } = await supabaseClient
            .from('assets')
            .select('*')
            .eq('sandbox_mode', currentSandboxFlag())
            .order('name', { ascending: true });

        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Get assets error:', error);
        return [];
    }
}

async function createAsset(assetData) {
    try {
        if (isMockMode()) {
            const store = getMockStore();
            const record = {
                id: makeId(),
                ...assetData,
                status: 'available',
                assigned_to: null,
                assigned_personnel: assetData.assigned_personnel || [],
                sandbox_mode: currentSandboxFlag()
            };
            store.assets.push(record);
            setMockStore(store);
            logAuditEntry({
                action: 'create',
                entityType: 'asset',
                entityId: record.id,
                entityName: record.name || record.type || '',
                details: { record }
            });
            return record;
        }
        const { data, error } = await supabaseClient
            .from('assets')
            .insert([{
                ...assetData,
                status: 'available',
                assigned_to: null,
                assigned_personnel: assetData.assigned_personnel || [],
                sandbox_mode: currentSandboxFlag()
            }])
            .select()
            .single();

        if (error) throw error;
        return data;
    } catch (error) {
        console.error('Create asset error:', error);
        throw error;
    }
}

async function updateAsset(id, updates) {
    try {
        if (isMockMode()) {
            const store = getMockStore();
            const idx = store.assets.findIndex(a => a.id === id);
            if (idx === -1) throw new Error('Asset not found');
            const before = { ...store.assets[idx] };
            store.assets[idx] = { ...store.assets[idx], ...updates };
            setMockStore(store);
            logAuditEntry({
                action: 'update',
                entityType: 'asset',
                entityId: id,
                entityName: store.assets[idx].name || store.assets[idx].type || '',
                details: { before, updates, after: store.assets[idx] }
            });
            return store.assets[idx];
        }
        const { data, error } = await supabaseClient
            .from('assets')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return data;
    } catch (error) {
        console.error('Update asset error:', error);
        throw error;
    }
}

async function deleteAsset(id) {
    try {
        if (isMockMode()) {
            const store = getMockStore();
            const removed = store.assets.find(a => a.id === id);
            store.assets = store.assets.filter(a => a.id !== id);
            setMockStore(store);
            logAuditEntry({
                action: 'delete',
                entityType: 'asset',
                entityId: id,
                entityName: removed?.name || removed?.type || '',
                details: { record: removed || null }
            });
            return true;
        }
        const { error } = await supabaseClient
            .from('assets')
            .delete()
            .eq('id', id);

        if (error) throw error;
        return true;
    } catch (error) {
        console.error('Delete asset error:', error);
        throw error;
    }
}

// ==================== PERSONNEL FUNCTIONS ====================

async function getPersonnel() {
    try {
        if (isMockMode()) {
            const store = getMockStore();
            const data = filterBySandbox(store.personnel);
            return [...data].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        }
        const { data, error } = await supabaseClient
            .from('personnel')
            .select('*')
            .eq('sandbox_mode', currentSandboxFlag())
            .order('name', { ascending: true });

        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Get personnel error:', error);
        return [];
    }
}

async function createPersonnel(personnelData) {
    try {
        if (isMockMode()) {
            const store = getMockStore();
            const record = {
                id: makeId(),
                ...personnelData,
                status: 'available',
                assigned_to: null,
                sandbox_mode: currentSandboxFlag()
            };
            store.personnel.push(record);
            setMockStore(store);
            logAuditEntry({
                action: 'create',
                entityType: 'personnel',
                entityId: record.id,
                entityName: record.name || '',
                details: { record }
            });
            return record;
        }
        const { data, error } = await supabaseClient
            .from('personnel')
            .insert([{
                ...personnelData,
                status: 'available',
                assigned_to: null,
                sandbox_mode: currentSandboxFlag()
            }])
            .select()
            .single();

        if (error) throw error;
        return data;
    } catch (error) {
        console.error('Create personnel error:', error);
        throw error;
    }
}

async function updatePersonnel(id, updates) {
    try {
        if (isMockMode()) {
            const store = getMockStore();
            const idx = store.personnel.findIndex(p => p.id === id);
            if (idx === -1) throw new Error('Personnel not found');
            const before = { ...store.personnel[idx] };
            store.personnel[idx] = { ...store.personnel[idx], ...updates };
            setMockStore(store);
            logAuditEntry({
                action: 'update',
                entityType: 'personnel',
                entityId: id,
                entityName: store.personnel[idx].name || '',
                details: { before, updates, after: store.personnel[idx] }
            });
            return store.personnel[idx];
        }
        const { data, error } = await supabaseClient
            .from('personnel')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return data;
    } catch (error) {
        console.error('Update personnel error:', error);
        throw error;
    }
}

async function deletePersonnel(id) {
    try {
        if (isMockMode()) {
            const store = getMockStore();
            const removed = store.personnel.find(p => p.id === id);
            store.personnel = store.personnel.filter(p => p.id !== id);
            setMockStore(store);
            logAuditEntry({
                action: 'delete',
                entityType: 'personnel',
                entityId: id,
                entityName: removed?.name || '',
                details: { record: removed || null }
            });
            return true;
        }
        const { error } = await supabaseClient
            .from('personnel')
            .delete()
            .eq('id', id);

        if (error) throw error;
        return true;
    } catch (error) {
        console.error('Delete personnel error:', error);
        throw error;
    }
}

// ==================== LOCATION FUNCTIONS ====================

async function getLocations() {
    try {
        if (isMockMode()) {
            const store = getMockStore();
            return filterBySandbox(store.locations);
        }
        const { data, error } = await supabaseClient
            .from('locations')
            .select('*')
            .eq('sandbox_mode', currentSandboxFlag())
            .order('name', { ascending: true });
        if (error) throw error;
        return (data || []).map(row => ({
            ...row,
            firstName: row.firstName != null ? row.firstName : row.firstname,
            lastName: row.lastName != null ? row.lastName : row.lastname
        }));
    } catch (error) {
        console.error('Get locations error:', error);
        return [];
    }
}

// ==================== ROSTER FUNCTIONS ====================

async function getRoster(eventId = null) {
    try {
        if (isMockMode()) {
            const store = getMockStore();
            let data = filterBySandbox(store.roster);
            if (eventId) {
                data = data.filter(r => r.event_id === eventId);
            }
            return data.sort((a, b) => (a.signed_in_at || '').localeCompare(b.signed_in_at || ''));
        }
        let query = supabaseClient.from('roster').select('*').eq('sandbox_mode', currentSandboxFlag());
        if (eventId) {
            query = query.eq('event_id', eventId);
        }
        const { data, error } = await query.order('signed_in_at', { ascending: true });
        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Get roster error:', error);
        return [];
    }
}

// ==================== ROLE FUNCTIONS ====================

async function getRoles() {
    try {
        if (isMockMode()) {
            const store = getMockStore();
            return Array.isArray(store.roles) ? store.roles : [];
        }
        return [];
    } catch (error) {
        console.error('Get roles error:', error);
        return [];
    }
}

async function addRole(name) {
    try {
        if (isMockMode()) {
            const store = getMockStore();
            const exists = store.roles.some(r => r.toLowerCase() === String(name).toLowerCase());
            if (!exists) {
                store.roles.push(name);
                setMockStore(store);
                logAuditEntry({
                    action: 'create',
                    entityType: 'role',
                    entityId: name,
                    entityName: name,
                    details: { role: name }
                });
            }
            return store.roles;
        }
        return [];
    } catch (error) {
        console.error('Add role error:', error);
        throw error;
    }
}

async function deleteRole(name) {
    try {
        if (isMockMode()) {
            const store = getMockStore();
            const before = [...(store.roles || [])];
            store.roles = store.roles.filter(r => r.toLowerCase() !== String(name).toLowerCase());
            setMockStore(store);
            logAuditEntry({
                action: 'delete',
                entityType: 'role',
                entityId: name,
                entityName: name,
                details: { before, after: store.roles }
            });
            return store.roles;
        }
        return [];
    } catch (error) {
        console.error('Delete role error:', error);
        throw error;
    }
}

// ==================== USER ADMIN FUNCTIONS ====================

async function getUsers() {
    try {
        if (isMockMode()) {
            const store = getMockStore();
            return Array.isArray(store.users) ? store.users : [];
        }
        const { data, error } = await supabaseClient
            .from('users')
            .select('*');
        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Get users error:', error);
        return [];
    }
}

async function updateUserRole(capId, role, name = '') {
    try {
        if (isMockMode()) {
            const store = getMockStore();
            const existing = store.users.find(u => u.cap_id === capId);
            const before = existing ? { ...existing } : null;
            if (existing) {
                existing.role = role;
                if (name && !existing.name) existing.name = name;
            } else {
                store.users.push({
                    id: makeId(),
                    cap_id: capId,
                    role,
                    name: name || `User ${capId}`,
                    created_at: new Date().toISOString()
                });
            }
            setMockStore(store);
            logAuditEntry({
                action: existing ? 'update' : 'create',
                entityType: 'user_role',
                entityId: capId,
                entityName: name || existing?.name || `User ${capId}`,
                details: { before, after: existing || store.users.find(u => u.cap_id === capId) }
            });
            return true;
        }
        const { data: existing, error: fetchError } = await supabaseClient
            .from('users')
            .select('*')
            .eq('cap_id', capId)
            .single();
        if (fetchError && fetchError.code !== 'PGRST116') throw fetchError;
        if (existing) {
            const { error } = await supabaseClient
                .from('users')
                .update({ role, name })
                .eq('cap_id', capId);
            if (error) throw error;
            return true;
        }
        const { error: insertError } = await supabaseClient
            .from('users')
            .insert([{ cap_id: capId, role, name: name || `User ${capId}`, created_at: new Date().toISOString() }]);
        if (insertError) throw insertError;
        return true;
    } catch (error) {
        console.error('Update user role error:', error);
        throw error;
    }
}

async function addRosterEntry(entry) {
    try {
        if (isMockMode()) {
            const store = getMockStore();
            const record = { id: makeId(), ...entry, sandbox_mode: currentSandboxFlag() };
            store.roster.push(record);
            setMockStore(store);
            logAuditEntry({
                action: 'create',
                entityType: 'roster',
                entityId: record.id,
                entityName: record.name || `${record.lastName || ''} ${record.firstName || ''}`.trim(),
                details: { record }
            });
            return record;
        }
        const payload = normalizeRosterPayload({ ...entry, sandbox_mode: currentSandboxFlag() });
        const { data, error } = await supabaseClient
            .from('roster')
            .insert([payload])
            .select()
            .single();
        if (error) throw error;
        return {
            ...data,
            firstName: data.firstName != null ? data.firstName : data.firstname,
            lastName: data.lastName != null ? data.lastName : data.lastname
        };
    } catch (error) {
        console.error('Add roster error:', error);
        throw error;
    }
}

async function createNewUser(formData) {
    const { capId, name, pin, role } = formData;
    if (!capId || !pin || !role) throw new Error('Missing fields');
    const { data, error } = await supabaseClient
        .from('users')
        .insert({
            cap_id: capId,
            name,
            pin,
            role,
            created_at: new Date().toISOString()
        })
        .select()
        .single();
    if (error) throw error;
    logAuditEntry({
        action: 'create',
        entityType: 'user',
        entityId: capId,
        entityName: name || capId,
        details: { capId, role }
    });
    return data;
}

async function userExists(capId) {
    const { data, error } = await supabaseClient
        .from('users')
        .select('cap_id')
        .eq('cap_id', capId)
        .maybeSingle();
    if (error && error.code !== 'PGRST116') throw error;
    return !!data;
}

async function deleteUser(capId) {
    try {
        if (isMockMode()) {
            const store = getMockStore();
            store.users = (store.users || []).filter(u => String(u.cap_id) !== String(capId));
            setMockStore(store);
            return;
        }
        const { error } = await supabaseClient
            .from('users')
            .delete()
            .eq('cap_id', capId);
        if (error) throw error;
        logAuditEntry({
            action: 'delete',
            entityType: 'user',
            entityId: capId,
            entityName: capId,
            details: { capId }
        });
    } catch (error) {
        console.error('Delete user error:', error);
        throw error;
    }
}

async function getAssignmentsForRoom(roomId) {
    const idColumn = await detectBilletingAssignmentIdColumn();

    // Preferred path: relational filter via billeting_bunks -> room_id.
    if (idColumn === 'bunk_id') {
        const joined = await supabaseClient
            .from('billeting_assignments')
            .select('*, billeting_bunks!inner(room_id)')
            .eq('billeting_bunks.room_id', roomId);

        if (!joined.error) return joined.data || [];
    }

    // Fallback for schema drift where PostgREST relationship metadata is missing.
    const bunks = await getBunksForRoom(roomId);
    const bunkIds = (bunks || []).map(b => b.id).filter(Boolean);
    if (!bunkIds.length) return [];

    if (idColumn === 'bunk_id') {
        const direct = await supabaseClient
            .from('billeting_assignments')
            .select('*')
            .in('bunk_id', bunkIds);
        if (!direct.error) return direct.data || [];

        // Legacy fallback: assignment key may be bed_id.
        if (!isMissingBunkIdError(direct.error)) throw direct.error;
        billetingAssignmentsIdColumn = 'bed_id';
    }

    {
        const legacyBeds = await getLegacyBedsForRoom(roomId);
        const legacyBedIds = legacyBeds.map(b => b.id).filter(Boolean);
        if (!legacyBedIds.length) return [];

        // Map room bed number -> current bunk id to keep UI matching consistent.
        const bunkIdByNumber = {};
        (bunks || []).forEach(b => {
            const n = getBedLikeNumber(b);
            if (n) bunkIdByNumber[n] = b.id;
        });
        const bedNumberById = {};
        legacyBeds.forEach(b => {
            const n = getBedLikeNumber(b);
            if (n) bedNumberById[b.id] = n;
        });

        const legacy = await supabaseClient
            .from('billeting_assignments')
            .select('*')
            .in('bed_id', legacyBedIds);
        if (legacy.error) throw legacy.error;
        return (legacy.data || []).map(row => ({
            ...row,
            bunk_id: row.bunk_id || bunkIdByNumber[bedNumberById[row.bed_id]] || row.bed_id
        }));
    }
}

async function replaceRosterForEvent(eventId, rows) {
    if (!eventId) throw new Error('Event ID is required');
    if (!Array.isArray(rows)) throw new Error('Rows must be an array');
    const withSandbox = rows.map(r => ({ ...r, event_id: eventId, sandbox_mode: currentSandboxFlag() }));

    if (isMockMode()) {
        const store = getMockStore();
        store.roster = (store.roster || []).filter(r => !(r.event_id === eventId && !!r.sandbox_mode === currentSandboxFlag()));
        withSandbox.forEach(r => store.roster.push({ id: makeId(), ...r }));
        setMockStore(store);
        return { count: withSandbox.length };
    }

    // Delete existing roster for the event + sandbox flag
    const { error: deleteError } = await supabaseClient
        .from('roster')
        .delete()
        .eq('event_id', eventId)
        .eq('sandbox_mode', currentSandboxFlag());
    if (deleteError) throw deleteError;

    // Insert in chunks to avoid payload limits
    const chunkSize = 500;
    for (let i = 0; i < withSandbox.length; i += chunkSize) {
        const chunk = withSandbox.slice(i, i + chunkSize).map(normalizeRosterPayload);
        const { error: insertError } = await supabaseClient
            .from('roster')
            .insert(chunk);
        if (insertError) throw insertError;
    }

    return { count: withSandbox.length };
}

async function applyRosterProfileUpdates(eventId, updates) {
    if (!eventId) throw new Error('Event ID is required');
    if (!Array.isArray(updates)) throw new Error('Updates must be an array');

    if (isMockMode()) {
        const store = getMockStore();
        store.roster = (store.roster || []).map(entry => {
            const match = updates.find(u => String(u.cap_id) === String(entry.cap_id) && entry.event_id === eventId && !!entry.sandbox_mode === currentSandboxFlag());
            if (!match) return entry;
            return { ...entry, profile: match.profile };
        });
        setMockStore(store);
        return;
    }

    for (const update of updates) {
        const payload = { profile: update.profile };
        const { error } = await supabaseClient
            .from('roster')
            .update(payload)
            .eq('event_id', eventId)
            .eq('cap_id', update.cap_id)
            .eq('sandbox_mode', currentSandboxFlag());
        if (error) throw error;
    }
}

// Event upload tables (no sandbox flag)
async function uploadRegistrations(eventId, data) {
    if (!eventId) throw new Error('Event ID is required');
    if (!Array.isArray(data)) throw new Error('Data must be an array');
    if (isMockMode()) {
        const store = getMockStore();
        store.event_roster = (store.event_roster || []).filter(r => r.event_id !== eventId);
        data.forEach(r => store.event_roster.push({ id: makeId(), ...r, event_id: eventId }));
        setMockStore(store);
        return data.length;
    }
    await supabaseClient.from('event_roster').delete().eq('event_id', eventId);
    const { error } = await supabaseClient.from('event_roster').insert(data.map(r => ({ ...r, event_id: eventId })));
    if (error) throw error;
    return data.length;
}

async function uploadAccommodations(eventId, data) {
    if (!eventId) throw new Error('Event ID is required');
    if (!Array.isArray(data)) throw new Error('Data must be an array');
    if (isMockMode()) {
        const store = getMockStore();
        store.event_accommodations = (store.event_accommodations || []).filter(r => r.event_id !== eventId);
        data.forEach(r => store.event_accommodations.push({ id: makeId(), ...r, event_id: eventId }));
        setMockStore(store);
        return data.length;
    }
    await supabaseClient.from('event_accommodations').delete().eq('event_id', eventId);
    const { error } = await supabaseClient.from('event_accommodations').insert(data.map(r => ({ ...r, event_id: eventId })));
    if (error) throw error;
    return data.length;
}

async function uploadAllergies(eventId, data) {
    if (!eventId) throw new Error('Event ID is required');
    if (!Array.isArray(data)) throw new Error('Data must be an array');
    if (isMockMode()) {
        const store = getMockStore();
        store.event_allergies = (store.event_allergies || []).filter(r => r.event_id !== eventId);
        data.forEach(r => store.event_allergies.push({ id: makeId(), ...r, event_id: eventId }));
        setMockStore(store);
        return data.length;
    }
    await supabaseClient.from('event_allergies').delete().eq('event_id', eventId);
    const { error } = await supabaseClient.from('event_allergies').insert(data.map(r => ({ ...r, event_id: eventId })));
    if (error) throw error;
    return data.length;
}

async function getEventProfile(eventId, capId) {
    if (!eventId || !capId) return { roster: null, accommodations: [], allergies: [] };
    if (isMockMode()) {
        const store = getMockStore();
        const roster = (store.event_roster || []).find(r => r.event_id === eventId && String(r.cap_id) === String(capId)) || null;
        const accommodations = (store.event_accommodations || []).filter(r => r.event_id === eventId && String(r.cap_id) === String(capId));
        const allergies = (store.event_allergies || []).filter(r => r.event_id === eventId && String(r.cap_id) === String(capId));
        return { roster, accommodations, allergies };
    }
    try {
        const [{ data: roster }, { data: accommodations }, { data: allergies }] = await Promise.all([
            supabaseClient.from('event_roster').select('*').eq('event_id', eventId).eq('cap_id', capId).single().throwOnError(false),
            supabaseClient.from('event_accommodations').select('*').eq('event_id', eventId).eq('cap_id', capId),
            supabaseClient.from('event_allergies').select('*').eq('event_id', eventId).eq('cap_id', capId)
        ]);
        return {
            roster: roster || null,
            accommodations: accommodations || [],
            allergies: allergies || []
        };
    } catch (error) {
        console.error('Get event profile error:', error);
        return { roster: null, accommodations: [], allergies: [] };
    }
}

async function addEventRosterEntry(eventId, entry) {
    if (!eventId) throw new Error('Event ID is required');
    if (!entry || !entry.cap_id) throw new Error('CAP ID is required');
    if (isMockMode()) {
        const store = getMockStore();
        const record = { id: makeId(), event_id: eventId, ...entry };
        store.event_roster = store.event_roster || [];
        store.event_roster.push(record);
        setMockStore(store);
        return record;
    }
    const { data, error } = await supabaseClient
        .from('event_roster')
        .insert([{ event_id: eventId, ...entry }])
        .select()
        .single();
    if (error) throw error;
    return data;
}

async function updateRosterEntry(entry) {
    try {
        if (isMockMode()) {
            const store = getMockStore();
            const idx = store.roster.findIndex(r => r.id === entry.id);
            if (idx === -1) throw new Error('Roster entry not found');
            const before = { ...store.roster[idx] };
            store.roster[idx] = { ...store.roster[idx], ...entry };
            setMockStore(store);
            logAuditEntry({
                action: 'update',
                entityType: 'roster',
                entityId: entry.id,
                entityName: store.roster[idx].name || `${store.roster[idx].lastName || ''} ${store.roster[idx].firstName || ''}`.trim(),
                details: { before, updates: entry, after: store.roster[idx] }
            });
            return store.roster[idx];
        }
        const { id, ...payloadRaw } = entry || {};
        const payload = normalizeRosterPayload(payloadRaw);
        const { data, error } = await supabaseClient
            .from('roster')
            .update(payload)
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        return {
            ...data,
            firstName: data.firstName != null ? data.firstName : data.firstname,
            lastName: data.lastName != null ? data.lastName : data.lastname
        };
    } catch (error) {
        console.error('Update roster error:', error);
        throw error;
    }
}


async function createLocation(locationData) {
    try {
        if (isMockMode()) {
            const store = getMockStore();
            const record = { id: makeId(), ...locationData, sandbox_mode: currentSandboxFlag() };
            store.locations.push(record);
            setMockStore(store);
            logAuditEntry({
                action: 'create',
                entityType: 'location',
                entityId: record.id,
                entityName: record.name || '',
                details: { record }
            });
            return record;
        }
        const { data, error } = await supabaseClient
            .from('locations')
            .insert([{ ...locationData, sandbox_mode: currentSandboxFlag() }])
            .select()
            .single();
        if (error) throw error;
        return data;
    } catch (error) {
        console.error('Create location error:', error);
        throw error;
    }
}

async function updateLocation(id, updates) {
    try {
        if (isMockMode()) {
            const store = getMockStore();
            const idx = store.locations.findIndex(l => l.id === id);
            if (idx === -1) throw new Error('Location not found');
            const before = { ...store.locations[idx] };
            store.locations[idx] = { ...store.locations[idx], ...updates };
            setMockStore(store);
            logAuditEntry({
                action: 'update',
                entityType: 'location',
                entityId: id,
                entityName: store.locations[idx].name || '',
                details: { before, updates, after: store.locations[idx] }
            });
            return store.locations[idx];
        }
        const { data, error } = await supabaseClient
            .from('locations')
            .update(updates)
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        return data;
    } catch (error) {
        console.error('Update location error:', error);
        throw error;
    }
}

async function deleteLocation(id) {
    try {
        if (isMockMode()) {
            const store = getMockStore();
            const removed = store.locations.find(l => l.id === id);
            store.locations = store.locations.filter(l => l.id !== id);
            setMockStore(store);
            logAuditEntry({
                action: 'delete',
                entityType: 'location',
                entityId: id,
                entityName: removed?.name || '',
                details: { record: removed || null }
            });
            return true;
        }
        const { error } = await supabaseClient
            .from('locations')
            .delete()
            .eq('id', id);
        if (error) throw error;
        return true;
    } catch (error) {
        console.error('Delete location error:', error);
        throw error;
    }
}

// ==================== LOG FUNCTIONS ====================

async function getSupportTickets() {
    try {
        if (isMockMode()) {
            const store = getMockStore();
            const data = Array.isArray(store.supportTickets) ? store.supportTickets : [];
            return filterBySandbox(data);
        }
        return [];
    } catch (error) {
        console.error('Get support tickets error:', error);
        return [];
    }
}

async function addSupportTicket(ticket) {
    try {
        if (isMockMode()) {
            const store = getMockStore();
            const record = {
                id: makeId(),
                status: 'open',
                created_at: new Date().toISOString(),
                ...ticket,
                sandbox_mode: currentSandboxFlag()
            };
            store.supportTickets = Array.isArray(store.supportTickets) ? store.supportTickets : [];
            store.supportTickets.push(record);
            setMockStore(store);
            logAuditEntry({
                action: 'create',
                entityType: 'support_ticket',
                entityId: record.id,
                entityName: record.subject || '',
                details: { record }
            });
            return record;
        }
        return null;
    } catch (error) {
        console.error('Add support ticket error:', error);
        throw error;
    }
}

async function resolveSupportTicket(ticketId, resolution) {
    try {
        if (isMockMode()) {
            const store = getMockStore();
            const idx = store.supportTickets.findIndex(t => t.id === ticketId);
            if (idx === -1) throw new Error('Support ticket not found');
            const before = { ...store.supportTickets[idx] };
            store.supportTickets[idx] = {
                ...store.supportTickets[idx],
                status: 'closed',
                closed_at: new Date().toISOString(),
                ...resolution
            };
            setMockStore(store);
            logAuditEntry({
                action: 'resolve',
                entityType: 'support_ticket',
                entityId: ticketId,
                entityName: store.supportTickets[idx].subject || '',
                details: { before, after: store.supportTickets[idx] }
            });
            return store.supportTickets[idx];
        }
        return null;
    } catch (error) {
        console.error('Resolve support ticket error:', error);
        throw error;
    }
}

async function getLogs() {
    try {
        if (isMockMode()) {
            const store = getMockStore();
            const data = Array.isArray(store.logs) ? store.logs : [];
            return filterBySandbox(data);
        }
        const { data, error } = await supabaseClient
            .from('logs')
            .select('*')
            .eq('sandbox_mode', currentSandboxFlag())
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Get logs error:', error);
        return [];
    }
}

function logAuditEntry({ action, entityType, entityId, entityName, details }) {
    if (!isMockMode()) {
        try {
            const actor = currentUser || {};
            const entry = {
                type: 'audit',
                action: action || 'update',
                entity_type: entityType || 'unknown',
                entity_id: entityId || '',
                entity_name: entityName || '',
                details: details || {},
                actor_cap_id: actor.cap_id || '',
                actor_name: actor.name || '',
                actor_rank: actor.rank || '',
                actor_role: actor.role || '',
                cap_id: actor.cap_id || '',
                name: actor.name || '',
                rank: actor.rank || '',
                message: `${action || 'update'} ${entityType || 'unknown'}`
            };
            addLogEntry(entry).catch((err) => console.error('Audit log insert error:', err));
        } catch (error) {
            console.error('Audit log error:', error);
        }
        return;
    }
    try {
        const store = getMockStore();
        const actor = currentUser || {};
        const rosterMatch = (store.roster || []).find(r => String(r.cap_id) === String(actor.cap_id));
        const personnelMatch = (store.personnel || []).find(p => String(p.cap_id) === String(actor.cap_id));
        const actorName = rosterMatch?.name || rosterMatch?.fullName || personnelMatch?.name || '';
        const actorRank = rosterMatch?.rank || personnelMatch?.rank || '';
        const entry = {
            id: makeId(),
            type: 'audit',
            action: action || 'update',
            entity_type: entityType || 'unknown',
            entity_id: entityId || '',
            entity_name: entityName || '',
            details: details || {},
            actor_cap_id: actor.cap_id || '',
            actor_name: actorName,
            actor_rank: actorRank,
            actor_role: actor.role || '',
            created_at: new Date().toISOString(),
            sandbox_mode: currentSandboxFlag()
        };
        store.logs = Array.isArray(store.logs) ? store.logs : [];
        store.logs.push(entry);
        setMockStore(store);
    } catch (error) {
        console.error('Audit log error:', error);
    }
}

async function addLogEntry(entry) {
    try {
        if (isMockMode()) {
            const store = getMockStore();
            const record = {
                id: makeId(),
                type: entry.type || 'note',
                created_at: entry.created_at || new Date().toISOString(),
                sandbox_mode: currentSandboxFlag(),
                ...entry
            };
            store.logs = Array.isArray(store.logs) ? store.logs : [];
            store.logs.push(record);
            setMockStore(store);
            return record;
        }
        const payload = {
            type: entry.type || 'note',
            action: entry.action || null,
            entity_type: entry.entity_type || null,
            entity_id: entry.entity_id || null,
            entity_name: entry.entity_name || null,
            details: entry.details || {},
            cap_id: entry.cap_id || null,
            name: entry.name || null,
            rank: entry.rank || null,
            actor_cap_id: entry.actor_cap_id || null,
            actor_name: entry.actor_name || null,
            actor_rank: entry.actor_rank || null,
            actor_role: entry.actor_role || null,
            message: entry.message || null,
            created_at: entry.created_at || new Date().toISOString(),
            sandbox_mode: currentSandboxFlag()
        };
        const { data, error } = await supabaseClient
            .from('logs')
            .insert([payload])
            .select()
            .single();
        if (error) throw error;
        return data;
    } catch (error) {
        console.error('Add log error:', error);
        throw error;
    }
}

async function clearLogs() {
    try {
        if (isMockMode()) {
            const store = getMockStore();
            store.logs = [];
            setMockStore(store);
            return true;
        }
        const { error } = await supabaseClient
            .from('logs')
            .delete()
            .eq('sandbox_mode', currentSandboxFlag());
        if (error) throw error;
        return true;
    } catch (error) {
        console.error('Clear logs error:', error);
        throw error;
    }
}

// ==================== MIGRATION UTILITIES ====================

async function pushMockDataToSupabase() {
    if (isMockMode()) {
        throw new Error('Disable mock mode before pushing to Supabase.');
    }
    if (!supabaseClient) {
        throw new Error('Supabase client not initialized.');
    }

    const raw = localStorage.getItem(MOCK_STORAGE_KEY_BASE);
    if (!raw) {
        throw new Error('No local mock data found.');
    }

    const store = JSON.parse(raw);
    const withSandbox = (items) => (Array.isArray(items) ? items.map(item => ({ ...item, sandbox_mode: true })) : []);

    const roles = Array.isArray(store.roles) ? store.roles.map(name => ({ name })) : [];
    const users = withSandbox(store.users);
    const events = withSandbox(store.events);
    const locations = withSandbox(store.locations);
    const assets = withSandbox(store.assets);
    const personnel = withSandbox(store.personnel);
    const activities = withSandbox(store.activities);
    const roster = withSandbox(store.roster);
    const logs = withSandbox(store.logs);
    const supportTickets = withSandbox(store.supportTickets);

    const upsertById = async (table, rows) => {
        if (!rows.length) return;
        const { error } = await supabaseClient
            .from(table)
            .upsert(rows, { onConflict: 'id' });
        if (error) throw error;
    };

    if (roles.length) {
        const { error } = await supabaseClient
            .from('roles')
            .upsert(roles, { onConflict: 'name' });
        if (error) throw error;
    }

    await upsertById('users', users);
    await upsertById('events', events);
    await upsertById('locations', locations);
    await upsertById('assets', assets);
    await upsertById('personnel', personnel);
    await upsertById('activities', activities);
    await upsertById('roster', roster);
    await upsertById('logs', logs);
    await upsertById('support_tickets', supportTickets);

    return {
        events: events.length,
        activities: activities.length,
        assets: assets.length,
        personnel: personnel.length,
        locations: locations.length,
        roster: roster.length,
        logs: logs.length,
        supportTickets: supportTickets.length
    };
}

// ==================== ASSIGNMENT FUNCTIONS ====================

async function assignPersonnelToActivity(personnelId, activityId, role, _durationMinutes, assignmentStart, assignmentEnd, autoDriver, assetId) {
    try {
        if (isMockMode()) {
            const store = getMockStore();
            const activity = store.activities.find(a => a.id === activityId);
            if (!activity) throw new Error('Record not found');
            activity.assigned_personnel = activity.assigned_personnel || [];
            activity.assigned_personnel.push({ personnel_id: personnelId, role, assignment_start_time: assignmentStart || '', assignment_end_time: assignmentEnd || '', auto_driver: autoDriver || false, asset_id: assetId || '' });

            setMockStore(store);
            logAuditEntry({
                action: 'assign',
                entityType: 'activity_personnel',
                entityId: activityId,
                entityName: activity.title || activity.name || '',
                details: {
                    personnel_id: personnelId,
                    role,
                    assignment_start_time: assignmentStart || '',
                    assignment_end_time: assignmentEnd || '',
                    auto_driver: autoDriver || false,
                    asset_id: assetId || ''
                }
            });
            return true;
        }
        // Update activity
        const activity = await supabaseClient
            .from('activities')
            .select('assigned_personnel')
            .eq('id', activityId)
            .single();

        const currentAssignments = activity.data.assigned_personnel || [];
        const updated = [...currentAssignments, { personnel_id: personnelId, role, assignment_start_time: assignmentStart || '', assignment_end_time: assignmentEnd || '', auto_driver: autoDriver || false, asset_id: assetId || '' }];
        await updateActivity(activityId, {
            assigned_personnel: updated
        });

        return true;
    } catch (error) {
        console.error('Assign personnel to activity error:', error);
        throw error;
    }
}

async function assignPersonnelToAsset(personnelId, assetId, role, assignmentDate, assignmentStart, assignmentEnd) {
    try {
        if (isMockMode()) {
            const store = getMockStore();
            const person = store.personnel.find(p => p.id === personnelId);
            const asset = store.assets.find(a => a.id === assetId);
            if (!person || !asset) throw new Error('Record not found');

            person.assigned_to = assetId;
            person.status = 'assigned';
            asset.assigned_personnel = asset.assigned_personnel || [];
            const exists = asset.assigned_personnel.some(entry => {
                if (typeof entry === 'string') return entry === personnelId;
                return entry.personnel_id === personnelId;
            });
            if (!exists) {
                asset.assigned_personnel.push({
                    personnel_id: personnelId,
                    role: role || 'Driver',
                    assignment_date: assignmentDate || '',
                    assignment_start_time: assignmentStart || '',
                    assignment_end_time: assignmentEnd || ''
                });
            }

            setMockStore(store);
            logAuditEntry({
                action: 'assign',
                entityType: 'asset_personnel',
                entityId: assetId,
                entityName: asset.name || asset.type || '',
                details: {
                    personnel_id: personnelId,
                    role: role || 'Driver',
                    assignment_date: assignmentDate || '',
                    assignment_start_time: assignmentStart || '',
                    assignment_end_time: assignmentEnd || ''
                }
            });
            return true;
        }
        // Update personnel
        await updatePersonnel(personnelId, {
            assigned_to: assetId,
            status: 'assigned'
        });

        // Update asset
        const asset = await supabaseClient
            .from('assets')
            .select('assigned_personnel')
            .eq('id', assetId)
            .single();

        const currentAssignments = asset.data.assigned_personnel || [];
        await updateAsset(assetId, {
            assigned_personnel: [...currentAssignments, {
                personnel_id: personnelId,
                role: role || 'Driver',
                assignment_date: assignmentDate || '',
                assignment_start_time: assignmentStart || '',
                assignment_end_time: assignmentEnd || ''
            }]
        });

        return true;
    } catch (error) {
        console.error('Assign personnel to asset error:', error);
        throw error;
    }
}

async function assignAssetToActivity(assetId, activityId, type, _durationMinutes, assignmentStart, assignmentEnd) {
    try {
        if (isMockMode()) {
            const store = getMockStore();
            const activity = store.activities.find(a => a.id === activityId);
            if (!activity) throw new Error('Record not found');
            activity.assigned_assets = activity.assigned_assets || [];
            activity.assigned_assets.push({ asset_id: assetId, type, assignment_start_time: assignmentStart || '', assignment_end_time: assignmentEnd || '' });

            setMockStore(store);
            logAuditEntry({
                action: 'assign',
                entityType: 'activity_asset',
                entityId: activityId,
                entityName: activity.title || activity.name || '',
                details: { asset_id: assetId, type, assignment_start_time: assignmentStart || '', assignment_end_time: assignmentEnd || '' }
            });
            return true;
        }
        // Update activity
        const activity = await supabaseClient
            .from('activities')
            .select('assigned_assets')
            .eq('id', activityId)
            .single();

        const currentAssignments = activity.data.assigned_assets || [];
        await updateActivity(activityId, {
            assigned_assets: [...currentAssignments, { asset_id: assetId, type, assignment_start_time: assignmentStart || '', assignment_end_time: assignmentEnd || '' }]
        });

        return true;
    } catch (error) {
        console.error('Assign asset to activity error:', error);
        throw error;
    }
}

async function unassignPersonnel(personnelId) {
    try {
        if (isMockMode()) {
            const store = getMockStore();
            const person = store.personnel.find(p => p.id === personnelId);
            if (!person) throw new Error('Personnel not found');

            const assignedTo = person.assigned_to;
            person.assigned_to = null;
            person.status = 'available';

            if (assignedTo) {
            const activity = store.activities.find(a => a.id === assignedTo);
            if (activity) {
                activity.assigned_personnel = (activity.assigned_personnel || []).filter(entry => {
                    if (typeof entry === 'string') return entry !== personnelId;
                    return entry.personnel_id !== personnelId;
                });
            } else {
                const asset = store.assets.find(a => a.id === assignedTo);
                if (asset) {
                    asset.assigned_personnel = (asset.assigned_personnel || []).filter(id => id !== personnelId);
                }
            }
            }

            setMockStore(store);
            return true;
        }
        const person = await supabaseClient
            .from('personnel')
            .select('assigned_to')
            .eq('id', personnelId)
            .single();

        const assignedTo = person.data.assigned_to;

        // Update personnel
        await updatePersonnel(personnelId, {
            assigned_to: null,
            status: 'available'
        });

        if (assignedTo) {
            // Try to remove from activity
        const activity = await supabaseClient
            .from('activities')
            .select('assigned_personnel')
            .eq('id', assignedTo)
            .single();

        if (activity.data) {
            const newAssignments = (activity.data.assigned_personnel || []).filter(entry => {
                if (typeof entry === 'string') return entry !== personnelId;
                return entry.personnel_id !== personnelId;
            });
            await updateActivity(assignedTo, { assigned_personnel: newAssignments });
        } else {
                // Try to remove from asset
            const asset = await supabaseClient
                .from('assets')
                .select('assigned_personnel')
                .eq('id', assignedTo)
                .single();

            if (asset.data) {
                const newAssignments = (asset.data.assigned_personnel || []).filter(id => id !== personnelId);
                await updateAsset(assignedTo, { assigned_personnel: newAssignments });
            }
            }
        }

        return true;
    } catch (error) {
        console.error('Unassign personnel error:', error);
        throw error;
    }
}

async function unassignAsset(assetId) {
    try {
        if (isMockMode()) {
            const store = getMockStore();
            const asset = store.assets.find(a => a.id === assetId);
            if (!asset) throw new Error('Asset not found');

            const assignedTo = asset.assigned_to;
            asset.assigned_to = null;
            asset.status = 'available';

            if (assignedTo) {
            const activity = store.activities.find(a => a.id === assignedTo);
            if (activity) {
                activity.assigned_assets = (activity.assigned_assets || []).filter(entry => {
                    if (typeof entry === 'string') return entry !== assetId;
                    return entry.asset_id !== assetId;
                });
            }
            }

            setMockStore(store);
            return true;
        }
        const asset = await supabaseClient
            .from('assets')
            .select('assigned_to')
            .eq('id', assetId)
            .single();

        const assignedTo = asset.data.assigned_to;

        // Update asset
        await updateAsset(assetId, {
            assigned_to: null,
            status: 'available'
        });

        if (assignedTo) {
            // Remove from activity
        const activity = await supabaseClient
            .from('activities')
            .select('assigned_assets')
            .eq('id', assignedTo)
            .single();

        if (activity.data) {
            const newAssignments = (activity.data.assigned_assets || []).filter(entry => {
                if (typeof entry === 'string') return entry !== assetId;
                return entry.asset_id !== assetId;
            });
            await updateActivity(assignedTo, { assigned_assets: newAssignments });
        }
        }

        return true;
    } catch (error) {
        console.error('Unassign asset error:', error);
        throw error;
    }
}

// Expose functions explicitly for safety in all script contexts
window.initSupabase = initSupabase;
window.loginUser = loginUser;
window.logoutUser = logoutUser;
window.getCurrentUser = getCurrentUser;
window.isAdmin = isAdmin;
window.isStaff = isStaff;
window.isPrivileged = isPrivileged;
window.getEvents = getEvents;
window.getEvent = getEvent;
window.createEvent = createEvent;
window.updateEvent = updateEvent;
window.deleteEvent = deleteEvent;
window.getActivities = getActivities;
window.createActivity = createActivity;
window.updateActivity = updateActivity;
window.deleteActivity = deleteActivity;
window.getAssets = getAssets;
window.createAsset = createAsset;
window.updateAsset = updateAsset;
window.deleteAsset = deleteAsset;
window.getUsers = getUsers;
window.updateUserRole = updateUserRole;
window.createNewUser = createNewUser;
window.userExists = userExists;
window.deleteUser = deleteUser;
window.getAssignmentsForRoom = getAssignmentsForRoom;
window.getPersonnel = getPersonnel;
window.getLocations = getLocations;
window.getRoster = getRoster;
window.getRoles = getRoles;
window.getLogs = getLogs;
window.addLogEntry = addLogEntry;
window.clearLogs = clearLogs;
window.replaceRosterForEvent = replaceRosterForEvent;
window.applyRosterProfileUpdates = applyRosterProfileUpdates;
window.uploadRegistrations = uploadRegistrations;
window.uploadAccommodations = uploadAccommodations;
window.uploadAllergies = uploadAllergies;
window.getEventProfile = getEventProfile;
window.addEventRosterEntry = addEventRosterEntry;
window.pushMockDataToSupabase = pushMockDataToSupabase;
window.getSupportTickets = getSupportTickets;
window.addSupportTicket = addSupportTicket;
window.getBuildingsForEvent = getBuildingsForEvent;
window.createBuilding = createBuilding;
window.updateBuilding = updateBuilding;
window.deleteBuilding = deleteBuilding;
window.getFloorsForBuilding = getFloorsForBuilding;
window.createFloor = createFloor;
window.getRoomsForFloor = getRoomsForFloor;
window.createRoomsWithBunks = createRoomsWithBunks;
window.deleteRoom = deleteRoom;
window.getBunksForRoom = getBunksForRoom;
window.assignBunkToCadet = assignBunkToCadet;
window.removeBedAssignment = removeBedAssignment;
window.getBilletingAssignment = getBilletingAssignment;
window.getOrgChartPositionsByEvent = getOrgChartPositionsByEvent;
window.createOrgChartPosition = createOrgChartPosition;
window.updateOrgChartPosition = updateOrgChartPosition;
window.deleteOrgChartPosition = deleteOrgChartPosition;
window.resolveSupportTicket = resolveSupportTicket;
window.getPersonnel = getPersonnel;
window.createPersonnel = createPersonnel;
window.updatePersonnel = updatePersonnel;
window.deletePersonnel = deletePersonnel;
window.getLocations = getLocations;
window.createLocation = createLocation;
window.updateLocation = updateLocation;
window.deleteLocation = deleteLocation;
window.seedMockData = seedMockData;
window.seedMockActivities = seedMockActivities;
window.assignPersonnelToActivity = assignPersonnelToActivity;
window.assignPersonnelToAsset = assignPersonnelToAsset;
window.assignAssetToActivity = assignAssetToActivity;
window.unassignPersonnel = unassignPersonnel;
window.unassignAsset = unassignAsset;

// ==================== INPROCESSING STATION FUNCTIONS ====================

async function getStations(eventId) {
    try {
        if (isMockMode()) {
            const store = getMockStore();
            return (store.events || []).length ? filterBySandbox((store.inprocessing_stations || []).filter(s => s.event_id === eventId)) : [];
        }
        const { data, error } = await supabaseClient
            .from('inprocessing_stations')
            .select('*')
            .eq('event_id', eventId)
            .order('station_order', { ascending: true });
        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Get stations error:', error);
        return [];
    }
}

async function getAllStations() {
    try {
        if (isMockMode()) {
            const store = getMockStore();
            return store.inprocessing_stations || [];
        }
        const { data, error } = await supabaseClient
            .from('inprocessing_stations')
            .select('*')
            .order('event_id', { ascending: true })
            .order('station_order', { ascending: true });
        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Get all stations error:', error);
        return [];
    }
}

window.getAllStations = getAllStations;

async function createStation(stationData) {
    try {
        if (isMockMode()) {
            const store = getMockStore();
            const record = { id: makeId(), ...stationData, created_at: new Date().toISOString(), sandbox_mode: currentSandboxFlag() };
            store.inprocessing_stations = store.inprocessing_stations || [];
            store.inprocessing_stations.push(record);
            setMockStore(store);
            return record;
        }
        const { data, error } = await supabaseClient
            .from('inprocessing_stations')
            .insert([stationData])
            .select()
            .single();
        if (error) throw error;
        return data;
    } catch (error) {
        console.error('Create station error:', error);
        throw error;
    }
}

async function updateStation(id, updates) {
    try {
        if (isMockMode()) {
            const store = getMockStore();
            store.inprocessing_stations = store.inprocessing_stations || [];
            const idx = store.inprocessing_stations.findIndex(s => s.id === id);
            if (idx === -1) throw new Error('Station not found');
            store.inprocessing_stations[idx] = { ...store.inprocessing_stations[idx], ...updates };
            setMockStore(store);
            return store.inprocessing_stations[idx];
        }
        const { data, error } = await supabaseClient
            .from('inprocessing_stations')
            .update(updates)
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        return data;
    } catch (error) {
        console.error('Update station error:', error);
        throw error;
    }
}

async function deleteStation(id) {
    try {
        if (isMockMode()) {
            const store = getMockStore();
            store.inprocessing_stations = (store.inprocessing_stations || []).filter(s => s.id !== id);
            setMockStore(store);
            return true;
        }
        const { error } = await supabaseClient
            .from('inprocessing_stations')
            .delete()
            .eq('id', id);
        if (error) throw error;
        return true;
    } catch (error) {
        console.error('Delete station error:', error);
        throw error;
    }
}

async function checkInPersonnel(stationId, personnelId, checkedInBy) {
    try {
        if (isMockMode()) {
            const store = getMockStore();
            store.inprocessing_checkins = store.inprocessing_checkins || [];
            const record = { id: makeId(), station_id: stationId, personnel_id: personnelId, checked_in_by: checkedInBy || '', checked_in_at: new Date().toISOString(), sandbox_mode: currentSandboxFlag() };
            store.inprocessing_checkins.push(record);
            setMockStore(store);
            return record;
        }
        const { data, error } = await supabaseClient
            .from('inprocessing_checkins')
            .insert([{ station_id: stationId, personnel_id: personnelId, checked_in_by: checkedInBy }])
            .select()
            .single();
        if (error) throw error;
        return data;
    } catch (error) {
        console.error('Check in personnel error:', error);
        throw error;
    }
}

async function getCheckins(stationId) {
    try {
        if (isMockMode()) {
            const store = getMockStore();
            return (store.inprocessing_checkins || []).filter(c => c.station_id === stationId);
        }
        const { data, error } = await supabaseClient
            .from('inprocessing_checkins')
            .select('*')
            .eq('station_id', stationId);
        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Get checkins error:', error);
        return [];
    }
}

// expose inprocessing functions
window.getStations = getStations;
window.createStation = createStation;
window.updateStation = updateStation;
window.deleteStation = deleteStation;
window.checkInPersonnel = checkInPersonnel;
window.getCheckins = getCheckins;





















function normalizeRosterPayload(entry) {
    const payload = { ...(entry || {}) };
    if (payload.firstName != null && payload.firstname == null) {
        payload.firstname = payload.firstName;
        delete payload.firstName;
    }
    if (payload.lastName != null && payload.lastname == null) {
        payload.lastname = payload.lastName;
        delete payload.lastName;
    }
    return payload;
}
