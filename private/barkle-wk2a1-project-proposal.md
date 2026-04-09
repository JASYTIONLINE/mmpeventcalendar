# Project Proposal
## Brownsville Kuk Sool Won Student Progress Dashboard

Live URL: https://jasytionline.github.io/r73-ksw-dashboard/  
Repository URL: https://github.com/JASYTIONLINE/r73-ksw-dashboard

---

## 1. Project Description

This project is a student dashboard for Brownsville Kuk Sool Won. The main idea is simple: a student picks their current rank and next test date, and the site shows what they need to know for that test. From there, they can track each requirement with a progress level so they can see what is solid and what still needs work.

This matters because right now most students are tracking progress in scattered ways (memory, random notes, verbal reminders, screenshots, etc.). Class time is limited, so most prep happens outside class. When requirements are not in one clear place, people miss things and show up unsure of what they should be practicing. This dashboard is meant to fix that by giving students one place to see requirements and stay organized.

The primary audience is students preparing for promotion tests at Brownsville Kuk Sool Won. Instructors and parents can also benefit because progress is easier to discuss when the student has a clear tracker. This is not an official grading system. It is a personal progress tool to help students prepare better before instructor evaluation.

---

## 2. Feature Plan

The plan is intentionally scoped so Project 01 is actually buildable and usable, and Project 02 is where I improve quality and structure. I originally had bigger ideas (instructor dashboard, training media, more complex comms), but I cut those so I can finish a solid core product first.

### Project 01 (Week 05) - Core Functionality

- **Rank Selection Input**  
  Student selects current rank from a dropdown, and that choice controls what requirement list loads.

- **Test Date Input**  
  Student selects next testing date using a calendar input so they can see how much time is left.

- **Requirement Display by Rank**  
  Dashboard displays required material for the selected rank from a JSON data file.

- **Proficiency Tracking per Requirement**  
  Each requirement uses four progress levels (Untrained, Exposed, Trained, Proficient) so the student can self-track honestly.

- **Persistent Student State**  
  Rank, test date, and progress selections are saved in browser localStorage so progress is still there when the student comes back.

- **Instructor Contact Action**  
  Dashboard includes a simple email link so student can request an instructor audit.

### Project 02 (Week 08) - Refinement and Enhancement

- **UI/UX Component Refinement**  
  Refine components so the page is cleaner, easier to scan, and more consistent.

- **Streamlined Navigation**  
  Simplify navigation so students get to what they need faster with less clicking around.

- **Enhanced Skill Progression Interface**  
  Improve how skill progression is shown so students can quickly understand where they stand.

- **Structured Instructor Contact Categories**  
  Upgrade instructor contact from one generic email action to categories (audit request, clarification, progress review, schedule question).

- **Context Images and Visual Support**  
  Add selected images/icons that add context and help usability without making the page busy.

- **Template Standardization for Expansion**  
  Lock in a reusable page template by page category so the site is easier to expand later.

### Design Decision Rationale

The main design decision was to cut scope hard and focus on the one thing that matters: helping students prepare for testing. If a feature did not support that directly, I removed it for now. I would rather turn in a clean, working core product than a half-finished oversized system.

---

## 3. Tools and Technologies

### Code Editor / Development Environment
I am using Cursor as my main editor because it helps me move faster with AI-assisted coding and debugging across the project. I keep VS Code as a backup because I already know it well and trust it.

### Framework / Approach
I am building this with plain HTML, CSS, and JavaScript. I considered React, Tailwind, and Bootstrap, but decided against them for this phase. For this scope, those tools add complexity I do not need and make it easier to overbuild. I want a codebase I can read, maintain, and debug myself.

### Hosting and Deployment
I am hosting on GitHub Pages because it connects directly to the repo and gives me a simple deployment flow that matches a static project. It also works seemlessly with GH Desktop which simplifies syncing.

### Data Management
Curriculum requirements are stored in one local JSON file because the data is finite and structured. Student progress is stored in localStorage so state can persist without adding a backend.

### AI Tools
I am using Cursor AI and ChatGPT for planning, debugging, and implementation support.

### Other Tools
I use GitHub Desktop and Git CLI for version control. Node.js and npm are installed to keep my local environment stable and ready for tooling when needed.

---

## 4. Risks and Unknowns

- **Dynamic data-to-UI mapping risk**  
  Mapping rank selection to the correct requirement list is one area I could get wrong if the JS logic is sloppy.  
  **Mitigation:** build and test one rank first, then scale to the rest after that flow is stable.

- **State persistence risk (localStorage)**  
  Saving and loading progress reliably with localStorage can cause weird behavior if keys or update logic are inconsistent.  
  **Mitigation:** use a consistent key structure, set clear defaults, and test state changes after every update.

- **Scope creep risk**  
  My biggest project-management risk is trying to add too much (media, accounts, complex messaging, etc.) before the core is done.  
  **Mitigation:** stick to MVP boundaries and only add features if they directly support test preparation.

- **AI overengineering risk**  
  I also risk over-relying on AI and ending up with code I cannot explain or debug.  
  **Mitigation:** keep implementation simple (HTML/CSS/JS/JSON), review AI output carefully, and refactor anything I do not understand.