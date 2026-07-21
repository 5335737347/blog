# Blog project memory

Last updated: 2026-07-21 (Asia/Shanghai)

## Product direction

- This is a personal full-stack blog built for long-term solo maintenance.
- Preserve one Git repository for atomic changes, while keeping Web and API as
  physically separate applications connected only through HTTP and contracts.
  Preserve server-side security, SEO, tests, and a simple single-machine deploy.
- Borrow visual storytelling and lifestyle content ideas from
  `RRTiamo/spring_blogs`, without copying its client-only private-content gate,
  three-repository complexity, heavy global animation stack, duplicated media,
  or custom Markdown parser.
- Never invent personal information. Unknown profile, social, gallery, and
  similar values must remain `""` or `[]` until the owner supplies them.
- Use `RRTiamo/spring_blogs` as a layout and visual-storytelling reference, but
  the owner's preferred palette is crisp white with clear sky blue and peach
  blossom red accents. Keep the surfaces bright and clean, with stronger color
  contrast than a muted or misty palette; avoid cream-green and gray-purple
  palettes as well as candy gradients across large surfaces.

## Completed 2026-07-21 palette refinement

- Replaced the saturated anime-style palette with the owner's brighter
  white-led, sky-blue, and peach-blossom-red color direction.
- Rebalanced light and dark theme surfaces, borders, shadows, hero decoration,
  code blocks, and syntax colors while preserving the existing layout.
- Kept existing Tailwind utility usage compatible by centrally remapping the
  project color ramps in `globals.css`.
- Redesigned the public registration page as a responsive two-column account
  introduction and form on desktop, collapsing to a focused single-column form
  on mobile. The email-code and registration API behavior remains unchanged.
- Added an optional unique phone number to user registration and authentication.
  Email verification remains required because no SMS provider is configured;
  registered phone numbers can be used as login identifiers.
- Registration uses a user-editable country calling-code selector. It defaults
  from trusted CDN/platform GeoIP country headers, falls back to the request
  language, and never sends the visitor IP to a third-party geolocation API.
- Registration begins with an explicit email-or-phone method choice and only
  shows the contact field and verification code for that method. SMS delivery
  uses a configurable HTTPS JSON gateway with per-IP and per-target rate limits;
  production refuses SMS sends when the gateway is not configured.

## Completed 2026-07-21 registration and proxy hardening

- Removed the obsolete `/api/auth/email-code` route instead of retaining an
  endpoint that could bypass the unified per-IP and per-target rate limits.
- Verification-code target rate-limit keys now use normalized email addresses
  or phone numbers, preventing case and formatting variations from creating new
  target buckets.
- Added `/api/auth/registration-options`; production registration UI only shows
  email or phone methods whose SMTP or SMS delivery is actually configured.
- The `/register` page now reads registration capabilities during dynamic server
  rendering and passes them as stable initial props to the client form. Do not
  reintroduce a mount-time capability fetch: it caused server/client `disabled`
  attribute hydration mismatches during development refreshes.
- Registration rejects username/email/phone cross-field identifier collisions.
  Login rejects ambiguous legacy collisions instead of selecting an arbitrary
  account.
- Proxy headers are untrusted by default. Production behind a correctly
  configured reverse proxy must explicitly set `TRUST_PROXY="true"` and choose
  one supported header.
- Phone input now uses `libphonenumber-js` to parse national input with the
  selected country, validate it, and store/send canonical E.164 numbers.
- Removed obsolete email-code service aliases and renamed the implementation to
  `verification-code-service.ts`; the OpenAPI contract now documents only the
  current endpoints and request shapes.
- The project declares standard ESM module mode in `package.json`, required for
  consistent `libphonenumber-js` ESM metadata loading under Node 26 and `tsx`.
- Updated vulnerable transitive development dependencies (`brace-expansion` and
  `js-yaml`) with a non-breaking audit fix; the full dependency tree reports no
  known vulnerabilities as of this update.

## Completed 2026-07-21 Cookie notice

- Added a public-site Cookie notice matching the white, sky-blue, and
  peach-blossom-red visual direction.
- The notice accurately states that the site only uses necessary cookies for
  authentication and remembering the notice; theme, music-volume, and effects
  preferences remain in browser local storage. No advertising or analytics
  tracking was introduced.
- Acknowledgement is stored for one year in `kp_cookie_notice` with `Path=/`,
  `SameSite=Lax`, and `Secure` on HTTPS. The component uses
  `useSyncExternalStore` with a stable server snapshot to avoid hydration
  mismatches.

## Completed 2026-07-21 immersive homepage and navigation

- The public homepage is now an immersive cover rather than an article index:
  it contains a full anime wallpaper, the blog title and description, and a
  large live article-search field whose hint icon and copy rotate automatically.
- Eight owner-supplied wallpapers from the local wallpaper library were
  optimized into `public/images/home/`. The clear foreground always uses
  `object-contain` so the complete artwork remains visible; a blurred copy of
  the same image fills any remaining viewport space. The selected wallpaper
  advances on shared five-minute time boundaries without using unstable values
  during hydration.
- `public/images/home/*.webp` is intentionally exempted from the uploaded-media
  ignore rule because these files are required theme assets and must ship with
  deployments. Other uploaded images and music remain ignored.
- The article index moved from `/` to `/articles`. The main navigation order is
  Article, Profile, Guestbook, then icon-only Gallery, Music, and Theme controls,
  followed by Register and Login. The text brand remains the homepage link and
  its former K tile was replaced with a custom large-fish SVG mark.
- `/messages` is an honest standalone Guestbook destination with a preparation
  state. It does not invent a second comment data model; article comments remain
  the current working conversation channel until a guestbook backend is chosen.
- Falling sakura/star/snow effects and their header toggle are temporarily
  removed from the rendered public shell. The implementation remains available
  for a future explicit re-enable.
- The compact music popover was redesigned as a complete player card with track
  metadata, play/pause and previous/next controls, seek progress, elapsed and
  total time, persistent volume, and a clear close action.

## Technical baseline

- Next.js 16.2.10, React 19, TypeScript, Tailwind CSS 4.
- npm-workspaces Monorepo: `apps/web` (Next.js on 3001), `apps/api` (Fastify on
  3002), and `packages/contracts` (shared serializable TypeScript contracts).
- Prisma 7.8 with the official better-sqlite3 adapter and SQLite.
- JWT cookie authentication, bcrypt passwords, persisted email codes, persisted
  rate-limit buckets, hashed publishing API keys, article/comment/media/admin APIs.
- Server-rendered Markdown via react-markdown, RSS, dynamic sitemap, robots,
  dynamic metadata, Open Graph, and BlogPosting JSON-LD.
- Next.js APIs in this version may differ from prior releases. Always read the
  relevant files under `node_modules/next/dist/docs/` before changing Next.js code.

## Completed 2026-07-21 Web/API separation

- The former Next.js monolith was replaced by a single-repository Monorepo.
  This supersedes the earlier decision to retain a monolithic runtime; it does
  not authorize splitting the project into multiple Git repositories.
- `apps/web` contains the Next.js UI and no Route Handlers, Prisma access,
  backend services, JWT verification, or `JWT_SECRET` usage.
- `apps/api` is an independently built and started Fastify service containing
  authentication, authorization, rate limits, database access, media handling,
  publishing, public SSR data, RSS data, and sitemap data.
- Browser calls remain same-origin `/api/*` and are rewritten by Next.js to the
  private API. Web SSR and admin route prechecks use `API_INTERNAL_URL`.
- Shared API envelope and core DTOs live in `packages/contracts`; applications
  may not import one another's implementation files.
- Prisma schema, migrations, and seed remain at repository root and belong to
  the API boundary. Relative SQLite URLs resolve from repository root.
- Uploads temporarily use the shared `apps/web/public` directory for URL
  compatibility. This is intentionally a single-host constraint; use object
  storage before deploying Web and API to separate hosts.
- PM2 uses `ecosystem.config.cjs` to run `blog-api` and `blog-web` separately.
  Nginx proxies public traffic only to Web on port 3001.
- Production Web startup explicitly binds Next.js to `127.0.0.1`; Next.js 16
  otherwise defaults `next start` to `0.0.0.0`. Keep both the Web workspace
  start script and PM2 configuration loopback-only behind Nginx.
- Formal documentation now uses a layered structure: root README as the entry,
  `docs/` for architecture/environment/deployment/workflows, and app-level
  READMEs for the Next.js, Fastify, and Contracts framework boundaries.

## Completed 2026-07-21 documentation standardization

- `README.md` is the concise repository entry point and must link to detailed
  documents instead of duplicating architecture or deployment procedures.
- `docs/README.md` is the canonical documentation index. Long-lived formal
  documentation is split into `architecture.md`, `development.md`,
  `environment.md`, `deployment.md`, `content-workflow.md`, and `openapi.yaml`.
- `apps/web/README.md`, `apps/api/README.md`, and
  `packages/contracts/README.md` define framework files, ownership, prohibited
  dependencies, change order, and module-specific verification commands.
- Environment changes must update both `.env.example` and
  `docs/environment.md`; API changes must update Contracts where applicable,
  tests, and OpenAPI; deployment changes must update the ecosystem config,
  deployment guide, and root entry point.
- Formal documentation must not contain secrets, tokens, verification codes,
  private IP addresses, or developer-specific absolute paths.
- The documentation pass validated all local Markdown links across 11 files,
  parsed the OpenAPI YAML successfully, and passed `git diff --check`.

## Source organization

- Public components are organized by domain under `apps/web/src/components/public/`:
  `articles`, `auth`, `comments`, `home`, `layout`, `music`, and `preferences`.
  Admin components use `admin/articles` and `admin/layout`; generic primitives
  remain in `components/ui`.
- `apps/web/src/app` remains the routing/composition layer;
  `apps/api/src/server` is the backend domain/service layer. Do not move
  database or authorization logic into Web page components.
- The former sidebar-bearing `PublicLayout` component is named `ContentLayout`
  to distinguish it from the actual `(public)/layout.tsx` route layout.
- Same-domain components use relative imports; cross-domain imports use the
  `@/` alias. Avoid broad barrel exports across Client/Server boundaries because
  they can accidentally expand client bundles.
- Formal development conventions are documented in `docs/development.md`.
  `npm run typecheck` performs strict TypeScript validation and `npm run check`
  runs lint, typecheck, and all service tests in sequence.

## Completed 2026-07-20 upgrade

- Reworked the homepage hero, latest-writing section, article cards, responsive
  spacing, surfaces, and visual tokens.
- Added responsive desktop/mobile navigation.
- Added `/about`, `/now`, and `/gallery` with honest empty states.
- Added empty owner-managed profile data at `src/config/profile.ts`.
- Improved article detail presentation and breadcrumbs.
- Changed pagination controls to crawlable links.
- Reworked the music player to load on demand and provide play/pause, track
  information, volume, and next-track behavior.
- Added pre-hydration theme initialization to prevent a dark-theme flash.
- Added skip navigation, focus-visible styling, responsive behavior, and retained
  `prefers-reduced-motion` support.
- Fixed `/admin/login` inheriting the visible admin sidebar via `AdminShell`.
- Restricted public settings reads to an explicit whitelist.
- Added a 72 UTF-8 byte limit for bcrypt passwords.
- Improved missing comment/image error semantics.
- Prevented sitemap output from advertising localhost when `SITE_URL` is empty.
- Added trusted-proxy configuration for rate-limit client IP extraction.
- Removed unprovided personal-interest labels from the sidebar.

## Validation baseline

- Service tests: 13/13 passing.
- Fastify injection tests: 3/3 passing.
- ESLint: passing.
- Root, API, Web, and Contracts TypeScript checks: passing.
- API and Next.js production builds: passing.
- Chromium checks completed for desktop homepage and registration. No hydration
  or console errors were observed. A dark-theme registration-card contrast bug
  found during the check was fixed with an explicit dark panel surface.

Run after material changes:

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

## Environment and secret rules

- `.env.example` is the committed template; real values belong in `.env`,
  `.env.local`, or the deployment platform.
- Required for production: `JWT_SECRET`, `SITE_URL`,
  `NEXT_PUBLIC_SITE_URL`, and an explicit initial `ADMIN_PASSWORD`.
- SMTP values are required only when production registration is enabled.
- Proxy trust is disabled by default. Enable it only after confirming the API
  receives requests through infrastructure that overwrites the selected header:
  `TRUST_PROXY="true"`, `TRUST_PROXY_HEADER="x-real-ip"`.
- Keep `ALLOW_PRODUCTION_SEED` empty unless deliberately performing a destructive
  production seed, then remove it immediately.
- Never commit real JWT secrets, SMTP credentials, publishing API keys, databases,
  backups, generated build output, or uploaded media.

## JWT key decision

- A strong random `JWT_SECRET` remains sufficient because only the API signs and
  verifies sessions. Web asks `/api/auth/me` and must never receive the secret.
- If another independent service later needs offline token verification, prefer
  Ed25519 keys with `kid` and current-plus-previous public-key verification.
- Generate asymmetric keys during deployment/rotation and persist them. Never
  generate a new signing key on every application start or per PM2 process.

## Repository state warning

- At the time of this memory update, the working tree contained many staged,
  unstaged, and untracked changes that predated or overlapped the upgrade.
- No final Git commit was created during the conversation.
- Review `git status`, `git diff --cached`, and `git diff` before committing.
- `docs/niri-nvidia-issues.md` is unrelated to the blog upgrade and should not be
  included accidentally.

## Recommended next work

1. Review and create a clean commit for the completed upgrade.
2. Supply real owner profile content later through
   `apps/web/src/config/profile.ts` or a future admin-managed profile model.
3. Add broader Fastify authorization tests and browser-level interaction tests.
4. Consider object storage/CDN before moving beyond single-machine deployment.
5. Consider Ed25519 JWT rotation only when independent services need verification.
