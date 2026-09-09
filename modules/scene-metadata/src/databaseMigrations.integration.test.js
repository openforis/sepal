import {createHash, randomBytes} from 'crypto'
import {readFile} from 'fs/promises'
import {join} from 'path'

import {createConnection, initDb} from '#sepal/db/mysql'
import {configureNoLogging} from '#sepal/log'
import {dirName} from '#sepal/path'

import {migrateSceneMetadataDb} from './databaseMigrations.js'

describe('scene metadata database migrations', () => {
    let admin
    const reserved = []
    const log = {info: () => {}}

    beforeAll(async () => {
        configureNoLogging()
        admin = await createConnection('mysql')
    })

    afterEach(() => dropReservedDatabases())

    afterAll(() => admin?.end())

    describe('schema migrations', () => {
        test('create the scene_meta_data table in the selected database', async () => {
            const dbName = await reserveDatabase()

            await initDb(dbName, SCHEMA_PATH)

            const tables = await tableNames(dbName)
            expect(tables).toEqual(expect.arrayContaining(['scene_meta_data']))
        })

        test('create an empty scene_meta_data table', async () => {
            const dbName = await reserveDatabase()

            await initDb(dbName, SCHEMA_PATH)

            const ids = await storedIds(dbName)
            expect(ids).toEqual([])
        })
    })

    describe('startup on a database migrated by the deployed qualified file', () => {
        test('corrects the schema checksum, keeping the scene_meta_data rows', async () => {
            const dbName = await aDatabaseMigratedByTheQualifiedFile()
            const stored = await insertRow(dbName, aRow())
            const qualified = await recordedSchema(dbName)

            await migrateSceneMetadataDb(dbName, log)

            const schema = await recordedSchema(dbName)
            const ids = await storedIds(dbName)
            expect(ids).toEqual([stored.id])
            expect(schema).toEqual({...qualified, md5: await checksum(SCHEMA_FILE)})
        })

        test('creates no import history', async () => {
            const dbName = await aDatabaseMigratedByTheQualifiedFile()

            await migrateSceneMetadataDb(dbName, log)

            const tables = await tableNames(dbName)
            expect(tables).toEqual(['scene_meta_data', 'schema_version'])
        })

        test('changes nothing on the next startup', async () => {
            const dbName = await aDatabaseMigratedByTheQualifiedFile()
            await insertRow(dbName, aRow())
            await migrateSceneMetadataDb(dbName, log)
            const before = await databaseState(dbName)

            await migrateSceneMetadataDb(dbName, log)

            const state = await databaseState(dbName)
            expect(state).toEqual(before)
        })

        test('rejects an unrecognized checksum without changing the history', async () => {
            const dbName = await reserveDatabase()
            await initDb(dbName, SCHEMA_PATH)
            await recordSchemaChecksum(dbName, 'unrecognized')
            const before = await recordedSchema(dbName)

            const startup = migrateSceneMetadataDb(dbName, log)

            await expect(startup).rejects.toThrow(/MD5 checksum failed/)
            const schema = await recordedSchema(dbName)
            expect(schema).toEqual(before)
        })
    })

    // The qualified file built the same tables the portable file builds now; only its checksum differs.
    const aDatabaseMigratedByTheQualifiedFile = async () => {
        const dbName = await reserveDatabase()
        await initDb(dbName, SCHEMA_PATH)
        await recordSchemaChecksum(dbName, DEPLOYED_QUALIFIED_MD5)
        return dbName
    }

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

    const insertRow = async (dbName, row) => {
        await admin.query('INSERT INTO ??.scene_meta_data SET ?', [dbName, row])
        return row
    }

    const recordSchemaChecksum = (dbName, md5) =>
        admin.query('UPDATE ??.schema_version SET md5 = ? WHERE version = 1', [dbName, md5])

    const databaseState = async dbName => ({
        rows: await storedIds(dbName),
        schema: await recordedSchema(dbName),
        tables: await tableNames(dbName)
    })

    const recordedSchema = async dbName => {
        const [rows] = await admin.query(
            'SELECT version, name, md5, run_at FROM ??.schema_version WHERE version = 1', [dbName]
        )
        return rows[0]
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

const aRow = () => ({
    id: 'a-scene', meta_data_source: 'LANDSAT', sensor_id: 'LC08', scene_area_id: '123',
    acquisition_date: new Date('2026-01-01T00:00:00Z'), day_of_year: 1,
    cloud_cover: 0, sun_azimuth: 0, sun_elevation: 0, update_time: new Date('2026-01-01T00:00:00Z')
})

const checksum = async file => createHash('md5').update(await readFile(file, 'utf8')).digest('hex')

const SCHEMA_PATH = join(dirName(import.meta.url), '../migrations')
const SCHEMA_FILE = join(SCHEMA_PATH, '001.do.schema.sql')
const DEPLOYED_QUALIFIED_MD5 = '38a9a7d2a27224f23407230282b8c010'
