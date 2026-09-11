import {createConnection} from '#sepal/db/mysql'
import {createTestDb} from '#sepal/testSupport/db/testDb'

// LOAD DATA INFILE requires FILE; DDL is confined to these three randomly named schemas.
// The ordinary insert suites keep createTestDb's original data-only privileges.
export const createRebuildDb = async migrations => {
    const testDb = await createTestDb({name: 'scene_rebuild', migrations})
    let admin
    const disposable = []
    try {
        admin = await createConnection('mysql')
        const username = await testDb.withAnotherConnection(async connection => {
            const [[{user}]] = await connection.query('SELECT CURRENT_USER() AS user')
            return user.split('@')[0]
        })
        for (const dbName of [`${testDb.dbName}_new`, `${testDb.dbName}_old`]) {
            await admin.query('CREATE DATABASE ??', [dbName])
            disposable.push(dbName)
        }
        for (const dbName of [testDb.dbName, ...disposable]) {
            const pattern = dbName.replace(/[_%]/g, '\\$&')
            await admin.query(`GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, DROP, ALTER ON \`${pattern}\`.* TO ?@'%'`, [username])
        }
        await admin.query('GRANT FILE ON *.* TO ?@\'%\'', [username])
    } catch (error) {
        await remove()
        throw error
    }

    async function dropDisposable() {
        for (const dbName of disposable) {
            await admin.query('DROP DATABASE IF EXISTS ??', [dbName])
        }
    }

    async function remove() {
        try {
            await dropDisposable()
        } finally {
            try {
                await testDb.remove()
            } finally {
                await admin?.end()
            }
        }
    }

    return {
        ...testDb,
        reset: async () => {
            await dropDisposable()
            await testDb.reset()
        },
        remove
    }
}
