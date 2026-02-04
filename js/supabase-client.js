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

async function loginUser(capId) {
    try {
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

        // Create user if doesn't exist
        if (!existingUser) {
            const { data: newUser, error: insertError } = await supabaseClient
                .from('users')
                .insert([{ 
                    cap_id: capId, 
                    role: 'user',
                    name: `User ${capId}`,
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
        throw error;
    }
}

function getCurrentUser() {
    return currentUser;
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
        let query = supabaseClient.from('activities').select('*').eq('sandbox_mode', currentSandboxFlag());
        
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
        return data || [];
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
                .update({ role })
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
        return null;
    } catch (error) {
        console.error('Add roster error:', error);
        throw error;
    }
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
        return null;
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
        return [];
    } catch (error) {
        console.error('Get logs error:', error);
        return [];
    }
}

function logAuditEntry({ action, entityType, entityId, entityName, details }) {
    if (!isMockMode()) return;
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
        return null;
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
        return false;
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
            const exists = activity.assigned_personnel.some(entry => {
                if (typeof entry === 'string') return entry === personnelId;
                return entry.personnel_id === personnelId;
            });
            if (exists) return false;
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
        const exists = currentAssignments.some(entry => {
            if (typeof entry === 'string') return entry === personnelId;
            return entry.personnel_id === personnelId;
        });
        if (exists) return false;
        await updateActivity(activityId, {
            assigned_personnel: [...currentAssignments, { personnel_id: personnelId, role, assignment_start_time: assignmentStart || '', assignment_end_time: assignmentEnd || '', auto_driver: autoDriver || false, asset_id: assetId || '' }]
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
window.getPersonnel = getPersonnel;
window.getLocations = getLocations;
window.getRoster = getRoster;
window.getRoles = getRoles;
window.getLogs = getLogs;
window.addLogEntry = addLogEntry;
window.clearLogs = clearLogs;
window.pushMockDataToSupabase = pushMockDataToSupabase;
window.getSupportTickets = getSupportTickets;
window.addSupportTicket = addSupportTicket;
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





















