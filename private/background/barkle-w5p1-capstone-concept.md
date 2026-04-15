# Project 01: Capstone Concept and Initial Implementation

**Course:** CMPA Capstone (Week 05)  
**Student:** Barkle  
**Project:** McAllen Mobile Park — Mobile-First Community Event Calendar (static web app)  
**Document:** Written submission draft (Problem & Research, Scope & Plan, Implementation instructions, self-assessment).  
**Note:** Submit a separate file for the **Concept Presentation** (slides or video) per the assignment page.

---

## Table of contents

1. [Problem Statement and Research](#1-problem-statement-and-research)  
2. [Project Scope and Plan](#2-project-scope-and-plan)  
3. [Initial Implementation: Access and Use](#3-initial-implementation-access-and-use)  
4. [Honest Self-Assessment](#4-honest-self-assessment)  
5. [References](#5-references)

---

## 1. Problem Statement and Research

### 1.1 Problem statement

Residents of McAllen Mobile Park and similar small communities lack a **simple, centralized** way to **publish and find** event information. Today, events spread through Facebook groups, word of mouth, and informal notices. A resident may learn about an event late, hunt through a long feed for details, or miss it entirely. That inconsistency increases confusion, lowers participation, and forces organizers to repeat answers. Many residents are **older adults** who rely on **phones**, may not use Facebook, and benefit from **large, clear type** and **low cognitive load**—not dense, search-heavy interfaces.

This matters because weak communication weakens community ties and park programming. When attendance drops, association revenue and resident satisfaction can suffer. A **calendar-first**, **mobile-friendly** hub that focuses **only** on park-relevant events addresses a concrete, ongoing need.

### 1.2 Research: existing approaches (summary)

Three widely used patterns illustrate why a **dedicated small-community** surface is justified.

1. **Visit McAllen** — Credible city-wide listings, but aimed at a **broad** audience (tourism, large events). Residents must sift through layers of content not tuned to a single park community or older users on small screens.   Source: [Visit McAllen](https://visitmcallen.com/)

2. **Eventbrite** — Strong discovery and ticketing at **scale**, but **search and filters** are central. That disadvantages users who struggle with keyword search and who are overwhelmed by unrelated listings and ads.  
   Source: [Eventbrite](https://www.eventbrite.com/)

3. **Facebook Events / group posts** — Already used locally, but **requires an account** for full participation, buries posts in a **feed**, and lacks a **stable calendar view** and consistent formatting—harder for users with limited tech comfort or vision needs.

**Shared gap:** These tools are generally mobile-compatible but not optimized for **aging-related accessibility** (readability, simplicity) or for a **single community** that should not have to “search the internet” for hall dinners and park activities.

### 1.3 How this project differs

The prototype is **intentionally narrow**: **one community**, **calendar-first** entry, **minimal navigation**, **no account** to view the public schedule, and **large readable layout**. It complements—not replaces—park office communication. The implementation uses a **public Google Calendar embed** so subscribers can use **Google’s own notifications** without the site re-implementing reminders, while **curated** featured and recurring information on the site is driven from **structured JSON** in the repository (see Scope).

*(Target length for this section in the final PDF: roughly 300–500 words. Trim or expand citations as required by your rubric.)*

---

## 2. Project Scope and Plan

### 2.1 Scope: in scope for Project 01

- **Public site (GitHub Pages–ready static pages):** Home with **embedded public Google Calendar**, **Learn More**, **Submit Event**, **Contact**; shared layout and responsive CSS.  
- **JSON-driven UI:** Master data file drives **recurring schedule** (left sidebar) and **featured / spotlight** cards (home and sidebars) via JavaScript.  
- **Submission prototype:** Structured **HTML/JS form** (not a Google Form in the page) that validates required fields and routes content to the **event coordinator** using device capabilities (e.g., share/mail); aligns with **volunteer review before publish**.  
- **Maintenance tooling:** A **password-gated data admin** in the repo for structured edits and exports—originally built to speed development, **kept** as part of the long-term approach because it reduces hand-editing risk in large JSON.  
- **Documentation:** Repository **README** describes data model, workflow intent (approve → publish JSON → parallel calendar CSV import), and roles.

### 2.2 Scope: explicitly deferred or open (honest)

- **Per-event “flyer” detail pages** and **deep links from every featured card** were in the proposal for P01; some of that workflow is **still in progress** (cards may still route generically in places). P02 will complete the **event detail** experience and tighten links.  
- **Master data quality:** Sorting and display depend on **consistent date/time fields** in JSON; the dataset needs a **normalization pass** so all clients sort the same way.  
- **Submission → production pipeline:** The boundary between “coordinator receives submission” and “row lands in Sheet vs. merged directly toward JSON” is a **deliberate open decision** for P02, driven by **volunteer skill** and **error rate** (Sheet as human-friendly review grid vs. fewer steps via admin/repo).

### 2.3 Pivots and why

| Area | Earlier plan | Current direction | Reason |
|------|----------------|------------------|--------|
| **Calendar access** | Flows that assumed users would **log into Google** | **Public calendar** + **embed** | Not all residents have Google accounts; public embed preserves **subscribe/notifications in Google** without custom reminder scripting. |
| **Submission** | Google Form embedded | **Native form** + coordinator handoff | Faster iteration on static hosting; clearer validation UX; still matches “human approves before publish.” |
| **Data architecture** | “Calendar as source” in spirit | **Parallel model:** Calendar **embed** for residents; **repo JSON** as **source of truth** for site chrome (featured/recurring) | Avoids fragile in-browser ICS parsing; keeps rich flags/metadata in JSON; calendar updated via documented **CSV import** path. |
| **Admin** | Dev convenience | **Part of maintained system** | Reduced maintenance friction; aligns fields with what the site scripts expect. |

### 2.4 Risks (from proposal) and what happened

An early risk was **technical complexity** integrating **Google Calendar and Sheets** in ways that would **break for less-adept volunteers**. **Calendar** risk turned out **manageable**: public sharing + embed addressed both **access** and **notifications**. **Sheet automation** (e.g., one-click export) remains **future work**, with emphasis on **simple SOPs** and **few moving parts** until P02.

### 2.5 Plan through Project 02 (high level)

- **Weeks 06–07:** Peer review (Exercise 03); normalize **event date/time** in data; ship **event detail** pages and wire **featured → flyer** URLs; mobile QA.  
- **Week 08 (Project 02):** Polished product, case study, presentation; decide and document **Sheet vs. near-JSON** intake; optional **Apps Script** or checklist-only operations.

*(Target length for this section in the final PDF: roughly 300–500 words.)*

---

## 3. Initial Implementation: Access and Use

### 3.1 Live implementation

**Replace the placeholder below with your actual GitHub Pages URL** (test in a **signed-out** or private window before submission):

- **Live site:** `https://YOUR_USERNAME.github.io/YOUR_REPO/`  
- **Repository:** `https://github.com/YOUR_ORG/mmpeventcalendar` (adjust to match your fork)

### 3.2 What to try (grader walkthrough)

1. **Home:** Confirm the **community calendar** loads (embedded **public** Google Calendar).  
2. **Sidebars:** Scroll **recurring schedule** (left) and **featured / this-week spotlight** (right on wide layout; may stack on mobile).  
3. **Navigation:** Open **Learn More**, **Submit Event**, and **Contact**.  
4. **Submit Event:** Fill required fields including **featured image**; submit triggers **share/mail** flow to the coordinator (set `data-mmhp-coordinator-email` on the submit page body in production). **No custom server** is required.  
5. **Data admin (optional demo):** From the home page, the **Admin** link leads to a **desktop-oriented** editor (**password required**). Do **not** share the password in this document; if demonstrating to the instructor, use a **private** channel or screen recording with credentials redacted.

### 3.3 Known limitations (P01 honesty)

- **No server-side persistence** from the public form; publishing is **human-in-the-loop** (coordinator + JSON/calendar workflow).  
- **Event detail pages / links** may be incomplete relative to the Week 05 proposal milestone—state clearly in cover email if you submit before wiring is finished.  
- **Data ordering issues** may appear if `mmhp-master-data.json` has inconsistent date/time fields; **cleanup** is planned.  
- **README** may still mention older wording (e.g., CSV download on submit); **trust the live behavior** above or update the README before final grading.

---

## 4. Honest Self-Assessment

Answer these briefly (this feeds Project 02):

- **Core task:** Can a resident **see what is coming** and **understand how to submit** an event? What works today?  
- **Gaps:** List the top **2–3** functional or UX gaps (e.g., flyer pages, data sort, doc drift).  
- **Technical choices to revisit:** e.g., Sheet-first vs. JSON-first intake; automation depth for volunteers.  
- **Time well spent vs. poor return:** What paid off (admin, JSON model, public calendar)? What did not?  
- **Underinvestment:** Where should you have spent more time earlier (data contract, validation, event URLs)?  
- **If starting tomorrow:** One change you would make first.

*(Complete this section in your own words before converting to PDF.)*

---

## 5. References

1. Visit McAllen. *Official destination events and listings.* https://visitmcallen.com/  
2. Eventbrite. *Event discovery and ticketing platform.* https://www.eventbrite.com/  
3. Meta / community practice. *Facebook Events and group-based event sharing* (used informally at the park; no single canonical URL—describe usage in your own words if the rubric requires only “web” sources; add a fourth source if your instructor requires strictly verifiable URLs only).

**Internal project references (optional in PDF):**

- Proposal (Week 03): `assets/docs/Barkle-w3a1-project-proposal-and-research.pdf`  
- Master data: `assets/data/json/mmhp-master-data.json`  
- Workflow notes: `README.md`

---

## Appendix: Submission checklist (Canvas)

- [ ] This document exported to **PDF** with **Part 1** and **Part 2** meeting **word count** and **citation** requirements on the assignment page.  
- [ ] **Live URL** tested; **implementation instructions** updated with real link.  
- [ ] **Concept presentation** uploaded separately (slides or video per syllabus).  
- [ ] **Project 01** and **Exercise 03** submissions completed if both are due the same week.

---

*End of draft — `barkle-w5p1-capstone-concept.md`*
