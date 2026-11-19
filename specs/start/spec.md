# Technical Specification & Implementation Plan — TaskAdmin

**Source of truth:** [`specs/start/taskadmin.feature`](./taskadmin.feature)
**Status:** Draft v2

**Scope decision:** **Create**, **list**, and **delete** tasks. The feature narrative says "manage my tasks", but editing, completing, and reordering are explicitly **out of scope** for this iteration.

**Architecture decision:** 100% client-side. Static HTML, CSS, and ES modules, no application server, no framework, no build step, no npm dependencies. Tasks persist in the browser's `localStorage`.

---

## 1. Overview

TaskAdmin is a single-page web app for keeping a personal list of tasks. The user types a title, submits the form, and the task appears immediately in the list below. Each row has a Delete button; removing a task updates the list immediately and persists the result. All state lives in the browser: the app is a set of static files that can be opened from any static host — or from a local static file server during development.

### 1.1 Goals

| Goal | Rationale |
| --- | --- |
| Create a task with a title | Scenario 1 |
| List all tasks | Scenario 2 |
| Delete a task | Scenarios 3–5 |
| Zero infrastructure | No backend, no database, no accounts, no build step |
| Trivially auditable | Four small source files, all readable in one sitting |
| Data survives reload | `localStorage` persistence, including deletions |
| Testable without a browser | Domain + persistence logic isolated behind a storage port |

### 1.2 Non-goals

- Editing, completing, or reordering tasks
- Due dates, priorities, tags, attachments, reminders
- Multi-user support, accounts, sync across devices or browsers
- Search, filtering, pagination, sort controls
- Rich text or markdown in titles
- Server-side rendering, service worker, offline cache, PWA install
- Docker, CI pipeline, deployment automation

### 1.3 Consequences of being client-side

These are accepted trade-offs, not defects:

| Consequence | Detail |
| --- | --- |
| Data is per-browser, per-device | Clearing site data deletes tasks. No sync. |
| Data is not secret | Anyone with access to the browser profile can read `localStorage` in devtools. Titles are non-sensitive by assumption. |
| No server-side validation | Validation is a UX guard, not a security boundary. Nothing is transmitted anywhere. |
| ES modules need an HTTP origin | `file://` blocks module imports, so local use requires a static file server (§8.2). Any static host also works. |

---

## 2. Users & Use Cases

**Primary user:** one person using TaskAdmin in a desktop or mobile browser.

| ID | Use case | Trigger |
| --- | --- | --- |
| UC-1 | Add a task | Type a title, press "Add task" (or Enter) |
| UC-2 | See all tasks | Page load, or immediately after adding or deleting |
| UC-3 | Delete a task | Press the task's "Delete" button (or Enter/Space when focused) |

---

## 3. Functional Requirements

| ID | Requirement | Acceptance signal |
| --- | --- | --- |
| FR-1 | The app MUST create a task from a title of 1–200 characters. | Task appears in the list and in `localStorage` |
| FR-2 | Titles MUST be trimmed before validation and storage. | `"  Buy groceries  "` is stored as `"Buy groceries"` |
| FR-3 | Empty, whitespace-only, or >200-character titles MUST be rejected with an inline message and MUST NOT create a task or write storage. | Error shown, list unchanged, storage unchanged |
| FR-4 | Each task MUST have a unique id and an ISO-8601 UTC creation timestamp. | `id` is a UUID; `createdAt` parses as a valid UTC date |
| FR-5 | Tasks MUST be listed newest first. | Newest `createdAt` at the top |
| FR-6 | With no tasks, the app MUST show an empty state and an empty `<ul>`. | "No tasks yet." visible, list has no children |
| FR-7 | Duplicate titles MUST be allowed. | Two tasks titled "Buy groceries" both persist and render |
| FR-8 | After a successful create, the input MUST be cleared, focus MUST return to the input, and the new task MUST render without a page reload. | Observable in one flow |
| FR-9 | Tasks MUST be persisted across reloads. | Reload → same tasks, same order |
| FR-10 | If stored data is missing, malformed, or not an array, the app MUST render the empty state with a warning and MUST NOT overwrite that data until the next successful create. | Corrupt payload → warning + empty list; payload untouched |
| FR-11 | Every task title MUST be rendered as text, never as markup. | A title of `<img src=x onerror=alert(1)>` displays literally |
| FR-12 | The app MUST work with JavaScript only — no network requests at runtime. | Network tab shows only the app's own files |
| FR-13 | The app MUST delete a task by its unique id and persist the result; a stale or invalid id MUST be a no-op. | Remaining tasks render immediately and storage no longer contains the task |
| FR-14 | Deleting one of several tasks with identical titles MUST remove exactly one task. | Two "Buy groceries" tasks → one remains |
| FR-15 | After deleting the last task, the app MUST show the empty state and an empty `<ul>`. | "No tasks yet." visible, list has no children |
| FR-16 | A deletion MUST survive a reload. | Reload → deleted task stays gone |
| FR-17 | Each task row MUST expose a Delete control with an accessible name that includes the task title. | Button reachable by keyboard; name reads "Delete task: Buy groceries" |

---

## 4. Architecture

```
┌──────────────────────────────────────────────┐
│ Browser                                      │
│                                              │
│  index.html  ──  styles.css                  │
│       │                                      │
│       └── js/app.js        DOM + events       │
│              │                               │
│              ├── js/task-store.js            │
│              │     pure domain:              │
│              │     validate · create ·       │
│              │     list · delete             │
│              │                               │
│              └── js/storage.js               │
│                    localStorage adapter      │
│                    (getItem/setItem/remove)  │
└──────────────────────────────────────────────┘
            │
            ▼
   window.localStorage
   key: taskadmin.tasks.v1
```

### 4.1 Layering rules

1. **`task-store.js` — domain, no DOM, no `localStorage`.** Exposes `createTask`, `listTasks`, `deleteTask`, and persistence orchestration through an injected `storage` port. This is what automated tests exercise.
2. **`storage.js` — the browser adapter.** Wraps `localStorage` behind `read()`, `write(tasks)`, `clear()`, and swallows nothing silently: parse failures are reported as a result, not thrown at the UI. Deletion reuses `write()` with the filtered array, so the port contract is unchanged.
3. **`app.js` — the only DOM-aware module.** Reads elements, wires create and delete events, calls the store, renders. Contains no validation rules, no deletion semantics, and no storage keys.
4. Tests inject a fake storage object, so domain behaviour is fully testable in Node with no browser emulation.

### 4.2 Storage key and payload

- Key: `taskadmin.tasks.v1` (the suffix allows a future breaking shape change without ambiguity).
- Value: JSON array of Task objects.

### 4.3 Browser baseline

Evergreen Chrome, Firefox, Safari, and Edge (last 2 versions). Requires ES modules, `crypto.randomUUID()`, `Intl.DateTimeFormat`, and optional chaining. No transpiling, no polyfills.

---

## 5. Data Model

### 5.1 Task

| Field | Type | Rules |
| --- | --- | --- |
| `id` | string | UUID v4 from `crypto.randomUUID()`, unique within the store |
| `title` | string | Trimmed, 1–200 characters, plain text |
| `createdAt` | string | ISO-8601 UTC, e.g. `2026-11-13T09:14:22.481Z` |

```json
{
  "id": "0f7c1f8e-3f0f-4a4f-9a1a-5f0b2c9d7e11",
  "title": "Buy groceries",
  "createdAt": "2026-11-13T09:14:22.481Z"
}
```

Tasks are deleted by `id`, never by `title`: titles are not unique (FR-7, FR-14).

### 5.2 Invariants enforced on read

Stored data is untrusted: it may be old, hand-edited, or corrupt. On read the store:

1. Returns `[]` when the key is absent.
2. Returns `[]` plus a `corrupt` flag when the value is not valid JSON or not an array.
3. Drops individual array entries that are not objects with a non-empty string `id` and `title`, keeping the rest.
4. Sorts by `createdAt` descending, preserving stored order when timestamps are equal or unparseable.

---

## 6. Module Contracts

### 6.1 `js/task-store.js`

```js
/** @typedef {{ id: string, title: string, createdAt: string }} Task */
/** @typedef {{ read: () => string|null, write: (v: string) => void, clear: () => void }} StoragePort */

export const MAX_TITLE_LENGTH = 200;

/** @returns {{ ok: true, title: string } | { ok: false, message: string }} */
export function validateTitle(raw);

/** Creates a task in memory without touching storage. Throws ValidationError. */
export function buildTask(rawTitle, now = () => new Date()); // → Task

/** Creates and persists a task. Throws on validation or storage failure. */
export function createTask(storage, rawTitle, now = () => new Date()); // → Task

/** @returns {{ tasks: Task[], corrupt: boolean }} */
export function listTasks(storage);

/**
 * Removes the task with the given id and persists the remaining tasks.
 * @returns {{ removed: boolean, tasks: Task[] }}
 */
export function deleteTask(storage, id);

/** Test/dev helper: removes all stored tasks. @returns {void} */
export function clearTasks(storage);
```

Behaviour details:

- `validateTitle` rejects non-strings and returns the trimmed value on success. Message: `"Enter a task title (1–200 characters)."`
- `createTask` validates first and throws a `ValidationError` (exported) for invalid input — so invalid input can never reach storage.
- `createTask` prepends the new task (newest first) rather than relying only on sort order.
- `buildTask` exists so the UI can still show a task created while storage is unavailable, without duplicating id/timestamp logic in `app.js`.
- `deleteTask` matches on `id` only and removes at most one task, so duplicate titles are unaffected beyond the selected row. It returns the remaining list so the UI can render without a second read.
- `deleteTask` accepts only a non-empty string `id`. A non-string, empty, or non-matching id removes nothing: `removed === false` and `storage.write` is not called.
- `deleteTask` reuses the existing `write` port with the filtered array; no new storage method is needed.
- `clearTasks` exists so tests and a future "reset" affordance have one explicit path; the UI does not expose it in v1.

### 6.2 `js/storage.js`

```js
/** @returns {StoragePort} backed by globalThis.localStorage under taskadmin.tasks.v1 */
export function createLocalStoragePort(storageArea = globalThis.localStorage);
```

`read()` returns `null` when the key is missing and never throws. `write()` and `clear()` propagate `QuotaExceededError` and `SecurityError` (private-mode / disabled storage); `app.js` catches these and shows a non-blocking warning, since the in-memory list still works for the session. Deletion uses `write()` with the filtered array, so the port contract is unchanged.

### 6.3 `js/app.js`

Responsibilities, in order:

1. `DOMContentLoaded` → `listTasks(port)` → `render(tasks, { corrupt })`.
2. `submit` on the form → `preventDefault()` → `validateTitle` → on failure show `#form-error` and return.
3. On success → `createTask(port, value)` → `render` with the updated list → clear input → refocus input.
4. `click` delegated on `#task-list` → find the closest `button[data-id]` → `deleteTask(port, id)` → `render` with the returned list. Buttons carry only the task id; no inline handlers.
5. Catch `QuotaExceededError` / `SecurityError` → show "Tasks can't be saved in this browser session" in `#storage-warning` and render the in-memory result anyway: the new task via `buildTask` on create, or the list without the deleted task on delete. The warning makes clear that changes may be lost on reload.
6. Export nothing; runs as a side-effecting entry module.

`render(tasks, flags)` is a pure function that rebuilds the `<ul>` from scratch using `document.createElement` and `textContent` (FR-11). No `innerHTML` with data, no inline handlers, no template strings containing user input. Each `<li>` contains the title as a text node plus a `type="button"` Delete button whose `data-id` holds the task id and whose `aria-label` includes the title (FR-17). `render` presents the current list; it does not decide deletion semantics.

---

## 7. Frontend Specification

### 7.1 Markup (`index.html`)

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:">
  <title>TaskAdmin</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <header class="app-header"><h1>TaskAdmin</h1></header>
  <main>
    <form id="task-form" novalidate>
      <label for="task-title">Task title</label>
      <div class="field-row">
        <input id="task-title" name="title" type="text" maxlength="200"
               autocomplete="off" required aria-describedby="form-error">
        <button type="submit">Add task</button>
      </div>
      <p id="form-error" class="error" role="alert" hidden></p>
      <p id="storage-warning" class="warning" role="status" hidden></p>
    </form>

    <section aria-labelledby="task-list-heading">
      <h2 id="task-list-heading">Tasks</h2>
      <ul id="task-list"></ul>
      <p id="empty-state" hidden>No tasks yet.</p>
    </section>
  </main>
  <script type="module" src="js/app.js"></script>
</body>
</html>
```

`novalidate` is deliberate: the app owns validation so behaviour is identical across browsers and testable in isolation. `maxlength="200"` remains as a soft guard.

Task rows are produced by `render()`, not present in the static HTML:

```html
<li data-id="0f7c1f8e-…">
  <span class="task-title">Buy groceries</span>
  <button type="button" class="delete-task" data-id="0f7c1f8e-…"
          aria-label="Delete task: Buy groceries">Delete</button>
</li>
```

The id is never shown as text and is never derived from the title.

### 7.2 Styling (`styles.css`)

- One stylesheet, system font stack, CSS custom properties for colour and spacing.
- Responsive from 320 px up; long titles wrap with `overflow-wrap: anywhere`.
- `:focus-visible` outline on input and button; error text meets WCAG AA contrast.
- Task rows lay out title and Delete button on one line where space allows, stacking at narrow widths; the Delete button has a distinct hover/focus danger treatment that still meets AA contrast.
- No frameworks, no web fonts, no external requests (consistent with the CSP and FR-12).

### 7.3 Accessibility

Semantic `<header>`, `<main>`, `<section>`, `<form>` with a visible `<label>`, `<ul>`/`<li>` for tasks, `role="alert"` for the error region, and a logical tab order. Full flow is keyboard operable: type → Tab → Enter → focus returns to the input (FR-8). Deletion is keyboard operable too: Tab to a row's Delete button, then Enter or Space. Each button has an accessible name containing the task title (FR-17), and after removal focus moves to the next task's Delete button, or to the title input when the list becomes empty.

---

## 8. File Layout & Running

### 8.1 Layout

```
taskadmin/
├── package.json              # type: module, scripts only, zero dependencies
├── .gitignore
├── index.html
├── styles.css
├── js/
│   ├── app.js                # DOM wiring and rendering
│   ├── task-store.js         # domain: validate, create, list, clear
│   └── storage.js            # localStorage port
├── scripts/
│   └── serve.js              # dev-only static file server (node:http)
├── test/
│   └── task-store.test.js    # node:test, fake storage port
└── specs/start/
    ├── taskadmin.feature
    └── spec.md
```

### 8.2 Running

```json
{
  "name": "taskadmin",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "node scripts/serve.js",
    "test": "node --test"
  }
}
```

- `npm start` → `http://127.0.0.1:3000` (override with `PORT`).
- `scripts/serve.js` is a ~90-line static file server used only for local development because ES modules require an HTTP origin. It serves only `index.html`, `styles.css`, and `js/*`, guards against path traversal, and is **not** an application backend: it has no API, and it is not needed when the app is hosted on any static host.
- Equivalent without Node: `python3 -m http.server 3000`, or upload the four files to GitHub Pages / Netlify / any static host.

---

## 9. Test Strategy

The domain is pure and storage is injected, so the Gherkin scenarios run in Node with `node --test` — no browser, no DOM shim, no dependencies.

| Level | File | Covers |
| --- | --- | --- |
| Unit — validation | `test/task-store.test.js` | trim, 1/200/201 boundaries, empty, whitespace-only, non-string |
| Unit — domain | `test/task-store.test.js` | id uniqueness, timestamp shape, newest-first, duplicates allowed |
| Unit — deletion | `test/task-store.test.js` | delete by id, duplicate titles, last task, stale/invalid id, persistence after reload |
| Unit — persistence | `test/task-store.test.js` | write on create/delete, read round-trip, absent key, corrupt JSON, non-array payload, dropped invalid entries, clear |
| Scenario | `test/task-store.test.js` | all five Gherkin scenarios at the store boundary |
| Manual | §9.2 checklist | DOM wiring, styling, a11y, persistence across reload |

Fake port used by every test:

```js
function fakeStorage(initial = null) {
  let value = initial;
  return {
    read: () => value,
    write: (v) => { value = v; },
    clear: () => { value = null; },
    dump: () => value,          // test-only inspection
  };
}
```

### 9.1 Scenario → test mapping

**Scenario 1 — Create a new task**

| Gherkin step | Test action |
| --- | --- |
| `Given the user has no tasks` | `const storage = fakeStorage()` |
| `When the user creates a task with title "Buy groceries"` | `createTask(storage, "Buy groceries")` |
| `Then the task "Buy groceries" should be added to the task list` | `listTasks(storage).tasks` has exactly one entry titled `"Buy groceries"`; the storage payload also contains it |

**Scenario 2 — List all tasks**

| Gherkin step | Test action |
| --- | --- |
| `Given the user has the following tasks:` (table) | `fakeStorage()`, then one `createTask` per row |
| `When the user requests the list of tasks` | `const { tasks } = listTasks(storage)` |
| `Then the user should see 2 tasks` | `assert.equal(tasks.length, 2)` |
| `And the tasks should include "Buy groceries" and "Read a book"` | order-independent membership check on titles |

**Scenario 3 — Delete a task**

| Gherkin step | Test action |
| --- | --- |
| `Given the user has the following tasks:` (table) | `fakeStorage()`, then one `createTask` per row |
| `When the user deletes the task "Buy groceries"` | capture its `id` from `listTasks`, then `deleteTask(storage, id)` |
| `Then the task "Buy groceries" should no longer be in the task list` | `listTasks(storage).tasks` has no entry titled `"Buy groceries"` |
| `And the task list should contain only "Read a book"` | remaining titles deep-equal `['Read a book']`; storage payload matches |

**Scenario 4 — Delete one of several tasks with the same title**

| Gherkin step | Test action |
| --- | --- |
| `Given the user has the following tasks:` (duplicate rows) | two `createTask` calls with the same title |
| `When the user deletes one of the "Buy groceries" tasks` | `deleteTask(storage, firstTask.id)` |
| `Then the task list should contain exactly 1 task titled "Buy groceries"` | `removed === true`, one task remains, and its id differs from the deleted id |

**Scenario 5 — Delete the last task**

| Gherkin step | Test action |
| --- | --- |
| `Given the user has the following tasks:` (one row) | one `createTask` |
| `When the user deletes the task "Buy groceries"` | `deleteTask(storage, id)` |
| `Then the user should see 0 tasks` | `listTasks(storage).tasks` is empty |
| `And the empty state should be shown` | UI assertion in the §9.2 manual checklist — the store has no DOM |

All tests are named to mirror the scenario text so failures are readable in the runner output.

### 9.2 Manual acceptance checklist

1. `npm start`, open the app → empty state shown, no console errors, no network requests beyond app files.
2. Add "Buy groceries" → appears immediately, input cleared, focus back in the input.
3. Refresh → task still listed.
4. Add "Read a book" → both listed, newest first.
5. Submit only spaces → inline error, nothing added.
6. Paste `<img src=x onerror=alert(1)>` → displays literally, no dialog.
7. Set `localStorage['taskadmin.tasks.v1'] = 'not json'`, reload → warning + empty state; the key still holds `not json` until a task is added.
8. Resize to 320 px → layout intact, no horizontal scroll.
9. Tab and Enter only → full flow works, focus always visible.
10. Disable storage (private mode) → app still usable in-session, warning shown.
11. Add two tasks → press "Delete" on one → only that row disappears, the other stays.
12. Add two tasks with the same title → delete one → exactly one row remains.
13. Refresh after a delete → the deleted task does not reappear.
14. Delete the only remaining task → empty state appears, `<ul>` has no children.
15. Delete via keyboard (Tab to button, then Enter and Space) → focus moves to the next task or the title input.

---

## 10. Implementation Plan

Five checkpoints, each independently verifiable. Estimated total: **4–5 hours**.

### Checkpoint 1 — Skeleton (25 min)

- `package.json` (ESM, scripts, `engines.node >= 24`), `.gitignore`
- `index.html`, empty `styles.css`, empty `js/*.js`
- `scripts/serve.js`: `node:http` static server with a small MIME map, path-traversal guard (`path.resolve` + `startsWith(root)`), `404` fallback, `PORT` override
- **Exit:** `npm start` serves the page; `npm test` exits 0 with no tests

### Checkpoint 2 — Domain + persistence (75 min)

- `js/task-store.js`: `MAX_TITLE_LENGTH`, `validateTitle`, `ValidationError`, `createTask`, `listTasks`, `deleteTask`, `clearTasks`
- `js/storage.js`: `createLocalStoragePort`, safe `read`, throwing `write`/`clear`, key constant
- `test/task-store.test.js`: fake storage + all unit and scenario cases from §9, including all three delete scenarios
- **Exit:** full suite green; deletion is id-based and `task-store.js` imports nothing from `storage.js` and references no globals beyond `crypto`/`Date`

### Checkpoint 3 — UI wiring (75 min)

- `js/app.js`: load → render, submit handler, validation display, input clearing + refocus, delegated delete handler, storage-error fallback
- `render()` with `createElement`/`textContent` only; each row gets a Delete button with `data-id` and an accessible label
- **Exit:** §9.2 steps 1–5, 7, and 11–15 pass by hand

### Checkpoint 4 — Styling + accessibility (45 min)

- `styles.css`: layout, tokens, responsive, focus states, error styling, empty state, Delete button states
- Pass over headings, labels, landmarks, `aria-describedby`, `role="alert"`, and Delete button accessible names
- **Exit:** §9.2 steps 8–9 and 15 pass; axe DevTools reports no serious issues (manual run, no dependency added)

### Checkpoint 5 — Hardening (30 min)

- XSS probe (§9.2 step 6), corrupt-payload probe (step 7), disabled-storage probe (step 10), delete-and-reload probe (step 13)
- CSP check: no console CSP violations on load
- Re-run suite; record results
- **Exit:** definition of done met

### 10.1 Definition of Done

- FR-1 … FR-17 satisfied and demonstrable
- All five Gherkin scenarios pass as automated tests
- `package.json` contains zero dependencies (runtime and dev)
- `npm start` works from a clean checkout with Node 24 only; `python3 -m http.server` also works
- No runtime network requests; no `innerHTML` with user data
- No secrets, no `localStorage` keys other than `taskadmin.tasks.v1`

---

## 11. Traceability Matrix

| Gherkin scenario | Requirements | Implementation | Verification |
| --- | --- | --- | --- |
| Create a new task | FR-1, FR-2, FR-3, FR-4, FR-7, FR-8, FR-11 | `validateTitle`/`createTask` in `task-store.js`; submit path in `app.js` | scenario test 1, validation unit tests, §9.2 steps 2–6 |
| List all tasks | FR-5, FR-6, FR-9, FR-10, FR-11 | `listTasks` in `task-store.js`; `render` in `app.js`; `storage.js` | scenario test 2, ordering/persistence unit tests, §9.2 steps 1, 3, 4, 7 |
| Delete a task | FR-13, FR-16, FR-17 | `deleteTask` in `task-store.js`; delegated click path in `app.js` | scenario test 3, deletion unit tests, §9.2 steps 11, 13, 15 |
| Delete one of several tasks with the same title | FR-7, FR-14, FR-17 | id-based `deleteTask`; `data-id` on Delete buttons | scenario test 4, §9.2 step 12 |
| Delete the last task | FR-6, FR-15 | `deleteTask` + `render` empty state | scenario test 5, §9.2 step 14 |

---

## 12. Risks & Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| User clears site data / changes browser | Tasks lost | Documented as a consequence of client-side storage (§1.3); accepted |
| `localStorage` disabled or full | Create fails silently | Explicit `try/catch` with visible warning; in-memory list still works (FR-10, §6.2) |
| Corrupt or hand-edited payload | Crash or data wipe | Read-time validation; warn, do not overwrite (FR-10) |
| XSS via title | Script execution | `textContent` only, no `innerHTML`, CSP `script-src 'self'` |
| Deleting by title would remove every duplicate | Two or more tasks lost | `deleteTask` matches on unique `id`; Delete buttons carry `data-id` (FR-13, FR-14) |
| Accidental deletion with no undo | User loses a task | Per-row control only, no bulk delete; undo is deferred to future work (§13) |
| `file://` usage | Modules blocked, blank page | Dev static server; documented in §8.2 |
| Scope creep toward "manage" | Missed deadline | Non-goals in §1.2; store API kept small on purpose |
| Unbounded task count | Slow render at thousands of tasks | Out of scope; render is O(n) and acceptable to a few thousand |

---

## 13. Future Work (deferred)

- Complete/uncomplete and edit tasks (would add `updateTask` to the store)
- Undo for deletions, bulk delete, and a confirmation step for destructive actions
- Sorting and filtering controls
- Import/export JSON, or `IndexedDB` for larger datasets
- Optional Playwright end-to-end suite for the DOM layer
- Optional sync backend if multi-device use is ever required — this would need the server-side design deliberately avoided here
