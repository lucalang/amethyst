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

- **Verified R2 copy** (`r2_state = 'verified'`): to a presigned R2 URL, regardless of `ATTACHMENT_STORAGE`. URLs are signed per 2-hour window and stay valid for 4 hours, so an unchanged image keeps one URL and stays in the browser cache. The redirect is cached `private` and always expires 5 minutes before the signature does. Missing R2 configuration returns an error, never a silent Supabase download.
- **No row, or a Supabase upload without a verified R2 copy:** to a 1-hour signed URL from the legacy `note-attachments` bucket. This is the controlled fallback for images that have not been migrated. Errors from R2 never trigger it.
- **Unconfirmed R2 upload:** 404.

Uploads default to R2 and go through `POST /api/attachments`. It reserves a free name in the manifest (taken names get a number, like "… 1.png"; the legacy bucket is checked too) and returns a 10-minute presigned PUT. The signature fixes the content type and size and includes `If-None-Match: *`, so nothing can be overwritten. `POST /api/attachments/<name>` then checks the stored object (size, type, MD5 ETag) before marking it verified. Bucket keys come only from the verified session user and a validated name.

Signing out sends `Clear-Site-Data: "cache"`, and image redirects use `Vary: Cookie`. The bucket is never public. The 3D Showcase loads textures through `?cors`, which is signed as a separate URL, so a cached non-CORS response is never reused for WebGL.

### Cloudflare setup (dashboard)

1. **R2 Object Storage → Create bucket**, for example `amethyst-images`, with automatic location and the Standard class. Keep **Public access** disabled: no r2.dev URL and no custom domain. Enabling R2 asks you to subscribe to the R2 plan. The free tier covers 10 GB, 1M Class A and 10M Class B operations per month, and egress is free; whether to subscribe is your decision.
2. **Bucket → Settings → CORS policy → Add**. Use your real app origins:
   ```json
   [{ "AllowedOrigins": ["https://YOUR-APP-DOMAIN", "http://localhost:3000"], "AllowedMethods": ["GET", "HEAD", "PUT"], "AllowedHeaders": ["content-type", "if-none-match"], "ExposeHeaders": ["ETag"], "MaxAgeSeconds": 3600 }]
   ```
3. **R2 Object Storage → Manage API tokens → Create API token**. Choose **Object Read & Write**, apply it to **this bucket only**, and create it. Copy the Access Key ID and Secret Access Key straight into your environment; they are shown once. The Account ID is shown on the R2 overview page.
4. Set `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` and `R2_BUCKET` in `.env.local` (for the migration script) and in the hosting environment, then redeploy. The CSP is built at build time.

### Migration and deployment

1. Apply migration `20261101000100_r2_attachments` (`npx supabase db push`). It only adds the manifest table and functions.
2. Set the R2 variables in the hosting environment before building. Verified images always use R2; images not yet migrated keep using Supabase. `ATTACHMENT_STORAGE` controls new uploads only and defaults to `r2` when all four R2 variables are set, otherwise `supabase`. R2 settings never block unrelated routes.
3. `npm run images:migrate` (dry run) lists the legacy objects and the bytes still to copy. That figure is the one-time Supabase download. It also lists saved references that exist in neither store, direct Supabase Storage links saved in data, keys that cannot be copied, and whether R2 is reachable. Nothing is downloaded.
4. Run `npm run images:migrate -- --apply`. Optional flags: `--limit N` and `--concurrency 1–8` (default 4).
  - Already verified objects with matching source size and checksum are skipped without downloading them.
  - Before downloading a missing copy from Supabase, R2 must be reachable. An existing R2 object from an interrupted run is read and checked against the source size, type and MD5, plus its SHA-256 metadata when present, then recorded without downloading Supabase again. Unverifiable or different objects are reported, never overwritten.
  - A genuinely missing object is downloaded from Supabase and its size and Supabase ETag are checked.
   - It is then written to R2 with `Content-MD5` (checked by R2) and `If-None-Match: *`, read back and compared by SHA-256. Only then is it recorded as verified.
   - Transient errors are retried up to 3 times. Different content already in R2 is reported as a collision and never overwritten.
   - Quota or plan refusals from Supabase stop the run (exit code 2).
   - Every result goes to `.r2-migration/*.jsonl`. Re-running skips verified objects.
5. Run `npm run images:migrate -- --verify` to re-download every verified R2 object and compare it against the manifest.
6. **Hosted cutover:** explicitly set `ATTACHMENT_STORAGE=r2` in Production (and Preview if used), removing any old `supabase` override, and redeploy this code with all four R2 variables present at build and runtime. New uploads go to R2. Keep the bucket private, with CORS allowing the exact deployed app origin; the build-time CSP must include the R2 endpoint. Restart an already running local server after changing `.env.local`.
7. **Emergency upload fallback:** explicitly set `ATTACHMENT_STORAGE=supabase` and redeploy to send only new uploads to Supabase. This no longer rolls migrated reads back to Supabase. Keep R2 configured for verified attachments; restore missing R2 files from a verified backup or the untouched originals rather than silently increasing Supabase egress. Run `--apply` again before returning uploads to R2.

**2026-10-29 audit:** all 179 legacy objects (124.30 MiB) already had verified R2 manifest rows. A fresh R2-only checksum verification passed for all 179, including `ag_update22_cover.png`, `noFilter (54).webp` and `universal_tower_defense_update3.0_part2.png`. The scanned saved references had no missing files or direct Supabase Storage URLs. The local upload setting was still `supabase`, which previously also forced migrated downloads back to Supabase. No note content, stored image URLs, Supabase originals or schema were changed. The SDK now uses IPv4 HTTPS connections with bounded timeouts, following a failed default connection and successful IPv4 verification. Hosted environment values and the running deployment still need to be checked by the deployment operator.

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
| `ATTACHMENT_STORAGE` | app | Unset: `r2` when configured, else `supabase`; explicit `supabase` is an emergency fallback for new uploads only. Verified reads always use R2. |

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

## Secret codes (the Vault)

Codes for `/vault` are managed from a trusted machine with the service-role key in `.env.local`. The database stores only SHA-256 hashes; codes, reward logic and validation never ship to the browser.

```bash
npm run codes -- rewards                     # item ids a code can grant (secret ones stay hidden from the shop)
npm run codes -- create --code "SHADOW" --label "Shadow reward" --coins 500   # your own word or phrase
npm run codes -- create --label "Winter letter" --coins 100 --items vault-sigil,badge-comet --expires 2026-12-31 --max 50   # random code
npm run codes -- create --label "Party" --coins 50 --custom   # your own words, typed as hidden input (stays out of shell history)
npm run codes -- list                        # rewards, expiry, uses, status and format (never the code itself)
npm run codes -- disable <id>                # stop a code; rewards already granted stay
```

- Chosen codes (`--code` or `--custom`) are words or phrases of letters, numbers and spaces, 4–64 characters, e.g. `SHADOW` or `OPEN THE VAULT`. Letter case doesn't matter, surrounding spaces are trimmed and repeated spaces count as one, so `open  the vault` opens `OPEN THE VAULT` (but `OPENTHEVAULT` doesn't).
- Random codes (no `--code`) and every code created before chosen words keep working as before: only letters and numbers count, so dashes and spaces don't matter.
- A code that differs from an existing one only in case, spacing or punctuation is rejected, even if the old one expired or was disabled. Short or common words are easier to guess; wrong tries are throttled per account.
- A generated code is printed **once**. Share codes privately; never commit, log or paste active codes into issues, docs or chat.
- Each account can redeem a code once. `--max` caps total redemptions, `--expires` sets an end date. Expired, used-up and disabled codes tell players the seal is dormant.
- Disable instead of deleting: redeemed codes can't be deleted (redemptions reference them). In an emergency you can also set `secret_codes.disabled_at` in the Supabase Table Editor.

### Admin panel (`/admin`)

Administrators build and manage codes in the app: pick rewards (coins, any registered cosmetic including hidden ones, achievements), set the rules, review the exact effects and publish. Drafts hold only the configuration (never a code); published codes can't be edited, only disabled or cloned. A new code is shown once on the publish screen; only its hashes are stored. The panel lists every code with status, usage, redemption history and an audit trail of who published or disabled it (from the panel or the CLI).

Admins are listed in `public.app_admins`, which only the service role can change. Every admin page, API route and database function checks that list on the server; the nav entry is only a convenience. Nobody becomes admin automatically. To designate the initial owner:

1. Sign in to the app once with the owner's account (so its profile exists).
2. On a trusted machine with the service-role key in `.env.local`:

```bash
npm run codes -- admin-grant you@example.com --owner   # or without --owner for a regular admin
npm run codes -- admins                                # who has access
npm run codes -- admin-revoke someone@example.com
```

Alternatively, in the Supabase SQL editor: `insert into public.app_admins (user_id, role) select id, 'owner' from auth.users where email = 'you@example.com';`

Rules the panel adds (also visible in `npm run codes -- list`):

- **Start and expiry**: a code may open later (`starts_at`); before that, players are told it's dormant.
- **Per-account limit** (default 1, up to 100) on top of the optional total limit. Repeated redemptions grant coins again; cosmetics and achievements are only granted once. Publishing a repeatable coin code requires an explicit confirmation of its maximum payout.
- **Allowlist**: restrict a code to specific accounts (stored by account id). Anyone else is told the code doesn't exist.
- **Achievements**: a code can unlock achievements through the achievement system, including their own once-per-account rewards. Already-unlocked achievements keep their original date; code unlocks are recorded with source `code`.
- Code coins are a separate transaction kind (`code`) and don't count toward the 600-coin daily earning limit.
- Redemption is a single database transaction with row locks, so limits hold under concurrent requests. Each attempt carries a request id: a retried request never grants twice.

## Version history and interactive milestone demos

`/version-history` catalogs all retained commits reachable from the repository's branches and tags (`main` and `backup/pre-squash`), deduplicated by full 40-character SHA, and lets visitors explore enabled historical milestones as isolated, fresh-account demos.

### Refreshing the commit catalog

```bash
npm run versions:catalog
```

`scripts/version-history-catalog.ts` is operator-controlled and reads only from the local Git repository:

- Walks all commits reachable from `refs/heads/*` and `refs/tags/*`, deduplicating by full 40-character SHA.
- Distinguishes the Git commit date (`commitDate`) from the verified production deployment date (`releaseDate`) and release description in `src/lib/changelog.ts`.
- Excludes author emails and applies `redactSensitiveText` so tokens, JWTs, credential URLs, emails or secret codes never enter `src/lib/version-history-catalog.json`.
- Marks every commit with an explicit state: `Available Demo`, `Not Prepared`, or `Unavailable` with a concise technical reason. Listing a commit never implies it has a working demo.

### Enabled milestone demos and why schemas are isolated per commit

Historical commits cannot share a single database schema because Amethyst's schema and RPC contracts changed incompatibly across eras:

| Milestone commit | Demo port | Isolated DB | Migrations | Historical architecture |
| --- | --- | --- | --- | --- |
| `3c27ef5` (`3c27ef532b3fa8bd60968b0f9841348fde95ca8b`) | `:4101` | `demo_3c27ef5` | 10 (`..001000_amethyst`) | Fixed `/anime`, `/games`, `/other` libraries (`entries` has no `collection_id`); `create_entry` seeds starter `Overview.md` and `Progress` files |
| `7ec9aa4` (`7ec9aa4310412268843a6bd5db9da4f277405dd3`) | `:4102` | `demo_7ec9aa4` | 16 (`..1019000100_user_collections`) | User-created `collections` (`/[collection]` UUID routes), collection-scoped labels, per-file cover progress and empty starter workspaces |
| `03070fc` (`03070fca5ce3cf9635a182d93932f81623db2176`) | `:4103` | `demo_03070fc` | 22 (`..1025000100_settings_capacity`) | First Home dashboard, Settings sidebar, workspace templates, collection identities and 5 themes |
| `3882439` (`38824391ee82b53f9016a38ad5ad3385f44e094c`) | `:4104` | `demo_3882439` | 29 (`..1030000100_arcade_economy`) | Readable slug URLs (`/collections/[slug]`, `/entries/[slug]`), collection layouts, 3D Showcase, Achievements cabinet and Arcade hall + demo shop |
| `688565d` (`688565d1429381610f4ec0810348d66850031a3a`) | `:4105` | `demo_688565d` | 32 (`..1102000100_tasks`) | Top-bar `Archive \| Tasks` workspace switcher and Tasks with permanent `Inbox` (`ensure_task_inbox()` RPC, which was dropped in migration 33) |

### Unavailable commits

Commits marked `Unavailable` are kept visible in the catalog with their exact reason:

- `40299ce`, `bd01e88`, `34dd75c`, `4baae8e`, `38b204a` (2026-09-30 pre-workspace prototypes/betas): depended on retired MyAnimeList OAuth credentials, live Jikan API catalog imports and `pg_cron`/`pg_net` Edge Function sync workers.
- `247e4f1`, `d295b55` (2026-10-19): production `next build` failed TypeScript checks on legacy `/tests` fixtures before `7ec9aa4` scoped build typechecking via `tsconfig.build.json` later the same day.
- `d8b23c2`, `851d01f` (2026-10-29): `serverEnv()` unconditionally required live Cloudflare R2 credentials on every write route until `2c844bb` made R2 configuration optional when unconfigured.
- `743b007` (2026-10-30): `/vault` and its 3D chamber components were committed out of sync and failed compilation until `c5de608`.

### Preparing, starting and stopping demos locally

Requires local Supabase running (`npx supabase start`, providing local Postgres on `127.0.0.1:54322`):

```bash
npm run demos -- prepare all        # create demo_<shortSha> DBs, apply commit migrations, extract & build in /tmp/amethyst-version-demos
npm run demos -- start all          # launch PostgREST + Next.js + Demo Isolation Gateway on ports 4101–4105
npm run demos -- status             # check DB, build and HTTP status for all enabled milestones
npm run demos -- reset-db 3c27ef5   # wipe and rebuild a single commit's demo database and visitor storage
npm run demos -- stop all           # stop all running demo processes
```

All extracted historical source trees, `.next-demo` build outputs, ephemeral demo keys and visitor uploads live under `/tmp/amethyst-version-demos` (override with `AMETHYST_DEMO_ROOT`), completely separate from the repository working tree.

### Enabling an additional commit

1. Add an entry to `ENABLED_DEMO_SPECS` in `src/lib/version-history.ts` with the commit's full 40-character SHA, port (`410x`), internal Next port (`420x`), PostgREST port (`430x`), database name (`demo_<shortSha>`) and milestone metadata (or test ad-hoc with `npm run demos -- prepare --sha <full-40-char-sha> --port 4109`).
2. Run `npm run versions:catalog` to update `src/lib/version-history-catalog.json`.
3. Run `npm run demos -- prepare <shortSha> && npm run demos -- start <shortSha>`.

### Security, visitor isolation, retention and Reset Demo

- **Zero production access:** Demo builds and gateways never load `.env.local`, hosted Supabase URLs/keys or Cloudflare R2 credentials. Demo JWTs are signed with an ephemeral local ES256 keypair generated in `/tmp/amethyst-version-demos/keys/demo-jwt.json`.
- **Origin & cookie isolation:** Each demo runs on its own origin (`http://localhost:4101`..`4105`), isolating `localStorage` and `sessionStorage`. Cookies are scoped per commit (`amethyst_demo_vid_<shortSha>`, `sb-demo-<shortSha>-auth-token`, `archive-started-demo-<shortSha>`), and the Demo Isolation Gateway strips all other cookies before forwarding requests to the historical Next.js server.
- **Fresh-account provisioning & 24-hour retention:** Each visitor is provisioned a dedicated `auth.users` + `public.users` identity per commit using that commit's own `ensure_profile()` and triggers. Workspaces persist across navigation and refresh for 24 hours (`DEMO_RETENTION_HOURS`) and are automatically pruned when expired.
- **Quotas & contained integrations:** Each visitor workspace is capped at 50 entries, 250 workspace nodes, 500 tasks, 256 KB per write request, and 5 uploaded raster images (≤ 2 MB each, ≤ 5 MB total). Outbound requests from `/api/image` are intercepted locally and served deterministic safe SVG artwork; all account email endpoints (`/recover`, `/otp`, `/resend`, `/verify`) are simulated locally without sending email.
- **Reset Demo:** Available both inside every running demo (via the corner Shadow DOM demo bar) and on `/version-history`, with confirmation. Resetting deletes only that visitor's `auth.users` row (cascading all rows in `demo_<shortSha>`) and uploaded files, provisions a fresh account and clears demo `localStorage`/`sessionStorage`.

### Hosted deployment steps for live demos

To expose historical milestone demos on a hosted environment alongside production:

1. Provision an isolated multi-database Postgres instance (never the production Supabase project) and run `scripts/version-demos.ts` on an isolated container/VM host.
2. Route distinct demo subdomains (e.g. `demo-3c27ef5.<domain>`) to each Demo Isolation Gateway port (`4101`–`4105`) with `MAIN_APP_ORIGIN` set to the main app origin, and keep all demo processes without production Supabase or R2 credentials.

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
