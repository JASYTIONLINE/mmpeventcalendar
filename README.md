# mmpeventcalendar

This repository implements a **McAllen Mobile Park Events** web presence: the home page foregrounds the community calendar, while sidebars and cards surface structured schedule data. The implementation relies on static **HTML**, a **single global stylesheet**, and **client-side JavaScript** only; there is no application server in the architecture.

The project is **not** an official park management system. Operational questions belong with park management.

---

## Contents

- [Repository layout](#repository-layout) (includes [activity flyer pages](#activity-flyer-pages))
- [Structure, UI, and presentation](#structure-ui-and-presentation)
- [Pages and content types](#pages-and-content-types)
- [Client-side JavaScript](#client-side-javascript)
- [Data and automation](#data-and-automation)
- [Data model (reference)](#data-model-reference)
- [Capstone artifacts](#capstone-artifacts)

---

## Repository layout

The site is a **static** tree: HTML at the repo root and under **contents/**, shared **assets/** (CSS, JS, data, images, docs), and **scripts/** for offline maintenance only.

### Directory tree (compact)

```
mmpeventcalendar/
├── index.html                    # home (three-column layout, calendar embed)
├── contents/
│   ├── learn-more.html           # operational pages (same shell as home)
│   ├── submit.html
│   ├── contact.html
│   ├── request-activity.html
│   ├── activity-flyer/           # recurring-activity pages + template-recurring-activity.html
│   └── feature-events/           # dated one-off landings + yyyy-mm-dd-… template
├── assets/
│   ├── css/style.css             # single global stylesheet
│   ├── js/                       # sidebar, forms, ICS helper, coordinator config
│   ├── data/
│   │   ├── json/mmhp-master-data.json
│   │   └── csv/                  # featured-events.csv, calendar import/export CSVs, export/
│   ├── images/                   # banners; event-flyer/; activity-flyer/
│   └── docs/                     # capstone proposal PDF + text extract
└── scripts/                      # Node (.mjs) + Python; not loaded by the browser
```

### Path depth and linking

| Where the HTML file lives | Typical asset prefix | Notes |
|---------------------------|----------------------|--------|
| Repo root (`index.html`) | `assets/...` | Links into **contents/** use the `contents/...` prefix. |
| [contents/](contents/) (e.g. learn-more, submit) | `../assets/...` | Sibling pages in **contents/** use bare filenames (e.g. `contact.html`). |
| [contents/activity-flyer/](contents/activity-flyer/) | `../../assets/...` | Links to other **contents/** pages use `../` (e.g. `../learn-more.html`). **activities-sidebar.js** adjusts featured-event and nav targets for this extra directory level. |
| [contents/feature-events/](contents/feature-events/) | `../../assets/...` | Same depth as activity-flyer; paths mirror conventions used on those pages. |

### Folders in brief

| Path | Role |
|------|------|
| [index.html](index.html) | **Home:** shared chrome, embedded Google Calendar, featured regions, **three-column** layout (recurring sidebar, calendar column, short-horizon highlights). |
| [contents/](contents/) | **Operational** HTML plus **activity-flyer/** and **feature-events/** subtrees (see tree above). |
| [contents/feature-events/](contents/feature-events/) | **Dated, one-off** featured-event landings (flyer-style layout; optional ICS and coordinator flows); bookme-style template and generated **YYYY-MM-DD-HHmm-** pages. |
| [contents/activity-flyer/](contents/activity-flyer/) | **Recurring-activity** explainers (typical week pattern, not one night); optional **data-mmhp-activity-id** ties copy to **activities[]** in master JSON. Individual pages are linked below. |
| [assets/css/style.css](assets/css/style.css) | **One stylesheet:** tokens, layout, components, page-scoped overrides (**page-home**, **page-activity-flyer**, etc.). |
| [assets/js/](assets/js/) | **Client behavior:** master JSON load, sidebar and cards, event and activity request forms, feature-event ICS, coordinator mailto hooks. |
| [assets/data/json/](assets/data/json/) | **mmhp-master-data.json** — browser-facing aggregate for sidebar and forms. |
| [assets/data/csv/](assets/data/csv/) | **featured-events.csv** (editorial/build input), Google Calendar–oriented CSVs, **export/** (optional local exports; generated `*.csv` under **export/** may be gitignored—folder kept via [.gitkeep](assets/data/csv/export/.gitkeep)). |
| [assets/images/](assets/images/) | Park banner, **event-flyer/**, **activity-flyer/**, favicon, misc art. |
| [assets/docs/](assets/docs/) | Capstone proposal artifacts (PDF + `.txt` extract). |
| [scripts/](scripts/) | **build-features-from-csv.mjs**, **build-feature-event-pages.mjs**, **csv-to-syllabus-json.mjs**; Python helpers for recurring expansion and Google Calendar CSV export—run locally, not at runtime. |

### Activity flyer pages

Source HTML for recurring-activity landings (same path depth as the folder link in the table above):

- [arts-and-crafts.html](contents/activity-flyer/arts-and-crafts.html)
- [bible-study.html](contents/activity-flyer/bible-study.html)
- [book-club.html](contents/activity-flyer/book-club.html)
- [card-games.html](contents/activity-flyer/card-games.html)
- [kitchen-inventory.html](contents/activity-flyer/kitchen-inventory.html)
- [martial-arts-training.html](contents/activity-flyer/martial-arts-training.html)
- [pool-8-ball.html](contents/activity-flyer/pool-8-ball.html)
- [vespers.html](contents/activity-flyer/vespers.html)
- [template-recurring-activity.html](contents/activity-flyer/template-recurring-activity.html) — copy for new flyers

---

## Structure, UI, and presentation

### Visual system and consistency

The file **assets/css/style.css** is described in-repo as a **consolidated** stylesheet: one place defines the **sky, ocean-mist, sand, and driftwood** palette, shared spacing and corner radii under **:root**, and the structural “primitives” reused on every page. From a **UI/UX** perspective, that choice supports **predictability**: residents encounter the same visual language whether they are on the home page, a form, or a flyer.

**Layout vocabulary** (still technical, but stable across the site): **site-wrapper** → **site-shell** → **site-header**, an optional **hero-image**, **site-nav** / **navbar**, then **site-layout** with **site-sidebar-left**, **site-main**, and **site-sidebar-right**, leading into **site-main-content** / **content** and **site-footer**. Cards align with **site-card**, **card**, or **box** patterns. Primary actions use **btn** and **site-button**—**pill-shaped** controls with a driftwood border and a sky-toned hover state—so interactive elements read consistently as **actions**. Primary navigation uses **site-nav-link** pills on a sand-toned rail, which **segments** the top of the page without relying on a dense hamburger menu.

### Page-scoped behavior without layout drift

**Body** classes tune presentation **without** forking separate style sheets—for example **page-home** adjusts hero height, the calendar stack, and featured grids; **page-activity-flyer** keeps the hero treatment **aligned with the home banner** and applies **.page-activity-flyer-*** rules for the flyer grid, badge, schedule emphasis, and feature image frame **inside** the standard content column. For reviewers, this pattern shows an intentional balance: **shared chrome** for familiarity, **local rules** only where a page type needs them.

### Typography and accessibility-minded scale

Global heading and paragraph scales are set for **readability** and **generous touch targets**; sidebars and areas adjacent to forms add **scoped** font-size rules so dense lists remain legible next to the main column. The overall aim is a calm, **low-friction** reading experience appropriate to a **mixed-age** community audience.

### Feature-event pages

HTML under **contents/feature-events/** often includes **embedded** CSS for flyer-specific grids, dialogs, and ICS affordances, while still **echoing** the global palette. That hybrid reflects a trade-off: **maximum control** for print-like event landings, without abandoning the site’s broader visual identity.

### UI/UX takeaways (for review)

- **Single stylesheet** → coherent color, spacing, and component behavior site-wide.  
- **Three-column home layout** → **separates** “what happens every week,” “the authoritative calendar,” and “what is highlighted soon,” reducing the need to hunt across unrelated regions.  
- **Pill navigation and buttons** → **clear affordances** and repeated shape language for “you can click here.”  
- **Activity flyers use the same shell** as operational pages → **continuity** when moving from calendar to a recurring-activity story.  
- **Page-scoped classes** → structural discipline: avoid one-off pages that look like a different product.

---

## Pages and content types

- **Home** — Header copy, full-width park-banner hero, main navigation, **left** rail (recurring schedule from master JSON), **center** column (iframe calendar plus home featured section), **right** rail (week spotlight / featured cards where enabled). The **spatial split** is a deliberate **information-architecture** choice: recurring rhythm vs. embedded calendar vs. promotional cards.

- **Operational pages** — **learn-more**, **submit**, **contact**, **request-activity** reuse the multi-column shell, the **data-mmhp-master-json** hook, and shared footer and navigation patterns with path-adjusted asset URLs. Users therefore **do not** relearn navigation when they move from reading to submitting.

- **Featured events** — **Date-specific** marketing or landing pages; imagery lives under **assets/images/event-flyer/**. Client scripts may wire **mailto**-style ticketing flows and **feature-events-ics.js** where those pages opt in—supporting both **human** coordinator contact and **calendar** handoff.

- **Activity flyers** — Explainers for **recurring** activities: typical weekdays and times, venue and park address, and a longer narrative; optional **data-mmhp-activity-id** ties copy to **activities[]** in master JSON when desired. Imagery uses **assets/images/activity-flyer/**. The UX intent is **idea-first** communication (pattern of the week) rather than “save this single date.”

---

## Client-side JavaScript

| Module | Responsibility |
|--------|----------------|
| [activities-sidebar.js](assets/js/activities-sidebar.js) | Loads master JSON; renders recurring lists and featured grids according to page context. |
| [event-submit-form.js](assets/js/event-submit-form.js) | Featured / one-time event submission: validation, CSV payload, and attachment / mailto / share flows as implemented. |
| [request-activity-form.js](assets/js/request-activity-form.js) | Recurring activity request flow. |
| [feature-events-ics.js](assets/js/feature-events-ics.js) | Calendar download and help UX on feature-event pages that include it. |
| [mmhp-coordinator-config.js](assets/js/mmhp-coordinator-config.js) | Coordinator contact surface for mailto and related hooks. |

Scripts load **per page** as needed (**defer** where applied). The master JSON path is supplied on **body** or follows layout conventions—keeping configuration **visible** in markup for a static site.

---

## Data and automation

- **Master JSON** — [mmhp-master-data.json](assets/data/json/mmhp-master-data.json) is the **browser-facing** aggregate: activities, features, and related entities consumed by sidebar and form logic.

- **Featured CSV** — [featured-events.csv](assets/data/csv/featured-events.csv) supports editorial workflows; [build-features-from-csv.mjs](scripts/build-features-from-csv.mjs) merges approved rows into master JSON **features[]** (and related fields) for republication.

- **Other scripts** — [scripts/](scripts/) also holds Node modules (for example feature page generation, syllabus JSON) and Python helpers for Google Calendar–oriented CSV generation and recurring expansions. These are **offline** tools; they are not required at runtime for the static pages.

The **center** calendar on the home page is typically a **Google Calendar embed**. It operates **alongside** the site’s JSON-driven cards and lists rather than as a server dependency of this codebase—a design that keeps **familiar calendar UX** for subscribers while still allowing **curated** sidebar content from JSON.

---

## Data model (reference)

The long-term entity model is expressed in master JSON and summarized below. **Authoritative field shapes and examples** remain in [mmhp-master-data.json](assets/data/json/mmhp-master-data.json).

**Id convention:** each entity carries a string **id** with a type prefix and four digits (for example **re0001**, **ac0001**, **fe0009**). Foreign keys use **\*Id** fields that reference those ids.

### Core object list

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

Featured presentation rows use **fe####** ids in **features[]**; they are **not** required to reference an **activityId**—a deliberate client-side distinction between **featured one-offs** and **recurring** sidebar content.

### Relationships (high level)

- **Activities → events:** an activity becomes an event when scheduled; **events.activityId** references **activities.id**.  
- **Residents → spaces:** **spaces.residentId** references **residents.id** (multiple residents may share a space).  
- **Activities → residents:** **activities.chairpersonId**; optional **coChairIds[]**.  
- **Events → residents / locations:** **events.chairpersonId**, **events.locationId**.  
- **Committees → members:** **committeeMembers** links **committeeId** and **residentId** with a **position** (chair, secretary, and so on).  
- **Residents → roles:** **residentRoles** links **residentId** and **roleId**.

### Object definitions

#### residents
People in the park — **id**, **name**, **phone**, **memberSince**, **isFullTime**, **notes**, **imagePath**.

#### spaces
Lots — **id**, **spaceNumber**, **street**, **residentId**, **status** (For Sale | For Rent | Unavailable), **notes**, **imagePath**.

#### activities
Ongoing programs — **id**, **activityName**, **description**, **chairpersonId**, **coChairIds[]**, **notes**, **imagePath**, plus recurrence-oriented fields as present in JSON (for example **recurrenceType**, **recurrenceDetails** for display).

#### events
Scheduled occurrences — **id**, **eventName**, **activityId**, **chairpersonId**, **locationId**, **date**, **time**, **recurrenceType** (OneTime | Weekly | Monthly), **isFeatured**, **isActive**, **notes**, **imagePath**.

#### committees
**id**, **committeeName**, **description**, **notes**.

#### committeeMembers
Committee **positions** (not a flat people list) — **id**, **committeeId**, **residentId**, **position**.

#### parkStaff
Display-only — **id**, **name**, **imagePath**, **notes** (no phone or email in the model).

#### announcements
**id**, **title**, **description**, **datePosted**, **expirationDate**, **priority** (Low | Normal | High), **notes**, **imagePath**.

#### locations
**id**, **locationName**, **description**, **notes**.

#### roles
**id**, **roleName**, **description** — for example Resident, Committee Member, Chairperson, Webmaster.

#### residentRoles
**id**, **residentId**, **roleId**.

### Design notes

- **Activities vs events:** activities describe *what*; events describe *when* (and featured flags for special instances).  
- **Committee model:** **committeeMembers** encodes titled roles, not only membership lists.  
- **Park staff:** informational only; no operational logic in the client.  
- **Permissions:** role fields anticipate future restriction; day-to-day edits remain webmaster-controlled.  
- **Out of scope (by design):** park issue tracking, built-in ticketing, listings, document library, media CMS.

---

## Capstone artifacts

- **Proposal (PDF):** [assets/docs/Barkle-w3a1-project-proposal-and-research.pdf](assets/docs/Barkle-w3a1-project-proposal-and-research.pdf)  
- **Proposal (text extract):** [assets/docs/Barkle-w3a1-project-proposal-and-research.pdf.txt](assets/docs/Barkle-w3a1-project-proposal-and-research.pdf.txt)
