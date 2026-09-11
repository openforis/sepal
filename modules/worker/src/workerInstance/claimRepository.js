// The only thing MySQL knows about a worker instance: that it is spoken for.
//
// The hosting service is the sole authority on what instances exist, what type they are and
// whether they are running. NEVER write a value derived from a hosting-service response into this
// table: an empty reservation read off an untagged RunInstances answer once landed here as
// worker_type = '', which no statement matched, making every idle pool instance unusable for life.

const DUPLICATE_ENTRY = 'ER_DUP_ENTRY'

export class ClaimRepository {
    #db

    constructor(db) {
        this.#db = db
    }

    // The PRIMARY KEY on instance_id makes this atomic with no affectedRows/changedRows
    // interpretation: the INSERT either lands or it collides.
    claim(instanceId, sessionId) {
        return this.#db.withConnection(async connection => {
            try {
                await connection.query(
                    'INSERT INTO instance_claim(instance_id, session_id) VALUES(?, ?)',
                    [instanceId, sessionId]
                )
                return true
            } catch (err) {
                if (err.code === DUPLICATE_ENTRY) {
                    return false
                }
                throw err
            }
        })
    }

    // affectedRows is unambiguous on a DELETE — CLIENT_FOUND_ROWS only inflates UPDATE counts.
    release(instanceId) {
        return this.#db.withConnection(async connection => {
            const [result] = await connection.query(
                'DELETE FROM instance_claim WHERE instance_id = ?',
                [instanceId]
            )
            return result.affectedRows > 0
        })
    }

    all() {
        return this.#db.withConnection(async connection => {
            const [rows] = await connection.query(
                'SELECT instance_id, session_id, claimed_at FROM instance_claim'
            )
            return rows.map(row => ({
                instanceId: row.instance_id,
                sessionId: row.session_id,
                claimedAt: new Date(row.claimed_at),
            }))
        })
    }
}
