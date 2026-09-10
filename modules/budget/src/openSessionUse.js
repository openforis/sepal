import {storedUsername} from '#sepal/username'

// Event-sourced instance-use rows. Upserts are keyed by session_id, so at-least-once delivery
// and out-of-order events converge.
export class OpenSessionUseRepository {
    #db

    constructor(db) {
        if (!db) {
            throw new Error('An open session use repository requires a db')
        }
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

    // closeSession — stamp to_time on the row opened by openSession() (the common case). If no row
    // exists yet (Closed-before-Activated race), fall back to inserting a placeholder row
    // (from_time = to) that a later openSession() will correct via its own ON DUPLICATE KEY UPDATE.
    // Both statements are keyed on session_id, so redelivery of either query is a no-op re-write.
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
}
