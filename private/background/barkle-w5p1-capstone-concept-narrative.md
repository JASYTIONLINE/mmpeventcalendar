# Project 01: Capstone Concept and Initial Implementation (Narrative Draft)

**Course:** CMPA Capstone (Week 05)  
**Student:** Barkle  
**Project:** McAllen Mobile Park — Mobile-First Community Event Calendar  

This document tells the same story as the structured P01 draft in plain narrative form. The **concept presentation** (slides or video) is still submitted separately per the assignment page.

---

## The problem and why it matters

Life in a small community like McAllen Mobile Park still runs on events: dinners, meetings, activities in the halls. The trouble is not that people lack good intentions; it is that **information does not live in one dependable place**. Word spreads through Facebook groups, hallway conversations, and scraps of paper. Someone hears about a potluck three days late, or scrolls forever trying to find the time and room, or never sees the post at all. Organizers end up answering the same questions again and again.

Many residents are older adults. They often use **phones** more than laptops. Some do not use Facebook at all. Plenty need **larger type**, **clearer layout**, and **fewer steps** than a typical city events site or a giant ticketing platform expects. When communication fails, fewer people show up, the association’s life gets harder, and the community feels a little thinner. The project exists to give this park a **simple, calendar-first home** for its own events—not the whole internet’s events, just **this park’s**, presented in a way a neighbor can actually use.

---

## What already exists, and why it is not enough

Before building, I looked at how people already solve “where is the event?” at different scales. **Visit McAllen** is a serious, credible source for the city, but it speaks to tourists and the whole region. A park resident has to wade through layers of content that were never meant for “what is happening in our hall this week.” It is mobile-friendly in a generic sense, not tuned for an older reader on a small screen who only wants local relevance.

**Eventbrite** is built for discovery at scale: search, filters, categories, ads, and endless listings. That power becomes a burden when your audience does not want to search; they want to **glance at a calendar** they trust. The same pattern holds for **Facebook**, which the park already uses in practice: posts sink in the feed, formatting varies, and full participation assumes an account some neighbors simply do not have. All of these tools work on phones, but none of them is optimized for **one small community**, **low cognitive load**, and **aging-related accessibility**. That gap is the space this project occupies.

---

## What I set out to build, in plain terms

The prototype is **narrow on purpose**. It is one mobile-first website with a **public calendar view** at the center, a few supporting pages, and **no login required** just to see what is coming. The tone is closer to a printed park bulletin than to a startup’s event marketplace. I use a **public Google Calendar embed** on the home page so anyone can see the schedule, and people who want subscriptions or notifications can lean on **Google’s own tools** instead of me reinventing reminders in code. Alongside that embed, the **sidebars and featured cards** pull from a **structured JSON file** in the repository so the site can show recurring patterns and “featured” highlights the way the community expects, without parsing fragile calendar feeds in the browser for every nuance.

That split—**Calendar for the full view residents already understand**, **JSON for the curated chrome of the site**—became a deliberate architecture choice rather than an accident. It also connects to a risk I named early in the proposal: I worried that wiring Google’s world too tightly would create failure modes for **volunteers** (and for me) who are not full-time engineers. The calendar side of that story turned out better than I feared once I moved away from expecting residents to **log into Google** and toward a **public, shareable calendar** that still gives subscribers the familiar Google experience.

---

## What is in scope for this submission, and what honestly is not finished

For Project 01, the site is a **static** set of pages meant for **GitHub Pages** or similar hosting. The home page carries the embedded calendar. **Learn More** explains the idea. **Submit Event** is a real form: it gathers structured data, enforces required fields including a **featured image**, and hands the package to an **event coordinator** through the device’s share or mail path, because there is **no custom server** in this phase to accept posts silently. **Contact** gives people a human path when the form is not the right channel.

Behind the public face, a **password-protected data admin** lives in the project. I first built it to enter and fix data faster while the JSON model grew. It stayed in the plan as a **maintained tool** because it lines up field names with what the scripts expect and is safer than hand-editing a huge JSON file for every small change. The **README** in the repository is part of the deliverable too: it describes the data shapes, the idea that approved data should eventually feed both the **site JSON** and a **calendar import** path, and who plays which role in that story.

What is **not** fully settled matches the honesty the course asks for. The proposal called for **event detail pages**—digital flyers—and links from featured cards into those pages. That workflow is **still tightening**; some paths may still send a visitor to a general information page instead of a dedicated flyer for one event. The **master data file** also deserves a **normalization pass**: when dates and times are inconsistent, sorting and display can look wrong even though the code is doing something reasonable. That cleanup is queued for the next iteration.

The **submission pipeline** after the coordinator receives a package is another open fork. One path favors a **Google Sheet** as a friendly review grid, then export to JSON and calendar CSV. Another path keeps approved rows **closer to the repository** and the admin tool, with fewer spreadsheet steps. I have not forced a final choice in code because the right answer depends on **who will run operations** and how often mistakes hurt. That decision belongs in Project 02, documented with the same plain language I am using here.

---

## How the plan shifted along the way

The **calendar** story is the clearest pivot. An early notion leaned on experiences that required a **Google sign-in**. That excludes neighbors who do not use Google. Switching to a **public calendar** and embedding it fixed access for anonymous visitors and still let people who want deeper integration use **Google’s subscriptions and notifications** without me building a notification system from scratch.

The **submission** story shifted too. The proposal mentioned an embedded **Google Form**. I moved to a **native HTML and JavaScript form** on static hosting because I could iterate faster on validation and layout, and because the coordinator workflow—**human reviews before anything goes live**—stayed the same. The **data architecture** narrative also matured: instead of pretending one API feeds every pixel, I treat **JSON in the repo** as the source of truth for the site’s structured UI, and the **public calendar** as the parallel surface residents already know, kept in sync through a documented import process rather than brittle parsing tricks.

The **admin** tool is the opposite of a retreat. It started as a convenience and became part of the **long-term maintenance story** because it reduces friction and mistakes for whoever keeps the park calendar honest.

---

## Risks, and what I learned from them

I flagged **integration complexity** with Google Calendar and Sheets as a risk for volunteers. In practice, **sharing the calendar publicly** and embedding it was **simpler and kinder to users** than the login-bound path I first imagined. **Sheet automation**—one button that does everything—is still mostly **aspirational**; until then, the README leans on **simple procedures** and **few moving parts** so a non-expert can still run the season without breaking the site.

---

## How to access the work and what to try

Replace the placeholders in this paragraph with your real URLs before you submit. The live site should open in a **private or signed-out** browser window so you know a grader sees what a stranger sees. The repository address should match your GitHub fork or organization.

Start on the **home** page: you should see the **embedded public calendar** loading. Notice the **left** sidebar’s recurring rhythm and the **featured** or spotlight areas that pull from the JSON model; on a phone, those regions may **stack** instead of sitting side by side. Follow **Learn More**, **Submit Event**, and **Contact** from the navigation so the story of the site holds together. On **Submit Event**, complete the required fields including the **featured image**, and observe how the browser offers to **share or mail** the submission toward the coordinator once you configure the coordinator address on the page. There is **no server** accepting that payload in the background; publishing remains **human-in-the-loop**.

If you demonstrate the **Admin** link from the home page, remember it expects a **desktop** context and a **password**. Do not put the password in this narrative; share it through whatever channel your course allows, or show a recording with credentials redacted.

---

## Limitations I am not hiding

Nothing in the public form **writes directly** into the live JSON file or the calendar. That is intentional for trust and safety, but it means **coordination** is part of the system. **Event detail pages** and **per-card deep links** may lag the ideal described in the Week 05 milestone. **Data ordering** can look off until the JSON dates and times are cleaned up. If the README still mentions an older submission behavior such as automatic file downloads, **trust the live site** or update the README before grading so the documentation and the demo agree.

---

## Reflection before Project 02

Before you lock this submission, sit with your own answers for a few quiet minutes—not to sell the project and not to tear it down, but to see it clearly. Ask whether a resident can **actually discover** what is coming and **understand how to propose** an event with the tools you shipped. Name the two or three gaps that bother you most, whether they are missing flyer pages, messy sort order, or documentation drift. Notice which technical bets you would make again—the public calendar, the JSON model, the admin tool—and which paths wasted time. Admit where you **under-invested early**, perhaps in a strict data contract or in wiring every link from a featured card. If you had to start tomorrow with one change, what would it be? Whatever you write here becomes the bridge into peer review and into Project 02, so it is worth taking seriously.

---

## Sources

This work draws on **Visit McAllen** (https://visitmcallen.com/) and **Eventbrite** (https://www.eventbrite.com/) as examples of large-scale event discovery, contrasted with informal **Facebook** group and event sharing used inside many small communities. For grading, confirm whether your instructor requires a third strictly citable web source or accepts your description of Facebook usage at the park as grounded practice. Internal artifacts include the Week 03 proposal PDF in the repository, the master data JSON file, and the README workflow narrative.

---

## Before you upload to Canvas

Export this narrative to PDF when you are satisfied with length and citations. Confirm the **live URL** one more time. Upload your **concept presentation** as its own file if the assignment separates it. Complete **Project 01** and **Exercise 03** if both are due the same week, using the same core materials where the syllabus says to duplicate.

---

*Narrative companion to `barkle-w5p1-capstone-concept.md` — `barkle-w5p1-capstone-concept-narrative.md`*
