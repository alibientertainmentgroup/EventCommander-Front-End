# CAP Event Command System

A comprehensive event management system for Civil Air Patrol operations featuring resource tracking, personnel management, and mission planning.

## Features

- ✅ **Authentication**: CAP ID-only login system
- ✅ **Role-Based Access**: Admin and user roles with different permissions
- ✅ **Event Management**: Create and track master events with sub-activities
- ✅ **Resource Tracking**: Manage assets and personnel availability
- ✅ **Assignment System**: Assign personnel to assets or activities
- ✅ **Kanban Board**: Drag-and-drop activity tracking (Planning → In Progress → Completed)
- ✅ **Real-Time Metrics**: Dashboard with live statistics
- ✅ **Mobile Optimized**: Fully responsive design
- ✅ **Multi-Device**: Works across all devices with persistent data

## Tech Stack

- **Frontend**: Plain HTML, CSS, JavaScript
- **Database**: Supabase (PostgreSQL)
- **Hosting**: BlueHost (or any web host)
- **Cost**: 100% FREE

## Setup Instructions

### 1. Create Supabase Account

1. Go to https://supabase.com
2. Click "Start your project"
3. Sign up with your email (no credit card required)
4. Create a new project
   - Choose a project name (e.g., "cap-event-system")
   - Create a strong database password (SAVE THIS!)
   - Select a region close to you
   - Click "Create new project"
5. Wait 2-3 minutes for your database to be created

### 2. Get Your Supabase Credentials

1. In your Supabase dashboard, click on your project
2. Go to **Settings** (gear icon) → **API**
3. Copy these two values:
   - **Project URL** (looks like: https://xxxxx.supabase.co)
   - **anon public** key (under "Project API keys")

### 3. Configure the Application

1. Open the `js/config.js` file
2. Replace the placeholders with your actual credentials:

```javascript
const SUPABASE_CONFIG = {
    url: 'https://xxxxx.supabase.co',  // Your Project URL
    anonKey: 'your-anon-key-here'      // Your anon public key
};
```

3. **IMPORTANT**: Never share these credentials publicly or commit them to GitHub!

### 4. Create Database Tables

1. In your Supabase dashboard, go to **SQL Editor** (in the left sidebar)
2. Click "New query"
3. Copy and paste the SQL code below
4. Click "Run" (or press Ctrl+Enter)

```sql
-- Users table
CREATE TABLE users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    cap_id TEXT UNIQUE NOT NULL,
    role TEXT DEFAULT 'user',
    name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Events table
CREATE TABLE events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    personnel_needed INTEGER DEFAULT 0,
    assets_needed INTEGER DEFAULT 0,
    status TEXT DEFAULT 'upcoming',
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    assigned_personnel TEXT[] DEFAULT '{}',
    assigned_assets TEXT[] DEFAULT '{}'
);

-- Activities table
CREATE TABLE activities (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    event_id UUID REFERENCES events(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    column TEXT DEFAULT 'Planning',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    assigned_personnel TEXT[] DEFAULT '{}',
    assigned_assets TEXT[] DEFAULT '{}'
);

-- Assets table
CREATE TABLE assets (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    details TEXT,
    status TEXT DEFAULT 'available',
    assigned_to TEXT,
    assigned_personnel TEXT[] DEFAULT '{}'
);

-- Personnel table
CREATE TABLE personnel (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    cap_id TEXT NOT NULL,
    rank TEXT,
    specialties TEXT,
    status TEXT DEFAULT 'available',
    assigned_to TEXT
);

-- Enable Row Level Security (RLS)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE personnel ENABLE ROW LEVEL SECURITY;

-- Create policies to allow access (these are permissive for simplicity)
-- In production, you'd want more restrictive policies

CREATE POLICY "Allow all for users" ON users FOR ALL USING (true);
CREATE POLICY "Allow all for events" ON events FOR ALL USING (true);
CREATE POLICY "Allow all for activities" ON activities FOR ALL USING (true);
CREATE POLICY "Allow all for assets" ON assets FOR ALL USING (true);
CREATE POLICY "Allow all for personnel" ON personnel FOR ALL USING (true);
```

5. You should see "Success. No rows returned" - this is correct!

### 5. Create Your First Admin User

1. Go to **SQL Editor** again
2. Run this query (replace with YOUR CAP ID):

```sql
INSERT INTO users (cap_id, role, name)
VALUES ('YOUR_CAP_ID_HERE', 'admin', 'Your Name');
```

Example:
```sql
INSERT INTO users (cap_id, role, name)
VALUES ('123456', 'admin', 'John Smith');
```

### 6. Upload to BlueHost

1. Log into your BlueHost cPanel
2. Open **File Manager**
3. Navigate to `public_html` (or your domain's root folder)
4. Create a new folder (e.g., `event-system`)
5. Upload ALL files from the `cap-event-system` folder:
   - `index.html`
   - `css/` folder with `styles.css`
   - `js/` folder with all JavaScript files

### 7. Test Your Application

1. Open your browser and go to: `https://yourdomain.com/event-system/`
2. Login with your CAP ID
3. You should see the dashboard!

## File Structure

```
cap-event-system/
├── index.html              # Main HTML file
├── css/
│   └── styles.css          # All styles (command center theme)
├── js/
│   ├── config.js           # Supabase credentials (UPDATE THIS!)
│   ├── supabase-client.js  # Database functions
│   ├── components.js       # UI rendering components
│   └── app.js              # Main application logic
└── README.md               # This file
```

## Usage Guide

### For Admins

**Dashboard**
- View real-time metrics (active events, personnel availability, etc.)
- Click on any event card to view details

**Events**
- Click "NEW EVENT" to create a master event
- Specify personnel and assets needed
- Change event status (Upcoming → Active → Completed)
- Click an event to view details and manage activities

**Activities** (within an event)
- Add sub-activities to events
- Drag cards between columns: Planning → In Progress → Completed
- Assign personnel and assets to activities

**Assets**
- Add vehicles, equipment, etc.
- Assign assets to activities
- Assign personnel to assets (e.g., drivers)
- View available vs. assigned resources

**Personnel**
- Add team members with CAP IDs
- Assign to assets or activities
- Track specialties (Medical, Communications, etc.)
- View availability status

### For Regular Users

- View only events you're assigned to
- See dashboard metrics for your events
- View event details and activities
- Cannot create, edit, or delete resources

## Troubleshooting

### "Failed to connect to database"
- Check that your `config.js` has the correct URL and anon key
- Make sure you copied the **anon public** key, not the service_role key

### "No data loading"
- Verify you ran all the SQL commands to create tables
- Check browser console (F12) for error messages
- Make sure Row Level Security policies were created

### "Login not working"
- Make sure you created your admin user in the database
- Verify the CAP ID matches exactly (case-sensitive)

### "Can't upload to BlueHost"
- Make sure you're uploading to the correct directory
- Check file permissions (should be 644 for files, 755 for folders)
- Contact BlueHost support if file manager isn't working

## Customization

### Change Colors
Edit `css/styles.css` - all colors are defined in CSS variables at the top:
```css
:root {
    --blue-primary: #3b82f6;  /* Main blue color */
    --primary-bg: #0f172a;    /* Background color */
    /* etc. */
}
```

### Add More Admin Users
Run this SQL in Supabase:
```sql
UPDATE users SET role = 'admin' WHERE cap_id = 'THEIR_CAP_ID';
```

### Modify Activity Columns
Edit the columns in `js/app.js` - search for `['Planning', 'In Progress', 'Completed']`

## Security Notes

- **DO NOT** commit `config.js` with real credentials to public repositories
- The anon key is safe to use in frontend code (it's public)
- Row Level Security (RLS) is enabled but uses permissive policies for simplicity
- For production use, implement stricter RLS policies based on user roles

## Support

If you need help:
1. Check the browser console (F12) for error messages
2. Verify all setup steps were completed
3. Check Supabase dashboard logs
4. Review this README thoroughly

## Future Enhancements

Possible additions:
- Email notifications
- Export reports to PDF
- Calendar integration
- File attachments
- Real-time collaboration
- Mobile app version

## License

This project is provided as-is for Civil Air Patrol operations.

---

**Built with ❤️ for CAP Mission Planning**
