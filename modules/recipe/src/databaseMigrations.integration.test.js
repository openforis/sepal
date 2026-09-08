import {createHash, randomBytes} from 'crypto'
import {cp, mkdtemp, readFile, rm} from 'fs/promises'
import {tmpdir} from 'os'
import {join} from 'path'

import {createConnection, initDatabase, migrateDb} from '#sepal/db/mysql'
import {configureNoLogging} from '#sepal/log'
import {dirName} from '#sepal/path'

import {migrateRecipeDb} from './databaseMigrations.js'

describe('recipe database migrations', () => {
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
        test('create a missing database with the recipe and project tables', async () => {
            const dbName = aDatabaseName()

            const {created} = await initDatabase(dbName, SCHEMA_PATH)

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

        test('create empty recipe and project tables', async () => {
            const dbName = await reserveDatabase()

            await initDatabase(dbName, SCHEMA_PATH)

            const counts = await rowCounts(dbName)
            expect(counts).toEqual({recipes: 0, projects: 0})
        })
    })

    describe('002.do.revision.sql', () => {
        test('backfills every existing row to revision 1, rewriting no contents', async () => {
            const dbName = await aDatabaseAtSchemaVersionOne()
            const first = aStoredRecipe({id: 'first'})
            const second = aStoredRecipe({id: 'second'})
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

    describe('startup on a database migrated by the deployed files', () => {
        test('corrects the schema checksum and records the import as completed, keeping the recipes', async () => {
            const dbName = await aDatabaseMigratedByTheDeployedFiles()
            const recipe = await insertRecipe(dbName, aRecipe())
            const combined = await recordedSchema(dbName)

            await migrateRecipeDb(dbName, log)

            const schema = await recordedSchema(dbName)
            const imports = await recordedImports(dbName)
            const ids = await recipeIds(dbName)
            expect(ids).toEqual([recipe.id])
            expect(schema).toEqual({...combined, md5: await checksum(SCHEMA_FILE)})
            expect(imports).toEqual([
                {version: 1, name: 'import', md5: await checksum(IMPORT_FILE), run_at: combined.run_at}
            ])
        })

        // Version 2 is the one this covers: without its transition the schema correction alone leaves the
        // revision checksum stale, and validation then refuses to start.
        test('corrects the revision checksum too, keeping the recipes, revisions and timestamps', async () => {
            const dbName = await aDatabaseMigratedByTheDeployedFiles()
            // A revision the column's default cannot produce, so resetting one would not pass for it.
            const recipe = await insertRecipe(dbName, aStoredRecipe({revision: AN_ADVANCED_REVISION}))
            const deployed = await recordedHistory(dbName)

            await migrateRecipeDb(dbName, log)

            const history = await recordedHistory(dbName)
            const stored = await storedRecipes(dbName)
            const corrected = {1: await checksum(SCHEMA_FILE), 2: await checksum(REVISION_FILE)}
            expect(history).toEqual(deployed.map(row => corrected[row.version]
                ? {...row, md5: corrected[row.version]}
                : row))
            expect(stored).toEqual([{id: recipe.id, revision: AN_ADVANCED_REVISION, contents: recipe.contents}])
        })

        test('changes nothing on the next startup', async () => {
            const dbName = await aDatabaseMigratedByTheDeployedFiles()
            await insertRecipe(dbName, aStoredRecipe())
            await migrateRecipeDb(dbName, log)
            const before = await databaseState(dbName)

            await migrateRecipeDb(dbName, log)

            const state = await databaseState(dbName)
            expect(state).toEqual(before)
        })

        test('rejects an unrecognized checksum without changing the history', async () => {
            const dbName = await reserveDatabase()
            await initDatabase(dbName, SCHEMA_PATH)
            await recordSchemaChecksum(dbName, 'unrecognized')
            const before = await recordedSchema(dbName)

            const startup = migrateRecipeDb(dbName, log)

            await expect(startup).rejects.toThrow(/MD5 checksum failed/)
            const schema = await recordedSchema(dbName)
            expect(schema).toEqual(before)
            const tables = await tableNames(dbName)
            expect(tables).not.toContain('legacy_import_version')
        })
    })

    // Version 1 only, from an unchanged copy of the real file: the recorded checksum is the production
    // one, so migrating afterwards against the full directory validates it and applies 002.
    const aDatabaseAtSchemaVersionOne = async () => {
        const dbName = await reserveDatabase()
        const firstVersionOnly = await mkdtemp(join(tmpdir(), 'recipe-schema-v1-'))
        try {
            await cp(join(SCHEMA_PATH, '001.do.schema.sql'), join(firstVersionOnly, '001.do.schema.sql'))
            await initDatabase(dbName, firstVersionOnly)
        } finally {
            await rm(firstVersionOnly, {recursive: true, force: true})
        }
        return dbName
    }

    // The deployed files built the same tables these build now; only their checksums differ. A database
    // that ran them carries both, so reconciling one without the other leaves validation failing.
    const aDatabaseMigratedByTheDeployedFiles = async () => {
        const dbName = await reserveDatabase()
        await initDatabase(dbName, SCHEMA_PATH)
        await recordSchemaChecksum(dbName, DEPLOYED_COMBINED_MD5)
        await recordSchemaChecksum(dbName, DEPLOYED_QUALIFIED_REVISION_MD5, 2)
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

    const recordSchemaChecksum = (dbName, md5, version = 1) =>
        admin.query('UPDATE ??.schema_version SET md5 = ? WHERE version = ?', [dbName, md5, version])

    const recordedHistory = async dbName => {
        const [rows] = await admin.query(
            'SELECT version, name, md5, run_at FROM ??.schema_version ORDER BY version', [dbName]
        )
        return rows
    }

    const storedRecipes = async dbName => {
        const [rows] = await admin.query('SELECT id, revision, contents FROM ??.recipe ORDER BY id', [dbName])
        return rows
    }

    const databaseState = async dbName => ({
        recipes: await storedRecipes(dbName),
        history: await recordedHistory(dbName),
        imports: await recordedImports(dbName)
    })

    const recordedSchema = async dbName => {
        const [rows] = await admin.query(
            'SELECT version, name, md5, run_at FROM ??.schema_version WHERE version = 1', [dbName]
        )
        return rows[0]
    }

    const recordedImports = async dbName => {
        const [rows] = await admin.query(
            'SELECT version, name, md5, run_at FROM ??.legacy_import_version ORDER BY version', [dbName]
        )
        return rows
    }

    const recipeIds = async dbName => {
        const [rows] = await admin.query('SELECT id FROM ??.recipe ORDER BY id', [dbName])
        return rows.map(({id}) => id)
    }

    const rowCounts = async dbName => {
        const [[{recipes}]] = await admin.query('SELECT COUNT(*) AS recipes FROM ??.recipe', [dbName])
        const [[{projects}]] = await admin.query('SELECT COUNT(*) AS projects FROM ??.project', [dbName])
        return {recipes, projects}
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

const aStoredRecipe = (overrides = {}) => ({
    id: 'a-stored-recipe',
    username: 'bob',
    name: 'A recipe',
    type: 'MOSAIC',
    contents: '{"model":{"source":"LANDSAT"}}',
    creation_time: new Date('2026-01-01T00:00:00Z'),
    update_time: new Date('2026-01-01T00:00:00Z'),
    ...overrides
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

const checksum = async file => createHash('md5').update(await readFile(file, 'utf8')).digest('hex')

const SCHEMA_PATH = join(dirName(import.meta.url), '../migrations')
const SCHEMA_FILE = join(SCHEMA_PATH, '001.do.schema.sql')
const IMPORT_FILE = join(SCHEMA_PATH, 'legacy-import/001.do.import.sql')
const AN_ADVANCED_REVISION = 7
const REVISION_FILE = join(SCHEMA_PATH, '002.do.revision.sql')
const DEPLOYED_COMBINED_MD5 = '37b325f8ea33d8a4bd40052089a0abf9'
const DEPLOYED_QUALIFIED_REVISION_MD5 = 'b34d0a1633eeadec62bd60204ea11c8a'
