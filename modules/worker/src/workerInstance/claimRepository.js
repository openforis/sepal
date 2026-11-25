// The only thing the database knows about a worker instance: that it is spoken for.
//
// The hosting service is the sole authority on what instances exist, what type they are and
// whether they are running. NEVER write a value derived from a hosting-service response into this
// table: an empty reservation read off an untagged RunInstances answer once landed here as
// worker_type = '', which no statement matched, making every idle pool instance unusable for life.

import {isUniqueViolation} from '#sepal/db/postgres'

export class ClaimRepository {
    #db

    constructor(db) {
        this.#db = db
    }

    // The PRIMARY KEY on instance_id makes this atomic with no row-count interpretation: the
    // INSERT either lands or it collides. It runs outside a transaction, so the collision aborts
    // nothing else.
    claim(instanceId, sessionId) {
        return this.#db.withConnection(async connection => {
            try {
                await connection.query(
                    'INSERT INTO instance_claim(instance_id, session_id) VALUES($1, $2)',
                    [instanceId, sessionId]
                )
                return true
            } catch (err) {
                if (isUniqueViolation(err)) {
                    return false
                }
                throw err
            }
        })
    }

    // Only the claim the caller holds: a release that runs late must not drop the claim of the
    // session the instance went to next.
    release(instanceId, sessionId) {
        return this.#db.withConnection(async connection => {
            const {rowCount} = await connection.query(
                'DELETE FROM instance_claim WHERE instance_id = $1 AND session_id = $2',
                [instanceId, sessionId]
            )
            return rowCount > 0
        })
    }

    async startRecovery(instanceId, sessionId) {
        const changed = await this.#db.withConnection(async connection => {
            const {rowCount} = await connection.query(
                `UPDATE instance_claim SET recovery_started_at = COALESCE(recovery_started_at, now())
                 WHERE instance_id = $1 AND session_id = $2`,
                [instanceId, sessionId]
            )
            return rowCount > 0
        })
        return changed || await this.sessionIdForInstance(instanceId) === sessionId
    }

    finishRecovery(instanceId, sessionId) {
        return this.#db.withConnection(connection => connection.query(
            'UPDATE instance_claim SET recovery_started_at = NULL WHERE instance_id = $1 AND session_id = $2',
            [instanceId, sessionId]
        ))
    }

    all() {
        return this.#db.withConnection(async connection => {
            const {rows} = await connection.query(
                'SELECT instance_id, session_id, claimed_at, recovery_started_at FROM instance_claim'
            )
            return rows.map(row => ({
                instanceId: row.instance_id,
                sessionId: row.session_id,
                claimedAt: new Date(row.claimed_at),
                recoveryStartedAt: row.recovery_started_at ? new Date(row.recovery_started_at) : null,
            }))
        })
    }

    // null means unclaimed; an empty string is a legacy session key.
    sessionIdForInstance(instanceId) {
        return this.#db.withConnection(async connection => {
            const {rows} = await connection.query(
                'SELECT session_id FROM instance_claim WHERE instance_id = $1',
                [instanceId]
            )
            return rows[0]?.session_id ?? null
        })
    }
}
