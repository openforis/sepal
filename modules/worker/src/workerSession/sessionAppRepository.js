// SessionApp repository — persists app ↔ session associations to worker.session_app.
// One row per (username, app_path): the app is pinned to session_id until that session
// closes (WorkerSessionRepository.update cascades a delete on the CLOSED transition)
// or the user closes the app tab (explicit dissociate).

import {storedUsername} from '#sepal/username'

import {placeholders} from '../sql.js'

export class SessionAppRepository {
    #db
    #clock

    constructor(db, clock) {
        this.#db = db
        this.#clock = clock
    }

    // Replaces a STALE row, one whose session has closed. Permanence is enforced one level up:
    // sessionManager.associateApp returns the existing association rather than calling this when a
    // live one exists. client_id is the gateway ws client — the browser window owning the app's tab.
    associate({username, appPath, sessionId, label, clientId}) {
        return this.#db.withConnection(async connection => {
            await connection.query(
                `INSERT INTO session_app(username, app_path, session_id, label, client_id, creation_time)
                    VALUES(?, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE
                        session_id = VALUES(session_id),
                        label = VALUES(label),
                        client_id = VALUES(client_id),
                        creation_time = VALUES(creation_time)`,
                [storedUsername(username), appPath, sessionId, label ?? null, clientId ?? null, this.#clock()]
            )
        })
    }

    // The association-wins path: the session must not move, but the requester owns the visible tab
    // now, so only the owner is refreshed.
    setClient({username, appPath, clientId}) {
        return this.#db.withConnection(async connection => {
            await connection.query(
                'UPDATE session_app SET client_id = ? WHERE username = ? AND app_path = ?',
                [clientId ?? null, username, appPath]
            )
        })
    }

    // `status` is the raw worker_session.state, 'PENDING' or 'ACTIVE'.
    userAppSessions(username) {
        return this.#db.withConnection(async connection => {
            const [rows] = await connection.query(
                `SELECT sa.app_path, sa.label, sa.session_id, ws.host, ws.state, ws.instance_type
                    FROM session_app sa
                    JOIN worker_session ws ON ws.id = sa.session_id
                    WHERE sa.username = ? AND ws.state IN (?, ?)`,
                [username, 'PENDING', 'ACTIVE']
            )
            return rows.map(row => ({
                path: row.app_path,
                label: row.label,
                sessionId: row.session_id,
                host: row.host,
                status: row.state,
                instanceType: row.instance_type,
            }))
        })
    }

    appsForSessions(sessionIds) {
        if (!sessionIds || sessionIds.length === 0) {
            return Promise.resolve(new Map())
        }
        return this.#db.withConnection(async connection => {
            const map = new Map()
            const [rows] = await connection.query(
                `SELECT session_id, app_path, label
                    FROM session_app
                    WHERE session_id IN (${placeholders(sessionIds.length)})
                    ORDER BY creation_time`,
                sessionIds
            )
            for (const row of rows) {
                const apps = map.get(row.session_id) ?? []
                apps.push({path: row.app_path, label: row.label})
                map.set(row.session_id, apps)
            }
            return map
        })
    }

    deleteForSession(sessionId) {
        return this.#db.withConnection(async connection => {
            await connection.query(
                'DELETE FROM session_app WHERE session_id = ?',
                [sessionId]
            )
        })
    }

    // Removes the association whatever session it points to. The clientId it reports is the OWNER,
    // which the dissociation event needs; nothing to remove is an idempotent no-op, not an error.
    dissociate({username, appPath}) {
        return this.#db.withConnection(async connection => {
            const [rows] = await connection.query(
                'SELECT session_id, client_id FROM session_app WHERE username = ? AND app_path = ?',
                [username, appPath]
            )
            if (rows.length === 0) {
                return null
            }
            await connection.query(
                'DELETE FROM session_app WHERE username = ? AND app_path = ?',
                [username, appPath]
            )
            return {sessionId: rows[0].session_id, clientId: rows[0].client_id}
        })
    }

    // clientDown: the client's tabs died with it. The removed rows become per-app dissociation
    // events.
    dissociateForClient({username, clientId}) {
        return this.#db.withConnection(async connection => {
            const [rows] = await connection.query(
                'SELECT app_path, session_id FROM session_app WHERE username = ? AND client_id = ?',
                [username, clientId]
            )
            if (rows.length === 0) {
                return []
            }
            await connection.query(
                'DELETE FROM session_app WHERE username = ? AND client_id = ?',
                [username, clientId]
            )
            return rows.map(row => ({appPath: row.app_path, sessionId: row.session_id}))
        })
    }
}
