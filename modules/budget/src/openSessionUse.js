import {storedUsername} from '#sepal/username'

// Event-sourced instance-use rows. Upserts are keyed by session_id, so at-least-once delivery
// and out-of-order events converge.
export class OpenSessionUseRepository {
    #db

    constructor(db) {
        this.#db = db
    }

    openSession({sessionId, username, instanceType, from}) {
        return this.#db.withConnection(connection => connection.query(
            `INSERT INTO open_session_use (session_id, username, instance_type, from_time)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE username=VALUES(username), instance_type=VALUES(instance_type),
                                     from_time=VALUES(from_time)`,
            [sessionId, storedUsername(username), instanceType, from]
        ))
    }

    // Closed can arrive before Activated, so a close with no row yet inserts a placeholder
    // (from_time = to) that a later open corrects through its own ON DUPLICATE KEY UPDATE. Both
    // statements are keyed on session_id, so redelivering either is a no-op re-write.
    closeSession({sessionId, to}) {
        return this.#db.withConnection(async connection => {
            const [result] = await connection.query(
                'UPDATE open_session_use SET to_time = ? WHERE session_id = ?',
                [to, sessionId]
            )
            if (result.affectedRows === 0) {
                await connection.query(
                    `INSERT INTO open_session_use (session_id, username, instance_type, from_time, to_time)
                     VALUES (?, '', '', ?, ?)
                     ON DUPLICATE KEY UPDATE to_time=VALUES(to_time)`,
                    [sessionId, to, to]
                )
            }
        })
    }

    removeUser(username) {
        return this.#db.withConnection(connection => connection.query(
            'DELETE FROM open_session_use WHERE username = ?', [username]
        ))
    }

    count() {
        return this.#db.withConnection(async connection => {
            const [[{c}]] = await connection.query('SELECT COUNT(*) AS c FROM open_session_use')
            return c
        })
    }

    openSessionIds() {
        return this.#db.withConnection(async connection => {
            const [rows] = await connection.query(
                'SELECT session_id FROM open_session_use WHERE to_time IS NULL'
            )
            return rows.map(row => row.session_id)
        })
    }

    usersWithOpenSessions() {
        return this.#db.withConnection(async connection => {
            const [rows] = await connection.query(
                'SELECT DISTINCT username FROM open_session_use WHERE to_time IS NULL'
            )
            return rows.map(row => row.username)
        })
    }
}
