import assert from 'node:assert/strict'
import {randomBytes} from 'node:crypto'
import {cp, mkdtemp, readdir, readFile, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {after, afterEach, before, describe, test} from 'node:test'

import {createConnection, initDb, migrateDb} from '#sepal/db/mysql'
import {configureNoLogging} from '#sepal/log'
import {dirName} from '#sepal/path'

import {migrateRecipeDb} from './databaseMigrations.js'

describe('recipe database migrations', () => {
    let admin
    const reserved = []
    const importCopies = []

    before(async () => {
        configureNoLogging()
        admin = await createConnection('mysql')
    })

    afterEach(async () => {
        await dropReservedDatabases()
        await removeImportCopies()
    })

    after(() => admin?.end())

    test('compares usernames without regard to case', async () => {
        const dbName = await reserveDatabase()
        await initDb(dbName, SCHEMA_PATH)
        const stored = await insertRecipe(dbName, aRecipe())

        const [found] = await admin.query('SELECT username FROM ??.recipe WHERE username = ?', [dbName, stored.username.toUpperCase()])

        const collations = await usernameCollations(dbName)
        assert.deepEqual(found, [{username: stored.username}])
        assert.deepEqual(collations, {
            recipe: 'ascii_general_ci',
            project: 'ascii_general_ci',
            folder: 'ascii_general_ci'
        })
    })

    describe('schema migrations', () => {
        test('create a missing database with the recipe, project and folder tables', async () => {
            const dbName = aDatabaseName()

            const {created} = await initDb(dbName, SCHEMA_PATH)

            ownIfCreated(dbName, created)
            assert.equal(created, true)
            const tables = await tableNames(dbName)
            assert.ok(new Set(['folder', 'project', 'recipe']).isSubsetOf(new Set(tables)))
        })

        test('build the recipe, project and folder tables in an existing database', async () => {
            const dbName = await reserveDatabase()

            await migrateDb(dbName, SCHEMA_PATH)

            const tables = await tableNames(dbName)
            assert.ok(new Set(['folder', 'project', 'recipe']).isSubsetOf(new Set(tables)))
        })

        test('refuse to migrate a database that does not exist', async () => {
            const dbName = aDatabaseName()

            const migration = migrateDb(dbName, SCHEMA_PATH)

            await assert.rejects(migration)
            const exists = await databaseExists(dbName)
            assert.equal(exists, false)
        })

        test('reject altered history even when no migration is pending', async () => {
            const dbName = await reserveDatabase()
            await initDb(dbName, SCHEMA_PATH)
            await admin.query('UPDATE ??.schema_version SET md5 = ? WHERE version = 1', [dbName, 'previous-file-checksum'])

            const migration = migrateDb(dbName, SCHEMA_PATH)

            await assert.rejects(migration, /MD5 checksum failed/)
            const [history] = await admin.query('SELECT md5 FROM ??.schema_version WHERE version = 1', [dbName])
            assert.deepEqual(history, [{md5: 'previous-file-checksum'}])
        })

        test('create empty recipe, project and folder tables', async () => {
            const dbName = await reserveDatabase()

            await initDb(dbName, SCHEMA_PATH)

            const counts = await rowCounts(dbName)
            assert.deepEqual(counts, {recipes: 0, projects: 0, folders: 0})
        })
    })

    describe('002.do.revision.sql', () => {
        test('backfills every existing row to revision 1, rewriting no contents', async () => {
            const dbName = await aDatabaseAtSchemaVersion(1)
            const first = {...aRecipe(), id: 'first', contents: '{"model":{"source":"LANDSAT"}}'}
            const second = {...aRecipe(), id: 'second', contents: '{"model":{"source":"RADAR"}}'}
            await insertRecipe(dbName, first)
            await insertRecipe(dbName, second)

            await migrateDb(dbName, SCHEMA_PATH)

            const [rows] = await admin.query(
                'SELECT id, revision, contents FROM ??.recipe ORDER BY id', [dbName]
            )
            assert.deepEqual(rows, [
                {id: first.id, revision: 1, contents: first.contents},
                {id: second.id, revision: 1, contents: second.contents}
            ])
        })
    })

    describe('003.do.folders.sql', () => {
        test('makes a root folder of every project, with its name, owner and default folders', async () => {
            const dbName = await aDatabaseAtSchemaVersion(2)
            await insertProject(dbName, aProject({id: 'kenya', name: 'Kenya'}))

            await migrateDb(dbName, SCHEMA_PATH)

            const [folders] = await admin.query('SELECT * FROM ??.folder', [dbName])
            assert.deepEqual(folders, [{
                id: 'kenya',
                username: 'owner',
                name: 'Kenya',
                parent_id: null,
                default_asset_folder: 'assets/kenya',
                default_workspace_folder: 'downloads/kenya'
            }])
        })

        test('puts each recipe in the folder its project became', async () => {
            const dbName = await aDatabaseAtSchemaVersion(2)
            await insertProject(dbName, aProject({id: 'kenya'}))
            await insertRecipe(dbName, {...aRecipe(), id: 'in-kenya', project_id: 'kenya'})
            await insertRecipe(dbName, {...aRecipe(), id: 'at-root'})

            await migrateDb(dbName, SCHEMA_PATH)

            assert.deepEqual(await folderIds(dbName), [
                {id: 'at-root', folder_id: null},
                {id: 'in-kenya', folder_id: 'kenya'}
            ])
        })

        test('leaves at the root a recipe whose project is empty, unknown, or another owner\'s', async () => {
            const dbName = await aDatabaseAtSchemaVersion(2)
            await insertProject(dbName, aProject({id: 'alices', username: 'alice'}))
            await insertRecipe(dbName, {...aRecipe(), id: 'empty', project_id: ''})
            await insertRecipe(dbName, {...aRecipe(), id: 'foreign', project_id: 'alices'})
            await insertRecipe(dbName, {...aRecipe(), id: 'unknown', project_id: 'removed-long-ago'})

            await migrateDb(dbName, SCHEMA_PATH)

            assert.deepEqual(await folderIds(dbName), [
                {id: 'empty', folder_id: null},
                {id: 'foreign', folder_id: null},
                {id: 'unknown', folder_id: null}
            ])
        })
    })

    // The schema stream runs before the import, so on a fresh database 003 copies an empty project table.
    describe('migrateRecipeDb, with the legacy import', () => {
        test('makes a folder of every imported project on a fresh database', async () => {
            const source = await aLegacySource()
            const kenya = await insertProject(source, aProject({id: 'kenya', name: 'Kenya'}))
            await insertRecipe(source, {...aRecipe(), id: 'in-kenya', project_id: kenya.id})
            const dbName = await reserveDatabase()

            await migrateRecipeDb(dbName, {importPath: await importReading(source)})

            const [folders] = await admin.query('SELECT * FROM ??.folder', [dbName])
            assert.deepEqual(folders, [{
                id: kenya.id,
                username: kenya.username,
                name: kenya.name,
                parent_id: null,
                default_asset_folder: kenya.default_asset_folder,
                default_workspace_folder: kenya.default_workspace_folder
            }])
            assert.deepEqual(await folderIds(dbName), [{id: 'in-kenya', folder_id: kenya.id}])
        })

        test('leaves at the root an imported recipe whose project is empty or another owner\'s', async () => {
            const source = await aLegacySource()
            const alices = await insertProject(source, aProject({id: 'alices', username: 'alice'}))
            await insertRecipe(source, {...aRecipe(), id: 'empty', project_id: ''})
            await insertRecipe(source, {...aRecipe(), id: 'foreign', project_id: alices.id})
            const dbName = await reserveDatabase()

            await migrateRecipeDb(dbName, {importPath: await importReading(source)})

            assert.deepEqual(await folderIds(dbName), [
                {id: 'empty', folder_id: null},
                {id: 'foreign', folder_id: null}
            ])
        })

        test('makes the folders where an earlier start imported the projects after copying them', async () => {
            const source = await aLegacySource()
            const kenya = await insertProject(source, aProject({id: 'kenya'}))
            await insertRecipe(source, {...aRecipe(), id: 'in-kenya', project_id: kenya.id})
            const dbName = await reserveDatabase()
            await migrateRecipeDb(dbName, {importPath: await importReading(source, {through: 1})})

            await migrateRecipeDb(dbName, {importPath: await importReading(source)})

            assert.deepEqual(await folderIds(dbName), [{id: 'in-kenya', folder_id: kenya.id}])
        })

        // Where the import ran before 003, 003 made the folders, and users may have rearranged them since.
        test('leaves the folders alone where the folder migration already copied the projects', async () => {
            const source = await aLegacySource()
            const kenya = await insertProject(source, aProject({id: 'kenya'}))
            await insertRecipe(source, {...aRecipe(), id: 'in-kenya', project_id: kenya.id})
            const dbName = await aDatabaseAtSchemaVersion(2)
            await migrateDb(dbName, await importReading(source, {through: 1}), {schemaTable: IMPORT_HISTORY})
            await migrateDb(dbName, SCHEMA_PATH)
            await admin.query('UPDATE ??.recipe SET folder_id = NULL WHERE id = ?', [dbName, 'in-kenya'])

            await migrateRecipeDb(dbName, {importPath: await importReading(source)})

            const [folders] = await admin.query('SELECT id FROM ??.folder', [dbName])
            assert.deepEqual(folders, [{id: kenya.id}])
            assert.deepEqual(await folderIds(dbName), [{id: 'in-kenya', folder_id: null}])
        })

        test('builds an empty database where there is no legacy source', async () => {
            const dbName = await reserveDatabase()

            await migrateRecipeDb(dbName, {importPath: await importReading(aDatabaseName())})

            const counts = await rowCounts(dbName)
            assert.deepEqual(counts, {recipes: 0, projects: 0, folders: 0})
        })
    })

    // Copy the real migrations unchanged so the full stream validates them before applying the rest.
    const aDatabaseAtSchemaVersion = async version => {
        const dbName = await reserveDatabase()
        const earlierVersions = await mkdtemp(join(tmpdir(), 'recipe-schema-'))
        try {
            const files = (await readdir(SCHEMA_PATH))
                .filter(name => /^\d{3}\.do\..*\.sql$/.test(name) && Number(name.slice(0, 3)) <= version)
            for (const file of files) {
                await cp(join(SCHEMA_PATH, file), join(earlierVersions, file))
            }
            await initDb(dbName, earlierVersions)
        } finally {
            await rm(earlierVersions, {recursive: true, force: true})
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

    const aLegacySource = async () => {
        const source = await reserveDatabase()
        await admin.query(LEGACY_RECIPE_TABLE(source))
        await admin.query(LEGACY_PROJECT_TABLE(source))
        return source
    }

    // The import reads processing_recipe by name. A copy that reads the test's own source instead keeps the
    // suite away from any real legacy database on the same server.
    const importReading = async (source, {through = Infinity} = {}) => {
        const copy = await mkdtemp(join(tmpdir(), 'recipe-import-'))
        importCopies.push(copy)
        const files = (await readdir(IMPORT_PATH))
            .filter(name => /^\d{3}\.do\..*\.sql$/.test(name) && Number(name.slice(0, 3)) <= through)
        for (const file of files) {
            const sql = await readFile(join(IMPORT_PATH, file), 'utf8')
            await writeFile(join(copy, file), sql.replaceAll('processing_recipe', source))
        }
        return copy
    }

    const removeImportCopies = async () => {
        for (const copy of importCopies.splice(0)) {
            await rm(copy, {recursive: true, force: true})
        }
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

    const insertProject = async (dbName, project) => {
        await admin.query('INSERT INTO ??.project SET ?', [dbName, project])
        return project
    }

    const folderIds = async dbName => {
        const [rows] = await admin.query('SELECT id, folder_id FROM ??.recipe ORDER BY id', [dbName])
        return rows
    }

    const rowCounts = async dbName => {
        const [[{recipes}]] = await admin.query('SELECT COUNT(*) AS recipes FROM ??.recipe', [dbName])
        const [[{projects}]] = await admin.query('SELECT COUNT(*) AS projects FROM ??.project', [dbName])
        const [[{folders}]] = await admin.query('SELECT COUNT(*) AS folders FROM ??.folder', [dbName])
        return {recipes, projects, folders}
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

const aProject = (over = {}) => ({
    id: 'a-project',
    username: 'owner',
    name: 'A project',
    default_asset_folder: 'assets/kenya',
    default_workspace_folder: 'downloads/kenya',
    ...over
})

const aDatabaseName = () => `recipe_migrations_test_${randomBytes(6).toString('hex')}`

// processing_recipe as sepal-server's Flyway migrations V1 to V4 left it.
const LEGACY_RECIPE_TABLE = dbName => `
    CREATE TABLE \`${dbName}\`.recipe (
        id            VARCHAR(255) NOT NULL,
        username      VARCHAR(255) NOT NULL,
        name          VARCHAR(255) NOT NULL,
        type          VARCHAR(63)  NOT NULL,
        contents      LONGTEXT     NOT NULL,
        creation_time TIMESTAMP    NOT NULL,
        update_time   TIMESTAMP    NOT NULL,
        removed       BOOLEAN      NOT NULL DEFAULT FALSE,
        type_version  INT          DEFAULT 1,
        project_id    VARCHAR(255),
        PRIMARY KEY (id)
    )`

const LEGACY_PROJECT_TABLE = dbName => `
    CREATE TABLE \`${dbName}\`.project (
        id                       VARCHAR(255) NOT NULL,
        username                 VARCHAR(255) NOT NULL,
        name                     VARCHAR(255) NOT NULL,
        default_asset_folder     TEXT,
        default_workspace_folder TEXT,
        PRIMARY KEY (id)
    )`

const SCHEMA_PATH = join(dirName(import.meta.url), '../migrations')
const IMPORT_PATH = join(SCHEMA_PATH, 'legacy-import')
const IMPORT_HISTORY = 'legacy_import_version'
