// Event-sourced instance-use rows. Upserts are keyed by session_id, so at-least-once delivery
// and out-of-order events converge.
export const createOpenSessionUse = pool => {
    const openSession = ({sessionId, username, instanceType, from}) =>
        pool().query(
            `INSERT INTO open_session_use (session_id, username, instance_type, from_time)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE username=VALUES(username), instance_type=VALUES(instance_type),
                                     from_time=VALUES(from_time)`,
            [sessionId, username, instanceType, from]
        )
    // closeSession — stamp to_time on the row opened by openSession() (the common case). If no row
    // exists yet (Closed-before-Activated race), fall back to inserting a placeholder row
    // (from_time = to) that a later openSession() will correct via its own ON DUPLICATE KEY UPDATE.
    // Both statements are keyed on session_id, so redelivery of either query is a no-op re-write.
    const closeSession = async ({sessionId, to}) => {
        const [result] = await pool().query(
            'UPDATE open_session_use SET to_time = ? WHERE session_id = ?',
            [to, sessionId]
        )
        if (result.affectedRows === 0) {
            await pool().query(
                `INSERT INTO open_session_use (session_id, username, instance_type, from_time, to_time)
                 VALUES (?, '', '', ?, ?)
                 ON DUPLICATE KEY UPDATE to_time=VALUES(to_time)`,
                [sessionId, to, to]
            )
        }
    }
    const removeUser = username =>
        pool().query('DELETE FROM open_session_use WHERE username = ?', [username])
    return {openSession, closeSession, removeUser}
}
