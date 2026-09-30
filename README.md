# Amethyst Archives — private anime & game workspaces

Anime and games live in separate libraries. Each entry is its own workspace:
a VS Code-style explorer of nested folders on the left, and an editor for
Markdown notes and task lists on the right. All data belongs to the signed-in
user. There is no external catalog or sync.

- **Stack:** Next.js 16 (App Router, `src/proxy.ts`), strict TypeScript, Tailwind CSS 4, shadcn/ui (Radix), Lucide, CodeMirror 6, TanStack Query, Zod, Supabase (Auth, Postgres), Vitest, Playwright.
- **Visual direction:** pitch black (`#000000`) with near-black surfaces. Amethyst (`#a57cff`) is the primary accent, and rose (`#f472a8`) is a restrained secondary for checklists, importance and warnings. Manrope. Short entrance motion and scroll-linked exits that respect `prefers-reduced-motion`.

## Architecture

```mermaid
flowchart LR
  B[Browser] -->|cookies, same-origin JSON| N[Next.js server<br/>proxy.ts, route handlers, server actions]
  N -->|user JWT, RLS| DB[(Supabase Postgres)]
  N -->|image proxy: public HTTP(S) only| W[(Image hosts)]
```

- Every vault page, route handler and server action checks the session with `supabase.auth.getClaims()`. Ownership always comes from the verified `sub`, never from client input. All data access uses the user's JWT, so RLS applies. The app never uses the Supabase secret key; only `npm run user:invite` and the tests do.
- Data model:
  - An entry is an `entries` row: `anime`, `game` or `custom`, with a title, artwork and an optional platform.
  - Each entry has a tree of `workspace_nodes` (`folder`, `note` or `checklist`). Notes hold Markdown.
  - Checklists hold tasks (`workspace_checklist_items`). Each task has a label, a checked state, notes, an importance flag and an optional due date.
  - Tasks hold ordered steps (`workspace_checklist_steps`).

```
src/app/(auth)             login, register, forgot password, email-link confirmation, sign-out
src/app/(vault)            /anime, /games, /other libraries; /[collection]/new; /[collection]/[id] workspace; settings
src/app/api                JSON route handlers (all authenticated) incl. /api/image proxy
src/components/editor      CodeMirror live-preview Markdown editor, toolbar, commands
src/components/workspace   explorer tree, note editor, task list + task details, move dialog, header
src/components             ui (shadcn), layout, media
src/lib/collections.ts     the Anime / Games / Other collections and their routes
src/lib/images             server-only image fetcher with SSRF protections
src/lib/validation         Zod schemas (entries, workspace, image URLs)
src/lib/data               server-only loaders
src/lib/supabase           SSR clients, proxy session refresh, auth helpers, generated types
supabase/migrations        schema, RLS, RPCs, data migrations
supabase/templates         branded auth emails
supabase/tests             pgTAP RLS/integrity tests
tests/{unit,integration,e2e,support}
```

## Collections

- **Anime** (`/anime`) and **Games** (`/games`) are separate top-level destinations. Each has its own library, search, progress filter, sort and **New** flow, so a game never appears in the anime library.
- Custom entries created before this split keep their `custom` kind and appear under **Other** (`/other`). That tab only shows when such entries exist.
- An entry's workspace lives at `/<collection>/<id>`. Old `/entries/<id>` and `/franchise/<id>` links redirect there, and `/` redirects to `/anime`.

## Artwork from any public host

Cover and banner URLs may use any public `http(s)` host. Images are served same-origin by the authenticated proxy at `/api/image`, which enforces these rules:

- Only `http`/`https` on ports 80 or 443, and no credentials in the URL. `localhost`, `.local`/`.internal` style names and private, loopback, link-local, CGNAT, multicast and reserved IPv4/IPv6 literals are refused, including IPv4-mapped and NAT64 forms.
- DNS is resolved at connect time. Every resolved address must be public, and the socket connects only to those checked addresses, which defeats DNS rebinding.
- Redirects are followed manually (at most 3), and every hop is re-validated.
- The response must really be an image: the content type is checked and the magic bytes are sniffed. Limits are 10 MB and 10 s.
- Responses carry `nosniff`, `Cross-Origin-Resource-Policy: same-origin` and a sandboxed CSP, so a proxied SVG can never run script.

Forms show a live preview. When a link will not work, they explain why: private address, a web page instead of an image, hotlink blocking, not found, too large, and so on.

## The workspace

- **Header:** shows the artwork, title and task progress. It is never sticky. As you scroll it shrinks and fades away with a scroll-driven animation (`animation-timeline: view()`, plus a small JS fallback for browsers without it).
- **Explorer:**
  - Nested folders with guide lines, sorted naturally.
  - Inline create and rename (`F2`), drag-and-drop or **Move to…**, and delete with a confirmation.
  - Keyboard navigation. Expanded folders are remembered per browser, and the open file is kept in `?file=`.
  - On desktop it can be hidden. On small screens it opens as a sheet from **Files**.
- **Notes: live preview editor.** An Obsidian-style editor built on CodeMirror 6:
  - Markdown syntax (`##`, `**`, `*`, `~~`, `` ` ``, link brackets) is visible and editable on the caret line and hidden on other lines. Headings, emphasis, links, lists, quotes and code stay styled.
  - Heading colours: H1 soft lavender, H2 vivid purple, H3 magenta, H4 rose; H5 and H6 continue in muted lilac. Sizes shrink by level.
  - Toolbar: text style (body, H1–H6), bold, italic, link, bulleted, numbered and task lists, undo, redo. Shortcuts: `Ctrl/⌘+B`, `I`, `K`, `S`, `Ctrl/⌘+Alt+0…6`, and undo/redo.
  - The stored value is the exact Markdown you typed.
  - Autosave runs 700 ms after typing stops, on blur and on `Ctrl/⌘+S`. It shows *Unsaved changes*, *Saving…*, *Saved* or *Not saved* with **Retry**.
  - Drafts are mirrored to `localStorage` until the server confirms them.
  - Version checks stop two tabs from silently overwriting each other: you choose **Keep my version** or **Load the other version**.
- **Task lists**, in the style of Microsoft To Do:
  - Circular checks and subtle separators. Completed tasks move into a collapsible **Completed** section; whether it is shown is remembered.
  - Each row shows its step count, due date (overdue dates in rose) and a notes indicator.
  - Star a task to mark it important. Rename it inline (`F2` or the menu), reorder it (menu or `Alt+↑/↓`) and delete it (you're asked to confirm when it has steps or notes).
  - Add one task, or paste a list (one task per line).
  - Clicking a task expands its details in place:
    - Steps with their own checks and an "x of y" count, which can be added, renamed, reordered (`Alt+↑/↓`) and deleted.
    - A due date, with *Today / Tomorrow / Next week* shortcuts.
    - Notes that autosave with a `localStorage` backup and **Retry** on failure.
  - Changes apply optimistically and are sent in order. A failed change rolls back and is reported.
- **Motion:**
  - Page elements enter with a 240 ms fade plus a 6 px rise, with a stagger capped at six steps. Entrances run on page load only, never on keystrokes.
  - Library cards and page headers fade as they scroll under the top bar.
  - With reduced motion, entrance and scroll-linked animations are off.

## Local setup

Requirements: Node 20.9+ (24 used), Docker.

```bash
npm install
npx supabase start                    # local Postgres/Auth/Mailpit (first run pulls images)
cp .env.example .env.local            # fill in from `npx supabase status`
npx supabase migration up             # apply new migrations, keeping data (db reset wipes it)
npm run dev                           # register at http://localhost:3000/register
```

Local auth emails (confirmation, password reset, magic links) arrive in Mailpit at http://127.0.0.1:54324. `npm run user:invite -- --email you@example.com --password` still creates pre-confirmed accounts.

### Environment variables

| Variable | Where | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | app | Supabase project URL and publishable key |
| `APP_URL` | app | Public base URL (email redirects, Origin checks) |
| `SUPABASE_SECRET_KEY` | scripts/tests only, server-side | `npm run user:invite` and integration/E2E tests; never `NEXT_PUBLIC_` |

`EXTRA_IMAGE_HOSTS` was removed; artwork hosts no longer need an allowlist.

## Database

Migrations live in `supabase/migrations` and are applied in order. Migrations 1–8 built the earlier catalog/MyAnimeList model. `…0900_workspaces` converted it into workspaces: folders, notes, checklists, RLS, RPCs and read-model views, migrating all earlier data before dropping the old tables. `…1000_amethyst` adds the current features:

- Artwork URL checks now accept `http(s)`. SSRF rules are enforced by the proxy at request time.
- Tasks gain `notes` (≤ 20,000 characters), `starred` and `due_date` (1900–2999). Existing tasks keep their label, checked state and order, and get the defaults.
- New table `workspace_checklist_steps`:
  - A composite `(user_id, item_id)` foreign key with cascade, trimmed labels, and a trigger so steps cannot move between tasks.
  - RLS, and column grants that keep ids, owners and timestamps out of client control.
  - The invoker RPCs `add_checklist_step` (locks the task for gap-free positions) and `reorder_checklist_steps` (requires a complete order).

Regenerate types with `npm run db:types`.

## Authentication

- Email + password via Supabase SSR cookies (`@supabase/ssr`, `getClaims()` in `src/proxy.ts` and every handler). Magic links remain available for existing accounts (`shouldCreateUser: false`). Sessions persist until sign-out.
- **Public registration** at `/register`:
  - Passwords need 10+ characters with letters and digits.
  - Email confirmation is required (`[auth] enable_signup = true`, `[auth.email] enable_confirmations = true`). Signing in before confirming explains this and offers to resend the email. The response is the same whether or not the address exists.
- **Password reset** at `/forgot-password` emails a recovery link that opens `/settings/password`.
- All email links go to `/auth/confirm?token_hash=…&type=…`, which verifies server-side and then creates the profile idempotently. The branded templates are in `supabase/templates`: confirmation, invite, magic link and recovery.
- Isolation is enforced by RLS on every table, including task steps. Integration, pgTAP and E2E tests check it with separate accounts.

### Deploying (hosted Supabase)

1. **Auth → Providers → Email:**
   - Enable email sign-ups and **Confirm email**.
   - Set the minimum password length to 10, or rely on the app's own check.
2. **Auth → URL configuration:**
   - Set the Site URL to your `APP_URL`.
   - Add `APP_URL/**` to the redirect URLs.
3. **Auth → Email templates:** paste the four templates from `supabase/templates` and their subjects from `supabase/config.toml`.
4. **Auth → SMTP:**
   - Configure a real provider (Resend, Postmark, SES, SendGrid…) with a verified sender domain (SPF/DKIM).
   - The built-in sender is heavily rate limited and only meant for testing.
   - After that, raise **Auth → Rate limits → emails per hour** to match expected sign-ups.
5. Consider CAPTCHA (**Auth → Bot and abuse protection**) now that sign-up is public.
6. Apply migrations (`npx supabase db push`). Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `APP_URL` in the hosting environment. The secret key is not needed by the app.
7. The image proxy makes outbound HTTP(S) requests from the server. The hosting platform must allow egress, and serverless timeouts must be above 10 s.

## Commands

```bash
npm run dev               # Next.js dev server
npm run typecheck && npm run lint
npm test                  # unit tests
npm run test:db           # pgTAP RLS/integrity tests (local Supabase)
npm run test:integration  # RLS, registration and workspace rules against local Supabase
npm run test:e2e          # Playwright journeys (desktop + mobile) on :3100; screenshots in tests/e2e/screenshots
npm run build
```

`test:e2e` needs:

- Playwright's Chromium (`npx playwright install chromium`) and its system libraries (`npx playwright install-deps`). Without root, you can extract the missing libraries from `.deb` packages into a user directory and expose them with `LD_LIBRARY_PATH`.
- The local Supabase stack, including Mailpit, for the registration and password-reset flows.
- Internet access, for the external artwork checks against placehold.co, picsum.photos, example.com and httpbin.org.

The E2E setup deletes and recreates the `e2e-*@test.local` users.
