// Claim repository — the only thing MySQL knows about a worker instance: that it is spoken for.
//
//   claim(instanceId, sessionId)  INSERT  → true if won, false if already claimed
//   release(instanceId)           DELETE  → true if a row was removed
//   all()                         SELECT  → [{instanceId, sessionId, claimedAt}]
//
// The hosting service is the sole authority on what instances exist, what type they are and
// whether they are running. NEVER write a value derived from a hosting-service response into this
// table: an empty reservation read off an untagged RunInstances answer once landed here as
// worker_type = '', which no statement matched, making every idle pool instance unusable for life.
//
// createClaimRepository(pool?) — pool defaults to the shared worker pool, so integration tests can
// inject a scratch pool and exercise PRODUCTION code directly.

import {getPool} from '../db.js'

const DUPLICATE_ENTRY = 'ER_DUP_ENTRY'

const createClaimRepository = (pool = getPool()) => {
    // The PRIMARY KEY on instance_id makes this atomic with no affectedRows/changedRows
    // interpretation: the INSERT either lands or it collides.
    const claim = async (instanceId, sessionId) => {
        try {
            await pool.query(
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
    }

    // affectedRows is unambiguous on a DELETE — CLIENT_FOUND_ROWS only inflates UPDATE counts.
    const release = async instanceId => {
        const [result] = await pool.query(
            'DELETE FROM instance_claim WHERE instance_id = ?',
            [instanceId]
        )
        return result.affectedRows > 0
    }

    const all = async () => {
        const [rows] = await pool.query(
            'SELECT instance_id, session_id, claimed_at FROM instance_claim'
        )
        return rows.map(row => ({
            instanceId: row.instance_id,
            sessionId: row.session_id,
            claimedAt: new Date(row.claimed_at),
        }))
    }

    return {all, claim, release}
}

export {createClaimRepository}
