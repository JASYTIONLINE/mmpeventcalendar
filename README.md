# mmpeventcalendar
Event Calendar Site for McAllen Mobile Park.

- **Calendar (home):** [`index.html`](index.html)
- **Learn more, submit, contact:** [`contents/`](contents/)
- **Capstone proposal (PDF):** [`assets/docs/Barkle-w3a1-project-proposal-and-research.pdf`](assets/docs/Barkle-w3a1-project-proposal-and-research.pdf)
- **Capstone proposal (text):** [`assets/docs/Barkle-w3a1-project-proposal-and-research.pdf.txt`](assets/docs/Barkle-w3a1-project-proposal-and-research.pdf.txt)

---

## Overview
This site provides a simple, mobile-friendly calendar and information hub for residents of McAllen Mobile Park.

This site is **not an official park management system**.  
All park-related issues must be directed to the park office.

---

## Purpose
- Provide a clear event calendar
- Display ongoing activities
- Show who is responsible for activities and committees
- Provide announcements
- Keep system simple for volunteer use

---

## Workflow (operations plan)

This section is the **agreed plan** for how calendar and sidebar content move from sponsors to residents. The goals are a **simple volunteer experience**, **few moving parts that can break**, and **documentation** (standard operating procedures) so every step is repeatable.

### Principles

1. **The website is driven by JSON in this repository.** The pages load schedule-related data from a file under [`assets/data/json/`](assets/data/json/) (today [`mmhp-master-data.json`](assets/data/json/mmhp-master-data.json); a slimmer `schedule.json` or equivalent may replace or complement it as the model evolves). That JSON is the **source of truth for the site**—left sidebar (recurring / weekly outline), right sidebar (featured / special items), and any future calendar UI that reads the same file.

2. **Google Calendar is parallel, not a parser for the site.** The park’s **public Google Calendar** is what people can subscribe to on their phones. It is kept **in sync with the same schedule** the webmaster approves—typically by **importing CSV** (Google’s format) once per season and making small edits during the year. The site does **not** depend on parsing ICS in the browser for day one; that avoids fragile parsing and lost metadata (for example “featured” flags) unless we deliberately encode them later.

3. **Low frequency justifies manual, documented steps.** The **main season** is usually planned and entered **once a year**. **Ad-hoc** submissions (sponsors, one-off adds) are expected **only a handful of times per year**. A short checklist and GitHub Desktop are enough; we do not need a custom server or automated git pushes for the typical webmaster.

### End-to-end story

**Intake.** A sponsor or committee member opens the **submission form** on the site ([`contents/submit.html`](contents/submit.html)): it is a normal web form (not Google Forms) that **downloads a CSV** when completed. The webmaster or coordinator merges approved rows into master data (or into a Sheet if you still use that path). Alternatively, trusted editors may work **directly in the Sheet** or **data admin** using the same columns the form would populate.

**Review and approve.** The **webmaster** cleans up wording, dates, and times; checks locations; and marks each row **approved** (for example an `Approved` column or a `Status` value). Only approved rows are exported.

**Export (target automation).** When the webmaster runs **Export** (planned: a **Google Apps Script** menu or button on the Sheet), **two outputs** are produced in one action:

- **Calendar CSV** — Rows in the format Google Calendar expects for **Import** (see [Google’s CSV import help](https://support.google.com/calendar/answer/37118)). The webmaster imports this into the park calendar (or merges carefully to avoid duplicates).

- **Site JSON** — A file (or a defined fragment) that matches what the **sidebar scripts** expect: which items are **recurring** (same time each week), which are **featured / special**, **categories**, titles, times, locations, and dated instances as needed.

Until Apps Script is in place, the webmaster can produce these two artifacts manually or with a one-off tool; the **roles** stay the same: **one approved dataset → two files**.

**Publish the site.** The webmaster saves the exported JSON into the **correct path** in their **local clone** of this repo (per SOP), opens **GitHub Desktop**, reviews the diff, writes a short commit message (for example `Update schedule from Sheet export 2026-04-08`), and **pushes** to the branch that deploys the site (usually `main`). The live site then serves the new JSON on the next deploy.

**Calendar only.** Importing the CSV into Google Calendar is a **separate** step from git. Both steps should be on the same SOP checklist so the **website** and **subscriber calendar** stay aligned.

### Roles

| Role | Responsibility |
|------|----------------|
| **Sponsor / editor** | Submit via site form (CSV) or edit Sheet per instructions |
| **Webmaster** | Approve, export CSV + JSON, import calendar, commit and push JSON |
| **Residents** | Use the site and/or subscribe to Google Calendar |

### What we document next (SOP)

Operational docs (separate checklist or wiki page) should spell out: **Sheet column definitions**; meaning of **featured** vs **recurring**; **time zone** (America/Chicago); **exact repo paths** and filenames; **backup before replace**; and **how to avoid duplicate** calendar imports.

---

# Object List (Core Data Model)

The system is built around the following **11 core objects**:

1. residents  
2. spaces  
3. activities  
4. events  
5. committees  
6. committeeMembers  
7. parkStaff  
8. announcements  
9. locations  
10. roles  
11. residentRoles  

---

# Data Model (Schema Specification)

This section is the **canonical schema** for long-term site data. A developer can recreate the master JSON structure from the object list, relationships, and field definitions below. For **concrete shape and typing** (field names, nesting, sample values), use [`assets/data/json/mmhp-master-data.json`](assets/data/json/mmhp-master-data.json).

Each object uses a **string** `id` with a type prefix and four digits (for example `re0001`, `sp0001`). **Residents:** `re####` (`re0000` = Vacant). **Spaces:** `sp####`. **Activities:** `ac####`. **Events:** `ev####`. **Committees:** `cm####`. **Committee members:** `mb####`. **Park staff:** `ps####`. **Announcements:** `an####`. **Locations:** `lo####`. **Roles:** `ro####`. **Resident–role links:** `rr####`. Foreign references use **`*Id`** fields (`residentId`, `activityId`, `committeeId`, `roleId`, etc.) and match those string ids.

## Overview
**Current site behavior:** The **center** calendar is typically a **Google Calendar embed**; **sidebars** (and any JSON-driven UI) load data from [`assets/data/json/mmhp-master-data.json`](assets/data/json/mmhp-master-data.json) via the static pages. **Submissions** use the **Submit** page web form, which produces a **CSV** on completion (see [Workflow](#workflow-operations-plan) for review → export → publish).

**Schema:** The objects below describe the long-term **master data model**; the operational **workflow** above is how approved data is expected to reach the repo and Google Calendar.

Design goals:
- simple
- expandable
- minimal duplication
- easy to maintain

---

## Core Relationships

### Activities → Events
- An **activity becomes an event when scheduled**
- `events.activityId → activities.id`

---

### Residents → Spaces
- `spaces.residentId → residents.id`
- Multiple residents may occupy one space

---

### Activities → Residents
- `activities.chairpersonId → residents.id`
- Optional: `coChairIds[]`

---

### Events → Residents
- `events.chairpersonId → residents.id`

---

### Events → Locations
- `events.locationId → locations.id`

---

### Committees → Committee Members
- `committeeMembers.committeeId → committees.id`
- `committeeMembers.residentId → residents.id`

---

### Residents → Roles
- `residentRoles.residentId → residents.id`
- `residentRoles.roleId → roles.id`

---

## Object Definitions

### residents
People in the park

Fields:
- id
- name
- phone
- memberSince
- isFullTime
- notes
- imagePath

---

### spaces
Physical lots

Fields:
- id
- spaceNumber
- street
- residentId
- status
- notes
- imagePath

Allowed status:
- For Sale
- For Rent
- Unavailable

---

### activities
Ongoing programs

Fields:
- id
- activityName
- description
- chairpersonId
- coChairIds[]
- notes
- imagePath

---

### events
Scheduled occurrences

Fields:
- id
- eventName
- activityId
- chairpersonId
- locationId
- date
- time
- recurrenceType
- isFeatured
- isActive
- notes
- imagePath

Recurrence types:
- OneTime
- Weekly
- Monthly

---

### committees
Standing groups

Fields:
- id
- committeeName
- description
- notes

---

### committeeMembers
**Committee positions (NOT just people)**

Each record represents:
- a role within the committee
- assigned to a resident

Fields:
- id
- committeeId
- residentId
- position

Examples of position:
- Chair
- Secretary
- Treasurer
- Member

---

### parkStaff
Display-only staff listing

Fields:
- id
- name
- imagePath
- notes

Notes:
- No phone numbers
- No emails
- Informational only

---

### announcements
General notices

Fields:
- id
- title
- description
- datePosted
- expirationDate
- priority
- notes
- imagePath

Priority:
- Low
- Normal
- High (reserved for emergency)

---

### locations
Standardized event locations

Fields:
- id
- locationName
- description
- notes

---

### roles
Permission roles

Fields:
- id
- roleName
- description

Standard roles:
- Resident
- Committee Member
- Committee Admin
- Chairperson
- Park Admin
- Webmaster

---

### residentRoles
Links residents to roles

Fields:
- id
- residentId
- roleId

---

## Key Design Decisions

### Activities vs Events
- Activities = what it is  
- Events = when it happens  

---

### Committee Model
- CommitteeMembers = **positions tied to residents**
- Not just a list of people

---

### Park Staff
- Simplified to display only
- No operational logic

---

### Permissions
- Role-based (future use)
- Beta controlled by webmaster

---

### Out of Scope
- Park issue tracking
- Contact system
- Listings system
- Documents
- Media library

---

## Notes
This schema is intentionally simple for beta use but structured to scale into a full park system later.