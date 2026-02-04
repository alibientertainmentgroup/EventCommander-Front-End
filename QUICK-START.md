# 🚀 QUICK START GUIDE - CAP Event Command System

## Step-by-Step Setup (10 minutes)

### ⏱️ Step 1: Create Supabase Account (2 min)
1. Go to **https://supabase.com**
2. Click **"Start your project"**
3. Sign up with email (no credit card)
4. Create new project:
   - Name: `cap-event-system`
   - Password: (make it strong, SAVE IT!)
   - Region: Choose closest to you
5. Wait 2-3 minutes for setup

### 🔑 Step 2: Get Your Credentials (1 min)
1. In Supabase dashboard, go to **Settings** → **API**
2. Copy these TWO values:
   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon public key**: Long string starting with `eyJ...`

### ⚙️ Step 3: Configure Your App (1 min)
1. Open `js/config.js` in VS Code
2. Replace the placeholders:
```javascript
const SUPABASE_CONFIG = {
    url: 'PASTE_YOUR_PROJECT_URL_HERE',
    anonKey: 'PASTE_YOUR_ANON_KEY_HERE'
};
```
3. Save the file

### 🗄️ Step 4: Create Database (2 min)
1. In Supabase dashboard, click **SQL Editor** (left sidebar)
2. Click **"New query"**
3. Open the `database-setup.sql` file
4. **Copy the ENTIRE contents** and paste into SQL Editor
5. Click **"Run"** (or Ctrl+Enter)
6. You should see: "Success. No rows returned" ✅

### 👤 Step 5: Create Your Admin Account (1 min)
1. Still in **SQL Editor**, click **"New query"**
2. Paste this (replace with YOUR info):
```sql
INSERT INTO users (cap_id, role, name)
VALUES ('YOUR_CAP_ID', 'admin', 'Your Name');
```
Example:
```sql
INSERT INTO users (cap_id, role, name)
VALUES ('123456', 'admin', 'John Smith');
```
3. Click **"Run"**

### 🌐 Step 6: Upload to BlueHost (3 min)
1. Login to **BlueHost cPanel**
2. Open **File Manager**
3. Go to `public_html`
4. Create new folder: `event-system` (or any name)
5. Upload ALL files/folders:
   - `index.html`
   - `css/` folder
   - `js/` folder
   - `README.md`
   - `database-setup.sql`

### ✅ Step 7: TEST IT! (1 min)
1. Open browser: `https://yourdomain.com/event-system/`
2. Login with your CAP ID
3. You should see the dashboard! 🎉

---

## Quick Reference

### Login
- Just enter your CAP ID (no password)
- First user you create is automatically admin

### Add More Admins
Run this SQL in Supabase:
```sql
UPDATE users SET role = 'admin' WHERE cap_id = 'THEIR_CAP_ID';
```

### Troubleshooting

**"Failed to connect to database"**
- Check `js/config.js` has correct URL and key
- Make sure you used the **anon public** key (not service_role)

**"No data showing"**
- Verify you ran the `database-setup.sql` file
- Check browser console (F12) for errors

**Can't login**
- Make sure you created your user in Step 5
- CAP ID must match exactly

**Browser showing error**
- Hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
- Clear browser cache

### Support
1. Open browser console (F12) to see errors
2. Check Supabase logs in dashboard
3. Re-read this guide step by step

---

## What You Get

✅ **Dashboard** - Real-time metrics and event overview
✅ **Events** - Create master events with personnel/asset needs
✅ **Activities** - Kanban board (drag & drop)
✅ **Assets** - Track vehicles, equipment
✅ **Personnel** - Manage team members
✅ **Assignments** - Assign people to assets/activities
✅ **Mobile Ready** - Works on phones and tablets
✅ **Multi-User** - Everyone sees same data
✅ **100% FREE** - No costs!

---

## File Structure You're Uploading

```
event-system/              ← Upload this entire folder
├── index.html             ← Main page
├── css/
│   └── styles.css        ← All styling
├── js/
│   ├── config.js         ← YOUR CREDENTIALS (update first!)
│   ├── supabase-client.js
│   ├── components.js
│   └── app.js
├── README.md              ← Full documentation
└── database-setup.sql     ← Database creation script
```

---

## Need Help?

**Before asking for help:**
1. Did you complete ALL steps above?
2. Did you paste the ENTIRE SQL file?
3. Did you update config.js with YOUR credentials?
4. Did you check the browser console (F12)?

**Common Mistakes:**
- ❌ Not updating `config.js`
- ❌ Using service_role key instead of anon key
- ❌ Not running the complete SQL file
- ❌ Not creating admin user
- ❌ Uploading to wrong folder

---

**🎯 YOU'RE READY! Start managing CAP events like a pro!**
