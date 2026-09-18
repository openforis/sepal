import {randomBytes} from 'crypto'
import {cp, mkdtemp, readdir, rm} from 'fs/promises'
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
            project: 'ascii_general_ci',
            folder: 'ascii_general_ci'
        })
    })

    describe('schema migrations', () => {
        test('create a missing database with the recipe, project and folder tables', async () => {
            const dbName = aDatabaseName()

            const {created} = await initDb(dbName, SCHEMA_PATH)

            ownIfCreated(dbName, created)
            expect(created).toBe(true)
            const tables = await tableNames(dbName)
            expect(tables).toEqual(expect.arrayContaining(['folder', 'project', 'recipe']))
        })

        test('build the recipe, project and folder tables in an existing database', async () => {
            const dbName = await reserveDatabase()

            await migrateDb(dbName, SCHEMA_PATH)

            const tables = await tableNames(dbName)
            expect(tables).toEqual(expect.arrayContaining(['folder', 'project', 'recipe']))
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
            const dbName = await aDatabaseAtSchemaVersion(1)
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

    describe('003.do.folders.sql', () => {
        test('makes a root folder of every project, with its name, owner and default folders', async () => {
            const dbName = await aDatabaseAtSchemaVersion(2)
            await insertProject(dbName, aProject({id: 'kenya', name: 'Kenya'}))

            await migrateDb(dbName, SCHEMA_PATH)

            const [folders] = await admin.query('SELECT * FROM ??.folder', [dbName])
            expect(folders).toEqual([{
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

            expect(await folderIds(dbName)).toEqual([
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

            expect(await folderIds(dbName)).toEqual([
                {id: 'empty', folder_id: null},
                {id: 'foreign', folder_id: null},
                {id: 'unknown', folder_id: null}
            ])
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

const aProject = (over = {}) => ({
    id: 'a-project',
    username: 'owner',
    name: 'A project',
    default_asset_folder: 'assets/kenya',
    default_workspace_folder: 'downloads/kenya',
    ...over
})

const aDatabaseName = () => `recipe_migrations_test_${randomBytes(6).toString('hex')}`

const SCHEMA_PATH = join(dirName(import.meta.url), '../migrations')
