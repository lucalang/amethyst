# Amethyst — Archive, To Do and Arcade in one private app

Organize entries in your own top-level categories. Each entry is its own workspace:
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
  - Top-level categories are private `collections` rows, with stable UUIDs and case-insensitive names unique per account.
  - An entry is an `entries` row with a required `collection_id`, a title, artwork and an optional platform. Legacy `kind` values remain as metadata, not library boundaries.
  - Labels remain in `categories` and `entry_categories`, scoped by `collection_id` independently of top-level category names.
  - Each entry has a tree of `workspace_nodes` (`folder`, `note` or `checklist`). Notes hold Markdown.
  - Checklists hold tasks (`workspace_checklist_items`). Each task has a label, a checked state, notes, an importance flag and an optional due date.
  - Tasks hold ordered steps (`workspace_checklist_steps`).

```
src/app/(auth)             login, register, forgot password, email-link confirmation, sign-out
src/app/(vault)            /[collection] category libraries; /[collection]/new; /[collection]/[id] workspace; settings
src/app/api                JSON route handlers (all authenticated) incl. /api/image proxy
src/components/editor      CodeMirror live-preview Markdown editor, toolbar, commands
src/components/workspace   explorer tree, note editor, task list + task details, move dialog, header
src/components             ui (shadcn), layout, media
src/lib/collections.ts     category types, stable entry paths and legacy route detection
src/lib/images             server-only image fetcher with SSRF protections
src/lib/validation         Zod schemas (entries, workspace, image URLs)
src/lib/data               server-only loaders
src/lib/supabase           SSR clients, proxy session refresh, auth helpers, generated types
supabase/migrations        schema, RLS, RPCs, data migrations
supabase/templates         branded auth emails
supabase/tests             pgTAP RLS/integrity tests
tests/{unit,integration,e2e,support}
```

## Top-level categories

- Every account creates its own categories. Navigation uses the current account's saved categories; new accounts start empty.
- The navbar's **New category** opens a name dialog and then the new empty library. The library's **New entry** still creates an entry in that category, with artwork and a workspace.
- Category menus in navigation, library headers and settings offer rename and confirmed deletion. Names are trimmed, nonempty, at most 60 characters and case-insensitively unique per account.
- A database foreign key blocks deleting categories that contain entries. Move their entries first using **More entry actions → Move to category**. Entry IDs, files, images, progress and completion states are retained.
- Libraries live at `/<category UUID>` and workspaces at `/<category UUID>/<entry UUID>`. Renaming never changes either ID. `/` opens the first saved category or a no-categories empty state.
- Old `/anime`, `/games` and `/other` URLs resolve to each user's migrated category, even after renaming. If that category was deleted they return home. Old entry URLs, including `/entries/<id>` and `/franchise/<id>`, resolve to the entry's current category, including after moves.

## Entry labels

- Each top-level category has independent labels (e.g. *Romance*, *AFK*, *Tower Defense*). Names can be reused in different libraries without linking them.
- An entry can have zero, one or many labels.
- When creating or editing an entry, an optional searchable field selects existing labels or creates new ones inline (Create “Name”). Selections show as removable chips. Changing only labels never modifies the entry or its workspace.
- The library toolbar has a separate **Labels** filter with a searchable checkbox list:
  - Several selections match entries containing **all** of them, combined with search and the other filters. Additional categories are allowed.
  - Results stay within the current library.
  - Active selections show as chips and can be cleared.
- **Settings → Labels** manages labels for the selected category. Renaming or deleting a label affects only that library; entries are kept.
- Moving an entry copies its assigned labels into the destination library, reusing case-insensitive name matches. Other source entries and labels are untouched.
- Label names are trimmed, cannot be empty and are unique per account and top-level category regardless of case.

## Cover progress

- Each note or checklist has a saved **Include in cover progress** setting in its **File actions** menu. Checklist creation offers the same setting.
- Included files contribute their completed and total tasks to the entry header and library cover. Excluded files keep their own task states and remain fully editable.
- Markdown task lists use the GFM parser; task-like text in code blocks or inline code is not counted. Checklist steps are not counted twice.
- The setting is stored per file in Supabase and is unchanged by task edits, empty files, navigation or new sessions.
- Migration `20261008000200_file_cover_progress` keeps existing checklists included and Markdown notes excluded. It preserves content, task states, versions and activity timestamps.

## Artwork from any public host

Cover and banner URLs may use any public `http(s)` host. Images are served same-origin by the authenticated proxy at `/api/image`, which enforces these rules:

- Only `http`/`https` on ports 80 or 443, and no credentials in the URL. `localhost`, `.local`/`.internal` style names and private, loopback, link-local, CGNAT, multicast and reserved IPv4/IPv6 literals are refused, including IPv4-mapped and NAT64 forms.
- DNS is resolved at connect time. Every resolved address must be public, and the socket connects only to those checked addresses, which defeats DNS rebinding.
- Redirects are followed manually (at most 3), and every hop is re-validated.
- The response must really be an image: the content type is checked and the magic bytes are sniffed. Limits are 10 MB and 10 s.
- Responses carry `nosniff`, `Cross-Origin-Resource-Policy: same-origin` and a sandboxed CSP, so a proxied SVG can never run script.

Forms show a live preview. When a link will not work, they explain why: private address, a web page instead of an image, hotlink blocking, not found, too large, and so on.

## Uploaded images (private Cloudflare R2)

Uploaded note images, covers, banners, avatars and Home artwork are always linked as `/api/attachments/<name>`. The name is unique per account, and the storage key is `<user id>/<name>` in both stores. That route checks the session, looks up the account's row in `public.attachment_objects` (the manifest) and redirects:

- **Verified R2 copy** (`r2_state = 'verified'`): to a presigned R2 URL. URLs are signed per 2-hour window and stay valid for 4 hours, so an unchanged image keeps one URL and stays in the browser cache. The redirect is cached `private` and always expires 5 minutes before the signature does.
- **No row, or a Supabase upload:** to a 1-hour signed URL from the legacy `note-attachments` bucket. This is the controlled fallback for images that have not been migrated. Errors from R2 never trigger it.
- **Unconfirmed R2 upload:** 404.

Uploads go through `POST /api/attachments`. It reserves a free name in the manifest (taken names get a number, like "… 1.png"; the legacy bucket is checked too) and returns a 10-minute presigned PUT. The signature fixes the content type and size and includes `If-None-Match: *`, so nothing can be overwritten. `POST /api/attachments/<name>` then checks the stored object (size, type, MD5 ETag) before marking it verified. Bucket keys come only from the verified session user and a validated name.

Signing out sends `Clear-Site-Data: "cache"`, and image redirects use `Vary: Cookie`. The bucket is never public. The 3D Showcase loads textures through `?cors`, which is signed as a separate URL, so a cached non-CORS response is never reused for WebGL.

### Cloudflare setup (dashboard)

1. **R2 Object Storage → Create bucket**, for example `amethyst-images`, with automatic location and the Standard class. Keep **Public access** disabled: no r2.dev URL and no custom domain. Enabling R2 asks you to subscribe to the R2 plan. The free tier covers 10 GB, 1M Class A and 10M Class B operations per month, and egress is free; whether to subscribe is your decision.
2. **Bucket → Settings → CORS policy → Add**. Use your real app origins:
   ```json
   [{ "AllowedOrigins": ["https://YOUR-APP-DOMAIN", "http://localhost:3000"], "AllowedMethods": ["GET", "HEAD", "PUT"], "AllowedHeaders": ["content-type", "if-none-match"], "ExposeHeaders": ["ETag"], "MaxAgeSeconds": 3600 }]
   ```
3. **R2 Object Storage → Manage API tokens → Create API token**. Choose **Object Read & Write**, apply it to **this bucket only**, and create it. Copy the Access Key ID and Secret Access Key straight into your environment; they are shown once. The Account ID is shown on the R2 overview page.
4. Set `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` and `R2_BUCKET` in `.env.local` (for the migration script) and in the hosting environment, then redeploy. The CSP is built at build time.

### Migration, cutover and rollback

1. Apply migration `20261101000100_r2_attachments` (`npx supabase db push`). It only adds the manifest table and functions.
2. Deploy with the R2 variables set and `ATTACHMENT_STORAGE` unset or `supabase`. Nothing changes for users yet.
3. `npm run images:migrate` (dry run) lists the legacy objects and the bytes still to copy. That figure is the one-time Supabase download. It also lists saved references that exist in neither store, direct Supabase Storage links saved in data, keys that cannot be copied, and whether R2 is reachable. Nothing is downloaded.
4. Run `npm run images:migrate -- --apply`. Optional flags: `--limit N` and `--concurrency 1–8` (default 4).
   - Each object is downloaded once and its size and Supabase ETag are checked.
   - It is then written to R2 with `Content-MD5` (checked by R2) and `If-None-Match: *`, read back and compared by SHA-256. Only then is it recorded as verified.
   - Transient errors are retried up to 3 times. Different content already in R2 is reported as a collision and never overwritten.
   - Quota or plan refusals from Supabase stop the run (exit code 2).
   - Every result goes to `.r2-migration/*.jsonl`. Re-running skips verified objects.
5. Run `npm run images:migrate -- --verify` to re-download every verified R2 object and compare it against the manifest.
6. **Cutover:** set `ATTACHMENT_STORAGE=r2` and redeploy. New uploads go to R2, and migrated images load from R2.
7. **Rollback:** set `ATTACHMENT_STORAGE=supabase` and redeploy. Migrated images load from their untouched Supabase originals, and new uploads go to Supabase. Images uploaded to R2 after cutover keep loading from R2 as long as the R2 variables stay set. To cut over again, run `--apply` first, which copies images uploaded during the rollback.

**Future cleanup (separate, manual, not automated):** only after a long stable period with `--verify` passing and a fresh R2 backup, delete Supabase originals whose manifest rows have `origin = 'supabase'` and `r2_state = 'verified'`. Keep the bucket and its policies until no rows depend on the legacy fallback.

### Backups

Database backups (Supabase backups or `supabase db dump`) contain the manifest but **no image files**. R2 images need their own backup, for example `rclone sync` or `aws s3 sync --endpoint-url https://<account id>.r2.cloudflarestorage.com` with a read-only token into separate storage. The manifest's SHA-256 values let you check a restored copy. Until cleanup, the Supabase bucket still holds the migrated originals, but not images uploaded to R2 after cutover.

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
| `SUPABASE_SECRET_KEY` | scripts/tests only, server-side | `npm run user:invite`, `npm run images:migrate` and integration/E2E tests; never `NEXT_PUBLIC_` |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | app + migration script, server-side only | Private R2 bucket for uploaded images (all four or none); never `NEXT_PUBLIC_` |
| `R2_ENDPOINT` | optional | Only for jurisdiction buckets (`https://<account>.eu.r2.cloudflarestorage.com`) |
| `ATTACHMENT_STORAGE` | app | `supabase` (default and rollback) or `r2` (cutover) |

`EXTRA_IMAGE_HOSTS` was removed; artwork hosts no longer need an allowlist.

## Database

Migrations live in `supabase/migrations` and are applied in order. Migrations 1–8 built the earlier catalog/MyAnimeList model. `…0900_workspaces` converted it into workspaces: folders, notes, checklists, RLS, RPCs and read-model views, migrating all earlier data before dropping the old tables. `…1000_amethyst` adds the current features:

- Artwork URL checks now accept `http(s)`. SSRF rules are enforced by the proxy at request time.
- Tasks gain `notes` (≤ 20,000 characters), `starred` and `due_date` (1900–2999). Existing tasks keep their label, checked state and order, and get the defaults.
- New table `workspace_checklist_steps`:
  - A composite `(user_id, item_id)` foreign key with cascade, trimmed labels, and a trigger so steps cannot move between tasks.
  - RLS, and column grants that keep ids, owners and timestamps out of client control.
  - The invoker RPCs `add_checklist_step` (locks the task for gap-free positions) and `reorder_checklist_steps` (requires a complete order).

`20261001000100_categories` adds `categories` and `entry_categories`:

- Names are unique per account case-insensitively, via a unique index on `lower(name)`.
- Composite owner foreign keys mean an assignment can only join an entry and a category of the same account. Both cascade on delete, so deleting a category never deletes entries.
- RLS and column grants restrict access to the owning account.
- The invoker RPC `set_entry_categories` replaces an entry's assignments in one step.

Existing entries start uncategorized.

`20261008000100_category_entry_types` scopes categories and assignments to their entry type. Shared legacy categories are split while preserving assignments; unused legacy categories remain available independently in each type. Apply it before deploying the updated app, using `npx supabase migration up --local` locally or `npx supabase db push` for a linked hosted project. Neither requires a data reset.

Regenerate types with `npm run db:types`.

### Upgrade to user-owned categories

Apply `20261019000100_user_collections.sql` before using this version of the app:

```bash
npx supabase migration up --local  # local Supabase
# OR, for a linked hosted project:
npx supabase db push
```

Do not run `db reset`. This migration creates independent Anime, Games and Other category records for every existing user, assigns existing entries and labels to their matching category, and keeps all entry and label IDs and label assignments. It does not modify workspace nodes, attachments, images, checklists, progress settings or completion states. The migrated categories are ordinary renameable and empty-only deletable categories. New users are not given mandatory categories.

Restart the app after applying the migration. Existing test fixtures still assume fixed libraries and need explicit category IDs before their next update; they were not changed as part of this migration.

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

Production builds use `tsconfig.build.json`, which inherits the strict application settings but excludes `tests`. Next.js 16.3 runs the TypeScript CLI during builds, so legacy test fixtures otherwise block deployment even when the application compiles. Development and `npm run typecheck` keep the original `tsconfig.json`, including test diagnostics; no application type errors are ignored.

`test:e2e` needs:

- Playwright's Chromium (`npx playwright install chromium`) and its system libraries (`npx playwright install-deps`). Without root, you can extract the missing libraries from `.deb` packages into a user directory and expose them with `LD_LIBRARY_PATH`.
- The local Supabase stack, including Mailpit, for the registration and password-reset flows.
- Internet access, for the external artwork checks against placehold.co, picsum.photos, example.com and httpbin.org.

The E2E setup deletes and recreates the `e2e-*@test.local` users.
