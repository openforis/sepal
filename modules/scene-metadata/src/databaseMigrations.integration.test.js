import assert from 'node:assert/strict'
import {randomBytes} from 'node:crypto'
import {join} from 'node:path'
import {after, afterEach, before, describe, test} from 'node:test'

import {createConnection, initDb} from '#sepal/db/mysql'
import {configureNoLogging} from '#sepal/log'
import {dirName} from '#sepal/path'

describe('scene metadata database migrations', () => {
    let admin
    const reserved = []

    before(async () => {
        configureNoLogging()
        admin = await createConnection('mysql')
    })

    afterEach(() => dropReservedDatabases())

    after(() => admin?.end())

    describe('schema migrations', () => {
        test('create the scene_meta_data table in the selected database', async () => {
            const dbName = await reserveDatabase()

            await initDb(dbName, SCHEMA_PATH)

            const tables = await tableNames(dbName)
            assert.ok(new Set(['scene_meta_data']).isSubsetOf(new Set(tables)))
        })

        test('create an empty scene_meta_data table', async () => {
            const dbName = await reserveDatabase()

            await initDb(dbName, SCHEMA_PATH)

            const ids = await storedIds(dbName)
            assert.deepEqual(ids, [])
        })
    })

    // Deliberately not IF NOT EXISTS: a name collision must fail rather than take over a database
    // someone else owns, so only databases this suite created are ever dropped.
    const reserveDatabase = async () => {
        const dbName = `scenemetadatamigrations_${randomBytes(6).toString('hex')}`
        await admin.query(`CREATE DATABASE \`${dbName}\` DEFAULT CHARACTER SET ascii COLLATE ascii_bin`)
        reserved.push(dbName)
        return dbName
    }

    const dropReservedDatabases = async () => {
        for (const dbName of reserved.splice(0)) {
            await admin.query(`DROP DATABASE IF EXISTS \`${dbName}\``)
        }
    }

    const storedIds = async dbName => {
        const [rows] = await admin.query('SELECT id FROM ??.scene_meta_data ORDER BY id', [dbName])
        return rows.map(({id}) => id)
    }

    const tableNames = async dbName => {
        const [rows] = await admin.query(
            'SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME', [dbName]
        )
        return rows.map(({TABLE_NAME}) => TABLE_NAME)
    }
})

const SCHEMA_PATH = join(dirName(import.meta.url), '../migrations')
