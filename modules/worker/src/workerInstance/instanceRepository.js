// Instance repository — persists worker instance lifecycle to the `worker`.`instance` table.
//
// Methods:
//   launched(instance | instance[])  INSERT
//   reserved(id, workerType)         race-safe UPDATE … WHERE worker_type IS NULL → boolean
//   released(id)                     UPDATE SET worker_type = NULL → boolean
//   terminated(id)                   DELETE
//   idleInstances(instanceType)      SELECT … WHERE worker_type IS NULL → id[]
//   reconciled(instances)            INSERT IGNORE the ones with no row yet → count adopted
//   forgotten(knownIds)              DELETE idle rows for ids not in knownIds → count dropped
//
// createInstanceRepository(pool?) — pool defaults to the shared worker pool, so integration
// tests can inject a scratch pool and exercise PRODUCTION code directly.

import {getPool} from '../db.js'
import {placeholders} from '../sql.js'

const createInstanceRepository = (pool = getPool()) => {
    // launched — insert one or many instances (SizeIdlePool passes a collection).
    const launched = async instanceOrInstances => {
        const instances = Array.isArray(instanceOrInstances)
            ? instanceOrInstances
            : [instanceOrInstances]
        for (const instance of instances) {
            const workerType = instance.reservation?.workerType ?? null
            await pool.query(
                'INSERT INTO instance(id, type, worker_type) VALUES(?, ?, ?)',
                [instance.id, instance.type, workerType]
            )
        }
    }

    // reserved — race-safe compare-and-swap (a single UPDATE, never SELECT-then-UPDATE).
    // Returns true iff exactly 1 row was updated, i.e. the instance was idle and this call won the
    // race. affectedRows is correct here: the WHERE guarantees matched == changed.
    const reserved = async (id, workerType) => {
        const [result] = await pool.query(
            'UPDATE instance SET worker_type = ? WHERE id = ? AND worker_type IS NULL',
            [workerType, id]
        )
        return result.affectedRows === 1
    }

    // released — null out worker_type.
    // mysql2 defaults to CLIENT_FOUND_ROWS, so affectedRows would count the matched row and
    // wrongly return true on a double-release. changedRows parses "Changed: N" from the OK packet:
    // 0 on a double-release, 1 on a real one — the sentinel ReleaseInstance uses to gate undeploy.
    const released = async id => {
        const [result] = await pool.query(
            'UPDATE instance SET worker_type = NULL WHERE id = ?',
            [id]
        )
        return result.changedRows > 0
    }

    const terminated = async id => {
        await pool.query(
            'DELETE FROM instance WHERE id = ?',
            [id]
        )
    }

    const idleInstances = async instanceType => {
        const [rows] = await pool.query(
            'SELECT id FROM instance WHERE type = ? AND worker_type IS NULL',
            [instanceType]
        )
        return rows.map(row => row.id)
    }

    // reconciled — adopt provider-idle instances this table has never seen, as idle.
    //
    // The hosting service is the only real source of truth about what exists. RequestInstance
    // reserves an instance only when it is idle in BOTH the provider and here, while SizeIdlePool
    // counts the provider alone: an idle instance with no row is therefore unusable AND counted
    // towards the pool target, so no usable replacement is ever launched and the orphan bills
    // forever. Adoption closes that gap.
    //
    // INSERT IGNORE, never UPDATE: a row that already exists may have been reserved by
    // RequestInstance a microsecond ago, and adopting must not un-reserve a live session.
    const reconciled = async instances => {
        let adopted = 0
        for (const instance of instances) {
            const [result] = await pool.query(
                'INSERT IGNORE INTO instance(id, type, worker_type) VALUES(?, ?, NULL)',
                [instance.id, instance.type]
            )
            adopted += result.affectedRows
        }
        return adopted
    }

    // forgotten — drop idle rows for instances the hosting service no longer has.
    //
    // Only `worker_type IS NULL` rows: a reserved instance the provider failed to report must
    // survive, or ReleaseInstance would read its own release as a lost race and skip the undeploy.
    // An empty knownIds is not a no-op — it means the provider has nothing left, so neither should
    // this table.
    const forgotten = async knownIds => {
        const ids = [...knownIds]
        const [result] = ids.length === 0
            ? await pool.query('DELETE FROM instance WHERE worker_type IS NULL')
            : await pool.query(
                `DELETE FROM instance WHERE worker_type IS NULL AND id NOT IN (${placeholders(ids.length)})`,
                ids
            )
        return result.affectedRows
    }

    return {forgotten, idleInstances, launched, reconciled, released, reserved, terminated}
}

export {createInstanceRepository}
