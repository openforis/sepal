import {getPool} from './db.js'
import {rowToMessage} from './message.js'

const MESSAGE = 'message.message'
const NOTIFICATION = 'message.notification'

const loadMessage = async id => {
    const [rows] = await getPool().query(`SELECT * FROM ${MESSAGE} WHERE id = ?`, [id])
    return rowToMessage(rows[0])
}

const saveMessage = async ({id, username, subject, contents, type, priority}) => {
    const now = new Date()
    await getPool().query(
        `INSERT INTO ${MESSAGE} (id, username, subject, contents, type, priority, creation_time, update_time, removed)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, FALSE)
         ON DUPLICATE KEY UPDATE
            username = VALUES(username), subject = VALUES(subject), contents = VALUES(contents),
            type = VALUES(type), priority = VALUES(priority), update_time = VALUES(update_time)`,
        [id, username, subject, contents, type, priority ?? 0, now, now]
    )
    // Re-notify: drop every user's read state, so a saved message is UNREAD again for everyone.
    // The author's READ state is re-established by the API layer right after.
    await getPool().query(`DELETE FROM ${NOTIFICATION} WHERE message_id = ?`, [id])
    return loadMessage(id)
}

const removeMessage = async id => {
    await getPool().query(`UPDATE ${MESSAGE} SET removed = TRUE WHERE id = ?`, [id])
}

const listMessages = async () => {
    const [rows] = await getPool().query(
        `SELECT * FROM ${MESSAGE} WHERE removed = FALSE ORDER BY update_time DESC`
    )
    return rows.map(rowToMessage)
}

// LEFT JOIN so every non-removed message appears; notifications without a row default to UNREAD.
// Select the message author as `author` (m.username) AND the requesting user as `username`.
// Unpublished messages (priority < 0) are admin-only and carry no notification: they never
// reach non-admins and are forced READ so they cannot trigger any unread/auto-open behavior.
const listNotifications = async (username, isAdmin) => {
    const [rows] = await getPool().query(
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
}

const updateNotification = async ({username, messageId, state}) => {
    await getPool().query(
        `INSERT INTO ${NOTIFICATION} (message_id, username, state)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE state = VALUES(state)`,
        [messageId, username, state]
    )
}

export {listMessages, listNotifications, loadMessage, removeMessage, saveMessage, updateNotification}
