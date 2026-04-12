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
**MVP (current academic deliverable):** Events shown on the site come from **Google Calendar**; event submissions use **Google Forms**. The live pages **do not read** `mmhp-master-data.json`.

**Future:** The site can be powered by **one master JSON file** containing all objects below, maintained (for example) via form workflows or other tooling—not part of the MVP.

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
- isSpecialEvent
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