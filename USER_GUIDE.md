# CAP Event Command System � User Guide

This guide explains how to use the CAP Event Command System for planning events, activities, personnel, assets, and schedules.

## Quick Start

1. Open `index.html` in a local server (recommended) or your host.
2. Log in with your CAP ID.
3. Admins will see the **Select Event** screen. Choose an event or create a new one.
4. Use the left navigation to manage **Activities**, **Assets**, **Personnel**, **Locations**, and **Schedule**.

## Roles and Access

- **Admins** can create, edit, and delete events, activities, assets, personnel, and locations.
- **Users** can view assignments and schedules relevant to them.

## Core Concepts

- **Event**: The master event (date range, description). Admins select an event before managing details.
- **Activity**: A sub-event inside an event. Activities are tracked in a Kanban board.
- **Personnel**: People assigned to activities or assets.
- **Assets**: Vehicles/equipment assigned to activities.
- **Availability**: Date/time windows when a person or asset is available.
- **Schedule**: Shows the logged-in user�s assigned tasks with routes.

## Admin Workflow (Recommended)

1. Create or select an event.
2. Add locations.
3. Add personnel and assets (with availability).
4. Create activities (date/time + required roles/assets).
5. Assign assets and personnel to activities.
6. Add routes (from/to) for assignments.
7. Review the schedule and timelines.

## Navigation Overview

- **Dashboard**: Event overview and metrics.
- **Activities**: Kanban board for activities (Planning, Ready, In Progress, Completed).
- **Assets**: Asset list + timeline (Gantt).
- **Personnel**: Personnel list + timeline (Gantt).
- **Locations**: Manage addresses used in routes.
- **Schedule**: Your personal task list with directions.

## Activities (Kanban)

Activities are shown in 4 columns:
- **Planning**
- **Ready** (auto-moved when all requirements are met)
- **In Progress**
- **Completed**

You can drag cards between columns.

Each activity card shows:
- Title
- Location
- Date/time
- **P:** assigned / required (excludes asset operators)
- **A:** assigned / required

When requirements are met, the card turns green and auto-moves to **Ready**.

## Creating an Activity

1. Go to **Activities** inside an event.
2. Click **Add Activity**.
3. Enter title, description, date, start/end time, and location.
4. Add required **Support Roles** (Driver, Safety Officer, HSO, Support Staff, Orientation Pilot, TO, Other).
5. Add required assets from the asset list.

## Assigning Personnel to an Activity

1. Open the activity.
2. In **Assign Personnel**, select a person, role, and time window.
3. Click **Assign**.

Rules:
- Conflicts prompt you to confirm if they are going directly from another activity.
- Availability is enforced (if outside availability window, assignment is blocked).
- Asset operators (Driver/Orientation Pilot/Other assigned to assets) are not counted in **P**.

## Assigning Assets to an Activity

1. Open the activity.
2. In **Assign Asset**, select an asset and a time window.
3. Click **Assign**.

Rules:
- Conflicts prompt you to confirm direct transfer between activities.
- Availability is enforced.
- An asset must have an operator assigned for the same time window.

## Asset Operators (Drivers / Pilots / Other)

Operators are assigned from the **Assets** page:
1. Open an asset.
2. Click **Assign Operator**.
3. Choose personnel, role (Driver / Orientation Pilot / Other), date, and time.

When an asset is assigned to an activity, its operator is automatically included in the activity.

## Routes (From / To)

Routes can be set per assignment.

1. Open an activity.
2. In **Assigned Personnel** or **Assigned Assets**, click **Route**.
3. Choose **Coming From** and **Going To** locations.
4. Optional: Check **Stay At Location**.

Routes show on the **Schedule** page and in the **Gantt** timelines.

## Locations

Locations store the address data used for routing.

Each location includes:
- Name
- Street
- City
- State
- Zip

You can open maps directly from the **Locations** page.

## Schedule Page

The schedule shows:
- Activity name
- Time
- Assigned asset (if any)
- From / To location (names)
- Directions button

If From + To are set, the Directions button opens a **route**.
If only To is set, it opens a single destination.

A clock icon appears if **Stay At Location** is checked for that assignment.

## Timeline (Gantt) Views

Available on **Assets** and **Personnel** pages.

- Views: 1D, 2D, 3D, 4D, 1W
- Times are displayed on the top row only
- Unavailable time blocks show as light red
- Assigned activities appear as bars
- Personnel bars are color-coded by role
- A clock icon indicates **Stay At Location**

## Mock Mode (Local Development)

If mock mode is enabled in `js/config.js`, all data is stored in `localStorage`.

Seed data (run in browser console):
```js
seedMockData({ replace: true })
seedMockActivities({ replace: true })
```

## Tips

- Use **Locations** first so routes are easy to assign later.
- Assign asset operators before assigning the asset to an activity.
- If a conflict pops up, confirm only when the operator/asset is truly going directly to the next activity.

---

If you want a printable version, tell me and I�ll add a PDF-friendly layout.
