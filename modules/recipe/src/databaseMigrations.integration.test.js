import {randomBytes} from 'crypto'
import {cp, mkdtemp, rm} from 'fs/promises'
import {tmpdir} from 'os'
import {join} from 'path'

import {createConnection, initDb, migrateDb} from '#sepal/db/mysql'
import {configureNoLogging} from '#sepal/log'
import {dirName} from '#sepal/path'

describe('recipe database migrations', () => {
    let admin
    const reserved = []

    beforeAll(async () => {
        configureNoLogging()
        admin = await createConnection('mysql')
    })

    afterEach(() => dropReservedDatabases())

    afterAll(() => admin?.end())

    test('compares usernames without regard to case', async () => {
        const dbName = await reserveDatabase()
        await initDb(dbName, SCHEMA_PATH)
        const stored = await insertRecipe(dbName, aRecipe())

        const [found] = await admin.query('SELECT username FROM ??.recipe WHERE username = ?', [dbName, stored.username.toUpperCase()])

        const collations = await usernameCollations(dbName)
        expect(found).toEqual([{username: stored.username}])
        expect(collations).toEqual({
            recipe: 'ascii_general_ci',
            project: 'ascii_general_ci'
        })
    })

    describe('schema migrations', () => {
        test('create a missing database with the recipe and project tables', async () => {
            const dbName = aDatabaseName()

            const {created} = await initDb(dbName, SCHEMA_PATH)

            ownIfCreated(dbName, created)
            expect(created).toBe(true)
            const tables = await tableNames(dbName)
            expect(tables).toEqual(expect.arrayContaining(['project', 'recipe']))
        })

        test('build the recipe and project tables in an existing database', async () => {
            const dbName = await reserveDatabase()

            await migrateDb(dbName, SCHEMA_PATH)

            const tables = await tableNames(dbName)
            expect(tables).toEqual(expect.arrayContaining(['project', 'recipe']))
        })

        test('refuse to migrate a database that does not exist', async () => {
            const dbName = aDatabaseName()

            const migration = migrateDb(dbName, SCHEMA_PATH)

            await expect(migration).rejects.toThrow()
            const exists = await databaseExists(dbName)
            expect(exists).toBe(false)
        })

        test('reject altered history even when no migration is pending', async () => {
            const dbName = await reserveDatabase()
            await initDb(dbName, SCHEMA_PATH)
            await admin.query('UPDATE ??.schema_version SET md5 = ? WHERE version = 1', [dbName, 'previous-file-checksum'])

            const migration = migrateDb(dbName, SCHEMA_PATH)

            await expect(migration).rejects.toThrow(/MD5 checksum failed/)
            const [history] = await admin.query('SELECT md5 FROM ??.schema_version WHERE version = 1', [dbName])
            expect(history).toEqual([{md5: 'previous-file-checksum'}])
        })

        test('create empty recipe and project tables', async () => {
            const dbName = await reserveDatabase()

            await initDb(dbName, SCHEMA_PATH)

            const counts = await rowCounts(dbName)
            expect(counts).toEqual({recipes: 0, projects: 0})
        })
    })

    describe('002.do.revision.sql', () => {
        test('backfills every existing row to revision 1, rewriting no contents', async () => {
            const dbName = await aDatabaseAtSchemaVersionOne()
            const first = {...aRecipe(), id: 'first', contents: '{"model":{"source":"LANDSAT"}}'}
            const second = {...aRecipe(), id: 'second', contents: '{"model":{"source":"RADAR"}}'}
            await insertRecipe(dbName, first)
            await insertRecipe(dbName, second)

            await migrateDb(dbName, SCHEMA_PATH)

            const [rows] = await admin.query(
                'SELECT id, revision, contents FROM ??.recipe ORDER BY id', [dbName]
            )
            expect(rows).toEqual([
                {id: first.id, revision: 1, contents: first.contents},
                {id: second.id, revision: 1, contents: second.contents}
            ])
        })
    })

    // Copy the real first migration unchanged so the full stream validates it before applying 002.
    const aDatabaseAtSchemaVersionOne = async () => {
        const dbName = await reserveDatabase()
        const firstVersionOnly = await mkdtemp(join(tmpdir(), 'recipe-schema-v1-'))
        try {
            await cp(join(SCHEMA_PATH, '001.do.schema.sql'), join(firstVersionOnly, '001.do.schema.sql'))
            await initDb(dbName, firstVersionOnly)
        } finally {
            await rm(firstVersionOnly, {recursive: true, force: true})
        }
        return dbName
    }

    // Deliberately not IF NOT EXISTS: a name collision must fail rather than take over a database
    // someone else owns, so only databases this suite created are ever dropped.
    const reserveDatabase = async () => {
        const dbName = aDatabaseName()
        await admin.query(`CREATE DATABASE \`${dbName}\` DEFAULT CHARACTER SET ascii COLLATE ascii_bin`)
        reserved.push(dbName)
        return dbName
    }

    const ownIfCreated = (dbName, created) => {
        if (created) {
            reserved.push(dbName)
        }
    }

    const dropReservedDatabases = async () => {
        for (const dbName of reserved.splice(0)) {
            await admin.query(`DROP DATABASE IF EXISTS \`${dbName}\``)
        }
    }

    const insertRecipe = async (dbName, recipe) => {
        await admin.query('INSERT INTO ??.recipe SET ?', [dbName, recipe])
        return recipe
    }

    const rowCounts = async dbName => {
        const [[{recipes}]] = await admin.query('SELECT COUNT(*) AS recipes FROM ??.recipe', [dbName])
        const [[{projects}]] = await admin.query('SELECT COUNT(*) AS projects FROM ??.project', [dbName])
        return {recipes, projects}
    }

    const usernameCollations = async dbName => {
        const [rows] = await admin.query(
            'SELECT TABLE_NAME, COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND COLUMN_NAME = ?',
            [dbName, 'username']
        )
        return Object.fromEntries(rows.map(({TABLE_NAME, COLLATION_NAME}) => [TABLE_NAME, COLLATION_NAME]))
    }

    const tableNames = async dbName => {
        const [rows] = await admin.query(
            'SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME', [dbName]
        )
        return rows.map(({TABLE_NAME}) => TABLE_NAME)
    }

    const databaseExists = async dbName => {
        const [rows] = await admin.query('SELECT 1 FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?', [dbName])
        return rows.length > 0
    }
})

const aRecipe = () => ({
    id: 'a-recipe',
    username: 'owner',
    name: 'A recipe',
    type: 'MOSAIC',
    contents: '{}',
    creation_time: new Date('2026-01-01T00:00:00Z'),
    update_time: new Date('2026-01-01T00:00:00Z')
})

const aDatabaseName = () => `recipe_migrations_test_${randomBytes(6).toString('hex')}`

const SCHEMA_PATH = join(dirName(import.meta.url), '../migrations')
