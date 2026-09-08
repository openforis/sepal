import {rowToMessage} from './message.js'

const MESSAGE = 'message'
const NOTIFICATION = 'notification'

export class MessageRepository {
    #db
    #clock

    constructor(db, clock) {
        if (!db) {
            throw new Error('A message repository requires a db')
        }
        if (!clock) {
            throw new Error('A message repository requires a clock')
        }
        this.#db = db
        this.#clock = clock
    }

    loadMessage(id) {
        return this.#db.withTransaction(connection => loadMessage(connection, id))
    }

    saveMessage({id, username, subject, contents, type, priority}) {
        return this.#db.withTransaction(async connection => {
            const now = this.#clock()
            await connection.query(
                `INSERT INTO ${MESSAGE} (id, username, subject, contents, type, priority, creation_time, update_time, removed)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, FALSE)
                 ON DUPLICATE KEY UPDATE
                    username = VALUES(username), subject = VALUES(subject), contents = VALUES(contents),
                    type = VALUES(type), priority = VALUES(priority), update_time = VALUES(update_time)`,
                [id, username, subject, contents, type, priority ?? 0, now, now]
            )
            // Re-notify: drop every user's read state, so a saved message is UNREAD again for everyone.
            // The author's READ state is re-established by the API layer right after.
            await connection.query(`DELETE FROM ${NOTIFICATION} WHERE message_id = ?`, [id])
            return await loadMessage(connection, id)
        })
    }

    removeMessage(id) {
        return this.#db.withTransaction(async connection => {
            await connection.query(`UPDATE ${MESSAGE} SET removed = TRUE WHERE id = ?`, [id])
        })
    }

    listMessages() {
        return this.#db.withTransaction(async connection => {
            const [rows] = await connection.query(
                `SELECT * FROM ${MESSAGE} WHERE removed = FALSE ORDER BY update_time DESC`
            )
            return rows.map(rowToMessage)
        })
    }

    // LEFT JOIN so every non-removed message appears; notifications without a row default to UNREAD.
    // Select the message author as `author` (m.username) AND the requesting user as `username`.
    // Unpublished messages (priority < 0) are admin-only and carry no notification: they never
    // reach non-admins and are forced READ so they cannot trigger any unread/auto-open behavior.
    listNotifications(username, isAdmin) {
        return this.#db.withTransaction(async connection => {
            const [rows] = await connection.query(
                `SELECT m.id AS messageId, m.username AS author, m.subject, m.contents, m.type, m.priority,
                        m.creation_time, m.update_time, ? AS username,
                        CASE WHEN m.priority < 0 THEN 'READ' ELSE COALESCE(n.state, 'UNREAD') END AS state,
                        COALESCE(a.acknowledged, 0) AS acknowledged
                 FROM ${MESSAGE} m
                 LEFT JOIN ${NOTIFICATION} n ON n.message_id = m.id AND n.username = ?
                 LEFT JOIN (
                     SELECT message_id, COUNT(*) AS acknowledged
                     FROM ${NOTIFICATION}
                     WHERE state = 'READ'
                     GROUP BY message_id
                 ) a ON a.message_id = m.id
                 WHERE m.removed = FALSE AND (m.priority >= 0 OR ?)
                 ORDER BY m.update_time DESC`,
                [username, username, !!isAdmin]
            )
            return rows
        })
    }

    updateNotification({username, messageId, state}) {
        return this.#db.withTransaction(async connection => {
            await connection.query(
                `INSERT INTO ${NOTIFICATION} (message_id, username, state)
                 VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE state = VALUES(state)`,
                [messageId, username, state]
            )
        })
    }
}

const loadMessage = async (connection, id) => {
    const [rows] = await connection.query(`SELECT * FROM ${MESSAGE} WHERE id = ?`, [id])
    return rowToMessage(rows[0])
}
