# 5S.MOTION Portfolio and CMS

The site is served by Node.js 24 or newer. The CMS stores content and admin
sessions in SQLite, and uploaded media in `storage/media/`. Both locations must
be on persistent storage and included in server backups.

## Run locally

1. Copy `.env.example` to `.env`.
2. Set `ADMIN_USERNAME` and a unique `ADMIN_PASSWORD` of at least 12 characters.
3. Run `npm start`.
4. Open `http://127.0.0.1:3000/admin`.

The first server start creates the database and seeds it with the existing site
content. Subsequent restarts retain edits, uploads, and sessions in the SQLite
database. Do not expose the server publicly over plain HTTP. For production,
put it behind HTTPS, set `NODE_ENV=production`, set `APP_ORIGIN` to the exact
HTTPS site origin, and use a private persistent disk for `data/` and
`storage/media/`. Back up both paths together.

The server has no default admin password. The credentials are supplied through
environment variables and never stored in source code. Changing the configured
credentials and restarting the server updates the admin account and invalidates
existing sessions.

## Content management

Sign in at `/admin` to manage homepage copy and featured work, About content and
skills, project records and publication status, services, team profiles, and
site contact/social links. Media uploads accept JPEG, PNG, WebP, MP4, and WebM.
Public pages only expose published projects. Content edits are persisted in
SQLite and the public site reads the saved content from the server.
