// Instance repository — persists worker instance lifecycle to the `worker`.`instance` table.
//
// Methods:
//   launched(instance | instance[])  INSERT
//   reserved(id, workerType)         race-safe UPDATE … WHERE worker_type IS NULL → boolean
//   released(id)                     UPDATE SET worker_type = NULL → boolean
//   terminated(id)                   DELETE
//   idleInstances(instanceType)      SELECT … WHERE worker_type IS NULL → id[]
//
// createInstanceRepository(pool?) — pool falls back to the module-level getPool(), so
// integration tests can inject a scratch pool and exercise PRODUCTION code directly.

import {getPool} from '../db.js'

const createInstanceRepository = (pool = null) => {
    const resolvePool = () => pool ?? getPool()

    // launched — insert one or many instances (SizeIdlePool passes a collection).
    const launched = async instanceOrInstances => {
        const instances = Array.isArray(instanceOrInstances)
            ? instanceOrInstances
            : [instanceOrInstances]
        const p = resolvePool()
        for (const instance of instances) {
            const workerType = instance.reservation?.workerType ?? null
            await p.query(
                'INSERT INTO instance(id, type, worker_type) VALUES(?, ?, ?)',
                [instance.id, instance.type, workerType]
            )
        }
    }

    // reserved — race-safe compare-and-swap (a single UPDATE, never SELECT-then-UPDATE).
    // Returns true iff exactly 1 row was updated, i.e. the instance was idle and this call won the
    // race. affectedRows is correct here: the WHERE guarantees matched == changed.
    const reserved = async (id, workerType) => {
        const p = resolvePool()
        const [result] = await p.query(
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
        const p = resolvePool()
        const [result] = await p.query(
            'UPDATE instance SET worker_type = NULL WHERE id = ?',
            [id]
        )
        return result.changedRows > 0
    }

    const terminated = async id => {
        const p = resolvePool()
        await p.query(
            'DELETE FROM instance WHERE id = ?',
            [id]
        )
    }

    const idleInstances = async instanceType => {
        const p = resolvePool()
        const [rows] = await p.query(
            'SELECT id FROM instance WHERE type = ? AND worker_type IS NULL',
            [instanceType]
        )
        return rows.map(row => row.id)
    }

    return {idleInstances, launched, released, reserved, terminated}
}

// Module-level singletons, bound to the shared pool via getPool().
const {idleInstances, launched, released, reserved, terminated} = createInstanceRepository()

export {createInstanceRepository, idleInstances, launched, released, reserved, terminated}
