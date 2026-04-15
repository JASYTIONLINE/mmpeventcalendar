# mmpeventcalendar

This repository implements a **McAllen Mobile Park Events** web presence: the home page foregrounds the community calendar, while sidebars and cards surface structured schedule data. The implementation relies on static **HTML**, a **single global stylesheet**, and **client-side JavaScript** only; there is no application server in the architecture.

The project is **not** an official park management system. Operational questions belong with park management.

---

## Contents

- [Repository layout](#repository-layout)
- [Structure, UI, and presentation](#structure-ui-and-presentation)
- [Pages and content types](#pages-and-content-types)
- [Client-side JavaScript](#client-side-javascript)
- [Data and automation](#data-and-automation)
- [Data model (reference)](#data-model-reference)
- [Capstone artifacts](#capstone-artifacts)

---

## Repository layout

The table below summarizes how the repository is organized. Together, these paths illustrate a **separation of concerns**: public pages, shared assets, machine-readable data, and offline tooling live in distinct trees.

| Path | Role |
|------|------|
| [index.html](index.html) | **Home:** shared chrome, embedded Google Calendar, featured-event regions, and a **three-column layout** that partitions recurring items, the main calendar, and short-horizon highlights. |
| [contents/](contents/) | **Inner pages** (learn-more, submit, contact, request-activity, and related entry points). |
| [contents/feature-events/](contents/feature-events/) | **Dated, one-off** featured-event landings (flyer-style layout; optional ICS and ticketing-style flows); includes a bookme-style template and generated **YYYY-MM-DD-HHmm-** HTML pages. |
| [contents/activity-flyer/](contents/activity-flyer/) | **Recurring-activity** informational templates that **reuse the same site shell** as other pages—supporting clarity that this material describes a *typical* week pattern, not a single calendar night. |
| [assets/css/style.css](assets/css/style.css) | **One consolidated stylesheet:** design tokens, layout, reusable components, and page-scoped overrides. |
| [assets/js/](assets/js/) | **Behavior:** sidebar rendering, forms, coordinator configuration, ICS helper for feature pages. |
| [assets/data/json/](assets/data/json/) | **Master JSON** consumed in the browser (see [mmhp-master-data.json](assets/data/json/mmhp-master-data.json)). |
| [assets/data/csv/](assets/data/csv/) | **Tabular sources and exports** (featured rows, calendar-oriented CSVs). |
| [assets/images/](assets/images/) | **Brand and content imagery:** park banner, event-flyer art, activity-flyer art, favicon, and related assets. |
| [scripts/](scripts/) | **Offline utilities** (Node and Python): CSV-to-JSON merges, syllabus-related helpers, calendar CSV tooling. |

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

- **Home** — Header copy, full-width park-banner hero, main navigation, **left** rail (recurring schedule and CSV tools on pages that include them), **center** column (iframe calendar plus home featured section), **right** rail (week spotlight / featured cards where enabled). The **spatial split** is a deliberate **information-architecture** choice: recurring rhythm vs. embedded calendar vs. promotional cards.

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
