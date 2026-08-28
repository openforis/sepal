# CLAUDE.md - modules/message

SEPAL message service (Node.js; formerly `notification`). Replaces the Java `sepal-server`
`notification` component. System messages (admin) + per-user read/unread state ("notifications").
Owns the `message` MySQL schema (`message.message`, `message.notification`).

## Commands
- `npm test` — Jest (ESM)
- `sepal build message` / `sepal start message` / `sepal logs message -r`

## Routes (served without the `/api/message` gateway prefix)
- `GET /healthcheck`
- `POST /messages/:id` (admin) / `DELETE /messages/:id` (admin) — body may carry `priority`
  (int: -1 = unpublished, 0 = normal, 1 = urgent; default 0; urgent drives
  the GUI's pulsing-bell + delayed auto-open). Saving RE-NOTIFIES everyone (all notification rows
  for the message are deleted, so it is UNREAD again for every user) and then marks it READ for
  its author, before the change is pushed. Unpublished messages are admin-only drafts: excluded
  from non-admin notification lists (REST and ws) and forced READ for admins, so they never
  notify anyone; publishing = saving with priority >= 0, which re-notifies like a new message.
  The GUI's editor defaults new messages to unpublished.
- `GET /notifications` (auth) / `POST /notifications/:id` (auth)
- `GET /ws` — gateway virtual-websocket endpoint (module `message`): pushes the current
  user's full `{notifications}` list to GUI subscribers on subscribe, on `{refresh: true}`, and on
  every change (`changed.js` feed: admin message save/remove → all subscribed users; own
  read-state change → that user's tabs). Replaced the GUI's 60s polling loop.
