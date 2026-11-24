import {createDb, createPool} from '#sepal/db/postgres'
import {createTestDb} from '#sepal/testSupport/db/testDb'

// Publishing moves tables between schemas, which only their owner may do, so the rebuild suites run the
// ingestor as the application role that owns the test database, as production does. The ordinary insert
// suites keep createTestDb's data-only account.
export const createRebuildDb = async migrations => {
    const testDb = await createTestDb({name: 'scene_rebuild', migrations})
    let pool
    try {
        pool = await createPool(testDb.dbName)
    } catch (error) {
        await testDb.remove()
        throw error
    }
    const db = createDb(pool)
    const query = (sql, params) => db.withConnection(connection => connection.query(sql, params))

    return {
        dbName: testDb.dbName,
        db,
        query,
        reset: async () => {
            await query('DROP SCHEMA IF EXISTS staging, backup CASCADE')
            await testDb.reset()
        },
        remove: async () => {
            try {
                await pool.end()
            } finally {
                await testDb.remove()
            }
        }
    }
}
