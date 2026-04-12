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

This section is the **canonical schema** for long-term site data. A developer can recreate the master JSON structure from the object list, relationships, and field definitions below. For **concrete shape and typing** (keys, nesting, sample values), use [`assets/data/json/mmhp-master-data.json`](assets/data/json/mmhp-master-data.json).

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
- `events.activityKey → activities.key`

---

### Residents → Spaces
- `spaces.residentKey → residents.key`
- Multiple residents may occupy one space

---

### Activities → Residents
- `activities.chairpersonKey → residents.key`
- Optional: `coChairKeys[]`

---

### Events → Residents
- `events.chairpersonKey → residents.key`

---

### Events → Locations
- `events.locationKey → locations.key`

---

### Committees → Committee Members
- `committeeMembers.committeeKey → committees.key`
- `committeeMembers.residentKey → residents.key`

---

### Residents → Roles
- `residentRoles.residentKey → residents.key`
- `residentRoles.roleKey → roles.key`

---

## Object Definitions

### residents
People in the park

Fields:
- key
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
- key
- spaceNumber
- street
- residentKey
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
- key
- activityName
- description
- chairpersonKey
- coChairKeys[]
- notes
- imagePath

---

### events
Scheduled occurrences

Fields:
- key
- eventName
- activityKey
- chairpersonKey
- locationKey
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
- key
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
- key
- committeeKey
- residentKey
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
- key
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
- key
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
- key
- locationName
- description
- notes

---

### roles
Permission roles

Fields:
- key
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
- key
- residentKey
- roleKey

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