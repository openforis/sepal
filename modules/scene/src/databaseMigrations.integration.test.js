import assert from 'node:assert/strict'
import {randomBytes} from 'node:crypto'
import {copyFile, mkdtemp, readdir, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {after, afterEach, before, describe, test} from 'node:test'

import {createConnection, initDb} from '#sepal/db/postgres'
import {configureNoLogging} from '#sepal/log'
import {dirName} from '#sepal/path'

describe('scene database migrations', () => {
    let admin
    let firstSchemaPath
    const reserved = []

    before(async () => {
        configureNoLogging()
        admin = await createConnection('postgres', SUPERUSER)
        firstSchemaPath = await schemaUpTo('001')
    })

    afterEach(() => dropReservedDatabases())

    after(async () => {
        await admin?.end()
        if (firstSchemaPath) await rm(firstSchemaPath, {recursive: true, force: true})
    })

    describe('schema migrations', () => {
        test('create the catalogue tables in the selected database', async () => {
            const dbName = await reserveDatabase()

            await initDb(dbName, SCHEMA_PATH)

            const tables = await tableNames(dbName)
            assert.ok(new Set(['catalogue', 'checkpoint', 'scene']).isSubsetOf(new Set(tables)))
        })

        test('create an empty, uninitialized catalogue', async () => {
            const dbName = await reserveDatabase()

            await initDb(dbName, SCHEMA_PATH)

            const ids = await storedIds(dbName)
            const state = await ingestionState(dbName)
            assert.deepEqual(ids, [])
            assert.deepEqual(state, {checkpoints: {}, initialized: []})
        })

        test('mark an existing catalogue initialized, leaving its checkpoints to be derived', async () => {
            const dbName = await reserveDatabase()
            await initDb(dbName, firstSchemaPath)
            await insertScenes(dbName, [aRow({id: 'existing', sensor_id: 'LANDSAT_8'})])

            await initDb(dbName, SCHEMA_PATH)

            const state = await ingestionState(dbName)
            assert.deepEqual(state.checkpoints, {})
            assert.equal(state.initialized.length, 1)
        })
    })

    // Deliberately not IF NOT EXISTS: a name collision must fail rather than take over a database
    // someone else owns, so only databases this suite created are ever dropped.
    const reserveDatabase = async () => {
        const dbName = `scene_migrations_test_${randomBytes(6).toString('hex')}`
        await admin.query(`CREATE DATABASE ${admin.escapeIdentifier(dbName)} OWNER ${admin.escapeIdentifier(process.env.POSTGRES_USER)}`)
        reserved.push(dbName)
        return dbName
    }

    const dropReservedDatabases = async () => {
        for (const dbName of reserved.splice(0)) {
            await admin.query(`DROP DATABASE IF EXISTS ${admin.escapeIdentifier(dbName)} WITH (FORCE)`)
        }
    }

    const query = async (dbName, sql, params) => {
        const connection = await createConnection(dbName, SUPERUSER)
        try {
            return await connection.query(sql, params)
        } finally {
            await connection.end()
        }
    }

    const storedIds = async dbName => {
        const {rows} = await query(dbName, 'SELECT id FROM scene ORDER BY id')
        return rows.map(({id}) => id)
    }

    // Postgrator applies every migration in a directory, so an older schema is a directory holding fewer.
    const schemaUpTo = async version => {
        const path = await mkdtemp(join(tmpdir(), 'scene-migrations-'))
        for (const file of await readdir(SCHEMA_PATH)) {
            if (file <= `${version}.~`) await copyFile(join(SCHEMA_PATH, file), join(path, file))
        }
        return path
    }

    const insertScenes = (dbName, rows) => query(dbName, `
        INSERT INTO scene SELECT * FROM json_populate_recordset(NULL::scene, $1)`, [JSON.stringify(rows)])

    const ingestionState = async dbName => {
        const {rows: checkpoints} = await query(dbName, 'SELECT dataset, last_acquisition FROM checkpoint')
        const {rows: catalogue} = await query(dbName, 'SELECT initialized FROM catalogue')
        return {
            checkpoints: Object.fromEntries(checkpoints.map(({dataset, last_acquisition}) => [dataset, last_acquisition.toISOString()])),
            initialized: catalogue.map(({initialized}) => initialized.toISOString())
        }
    }

    const tableNames = async dbName => {
        const {rows} = await query(
            dbName,
            'SELECT table_name FROM information_schema.tables WHERE table_schema = \'public\' ORDER BY table_name'
        )
        return rows.map(({table_name}) => table_name)
    }
})

const aRow = overrides => ({
    meta_data_source: 'LANDSAT', scene_area_id: '42_34', acquisition_date: '2021-07-15T00:00:00Z', day_of_year: 196,
    cloud_cover: 10, sun_azimuth: 130.5, sun_elevation: 55.25, update_time: '2021-10-01T00:00:00Z', ...overrides
})

const SUPERUSER = {user: 'postgres', password: process.env.POSTGRES_ROOT_PASSWORD}

const SCHEMA_PATH = join(dirName(import.meta.url), '../migrations')
