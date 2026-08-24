// SessionApp repository — persists app ↔ session associations to worker.session_app.
// One row per (username, app_path): the app is pinned to session_id until that session
// closes (workerSessionRepository.update cascades a delete on the CLOSED transition)
// or the user closes the app tab (explicit dissociate).
//
// createSessionAppRepository(pool?, clock?) — injectable factory (mirrors
// workerSessionRepository.js: pool defaults to the module-level getPool()).

import {getPool} from '../db.js'

const placeholders = count => Array(count).fill('?').join(', ')

const createSessionAppRepository = (pool = null, clock = () => new Date()) => {
    const resolvePool = () => pool ?? getPool()

    // associate — upsert: replaces a STALE row (one whose session has closed).
    // Permanence is enforced one level up: sessionManager.associateApp returns the
    // EXISTING association instead of calling this when a live one exists.
    // client_id — the gateway ws client (browser window) owning the app's tab.
    const associate = async ({username, appPath, sessionId, label, clientId}) => {
        await resolvePool().query(
            `INSERT INTO session_app(username, app_path, session_id, label, client_id, creation_time)
                VALUES(?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    session_id = VALUES(session_id),
                    label = VALUES(label),
                    client_id = VALUES(client_id),
                    creation_time = VALUES(creation_time)`,
            [username, appPath, sessionId, label ?? null, clientId ?? null, clock()]
        )
    }

    // setClient — refresh ONLY the owner of an existing association (association-wins
    // path: the session must not move, but the requester owns the visible tab now).
    const setClient = async ({username, appPath, clientId}) => {
        await resolvePool().query(
            'UPDATE session_app SET client_id = ? WHERE username = ? AND app_path = ?',
            [clientId ?? null, username, appPath]
        )
    }

    // userAppSessions — the user's associations joined with their OPEN sessions.
    // status is the raw worker_session.state ('PENDING' | 'ACTIVE').
    const userAppSessions = async username => {
        const [rows] = await resolvePool().query(
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
    }

    // appsForSessions — Map<sessionId, [{path, label}]> for the given session ids.
    const appsForSessions = async sessionIds => {
        const map = new Map()
        if (!sessionIds || sessionIds.length === 0) {
            return map
        }
        const [rows] = await resolvePool().query(
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
    }

    const deleteForSession = async sessionId => {
        await resolvePool().query(
            'DELETE FROM session_app WHERE session_id = ?',
            [sessionId]
        )
    }

    // dissociate — remove the (username, app_path) association, whatever session it points
    // to. Returns the deleted row's {sessionId, clientId} (clientId = the OWNER, for the
    // dissociation event), or null when none existed (idempotent no-op).
    const dissociate = async ({username, appPath}) => {
        const [rows] = await resolvePool().query(
            'SELECT session_id, client_id FROM session_app WHERE username = ? AND app_path = ?',
            [username, appPath]
        )
        if (rows.length === 0) {
            return null
        }
        await resolvePool().query(
            'DELETE FROM session_app WHERE username = ? AND app_path = ?',
            [username, appPath]
        )
        return {sessionId: rows[0].session_id, clientId: rows[0].client_id}
    }

    // dissociateForClient — remove every association owned by the client (clientDown: its
    // tabs died with it). Returns the deleted rows for per-app dissociation events.
    const dissociateForClient = async ({username, clientId}) => {
        const [rows] = await resolvePool().query(
            'SELECT app_path, session_id FROM session_app WHERE username = ? AND client_id = ?',
            [username, clientId]
        )
        if (rows.length === 0) {
            return []
        }
        await resolvePool().query(
            'DELETE FROM session_app WHERE username = ? AND client_id = ?',
            [username, clientId]
        )
        return rows.map(row => ({appPath: row.app_path, sessionId: row.session_id}))
    }

    return {associate, setClient, userAppSessions, appsForSessions, deleteForSession, dissociate, dissociateForClient}
}

export {createSessionAppRepository}
