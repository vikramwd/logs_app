# WDTS Logging Solution - Feature Overview

WDTS Logging Solution is a lightweight log search and administration UI built for OpenSearch-backed log stores.

## Stack Overview

- Frontend: React + Vite (single-page app).
- Backend: Node.js + Express proxy/API.
- Data: OpenSearch for logs, local JSON for app state.

## Core Features

- Fast log search with time range presets and custom windows.
- Index pattern selection with per-pattern search settings.
- Query Builder for structured filters (AND/OR + operators).
- Field Explorer with quick filters and pinned values.
- Highlight Rules to visually flag important log patterns.
- Export logs to JSON or CSV with size checks.

## Access & Permissions

- Optional user login with roles (viewer/editor/admin).
- Team feature toggles (exports, bookmarks, alert rules, query builder, PII access, and more).
- Team and user index access controls.

## Admin Console

- OpenSearch connection management with saved connections.
- App configuration (index patterns, field explorer, time zone, export limits).
- User and team management.
- Alert Rules management.
- Email alert configuration and test email.
- Activity Feed with usage tracking.
- Health and diagnostics panel.
- Backup and restore of admin data.
- Index discovery with cached stats and per-index overrides.
- Feature toggles per team (enable/disable capabilities).
- Team bookmarks management for shared queries.
- Branding controls (logo and sizing).
- Message of the Day (MOTD) management with optional templates.
- Admin FAQs page (read-only) for operator guidance.
- Admin error log viewer (admin-only, redacted output).
- Maintenance tools (log rotation/pruning and service restarts).

## User Experience

- Dark mode default + user toggle.
- Server-synced clock.
- Message of the Day banner on login and user UI.
- Client IP indicator in the header.
- Recent searches and bookmarks.
- Status indicators for OpenSearch and user sessions.

## Monitoring & Insights

- Usage metrics (daily, weekly, hourly).
- Top queries and active user summaries.
- Activity Feed history.

## FAQs

**Q: Where are users and settings stored?**  
A: Admin data is stored as JSON under the proxy data directory. In Kubernetes, mount that directory to a PVC so users, rules, and config persist across pod restarts.

**Q: Does the app support multiple OpenSearch connections?**  
A: Yes. After a successful test, the connection is saved and available in the Saved Connections dropdown for quick reuse.

**Q: Is authentication required?**  
A: User login is optional. If no users exist, the app is open; once users are created, login is required. The Admin Console always uses separate admin credentials.

**Q: Can I export logs?**  
A: Yes. Exports support JSON and CSV with a size estimate step and a configurable max limit in Admin. Exports can be gated by team feature toggles.

**Q: How do alerts work?**  
A: Alert Rules run on a schedule and evaluate queries over a rolling window. When the threshold is met, an email is sent via the configured SMTP settings.

**Q: Can I restrict which indices a user can search?**  
A: Yes. Admins can define team and user index access patterns; non-admin users are restricted to those patterns.

**Q: Does the UI support dark mode?**  
A: Yes. Admins can set the default, and users can toggle it per browser session.

**Q: How is PII handled?**  
A: Admins define field-based masking rules (hide/mask/partial). Teams can optionally be allowed to view unmasked values.

**Q: Can I back up and restore settings?**  
A: Yes. Admins can download a JSON backup and restore it later. It includes config, users, teams, feature toggles, rules, and team bookmarks.

**Q: Can I see system indices?**  
A: System indices are listed for visibility, but they are disabled for selection to prevent accidental searches.

**Q: How long is admin activity retained?**  
A: The backend stores a capped list (currently 500 entries). The UI shows the most recent items.

**Q: How do I verify the OpenSearch connection?**  
A: Use the Test OpenSearch Connection button. A successful test saves the connection and updates the status indicator.

**Q: How are users managed?**  
A: Admins create users, set roles, and manage team membership from the Admin Console. User data is stored locally in the proxy data directory.

**Q: What’s included in backups?**  
A: Backups include app config, users, teams, feature toggles, rules, and team bookmarks. Log data in OpenSearch is not part of the backup.

**Q: Can I connect over SSL or without SSL?**  
A: Yes. Select `https` for SSL or `http` for non-SSL, and optionally allow self-signed certificates.

**Q: How do bookmarks work?**  
A: Users can save personal bookmarks, and teams can share bookmarks for shared investigations.

**Q: What download options are available?**  
A: Exports are available in JSON and CSV, with configurable limits and size estimates before download.

## Manual Build

### All (manual)
```
cd frontend
npm install
npm run build

cd ../proxy
npm install
```

### Frontend
```
cd frontend
npm install
npm run build
```

### Proxy
```
cd proxy
npm install
```

### Run (local)
```
cd proxy
node server.js
```

### Docker (full stack)
```
docker-compose up --build
```

## Helm (.env ConfigMap)

The Helm chart reads `deploy/helm/logsearch/files/app.env` and loads it via a ConfigMap (non-secrets) plus a Secret (sensitive keys).
Update `files/app.env` when `.env` changes, then redeploy:

```
./scripts/sync-helm-env.sh
```

```
helm upgrade --install logsearch deploy/helm/logsearch -n opensearch
```
