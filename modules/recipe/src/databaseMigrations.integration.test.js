import assert from 'node:assert/strict'
import {randomBytes} from 'node:crypto'
import {join} from 'node:path'
import {after, afterEach, before, describe, test} from 'node:test'

import {createConnection, initDb} from '#sepal/db/postgres'
import {configureNoLogging} from '#sepal/log'
import {dirName} from '#sepal/path'

describe('recipe database migrations', () => {
    let admin
    const reserved = []

    before(async () => {
        configureNoLogging()
        admin = await createConnection('postgres', {user: 'postgres', password: process.env.POSTGRES_ROOT_PASSWORD})
    })

    afterEach(() => dropReservedDatabases())

    after(() => admin?.end())

    test('creates the recipe and project tables in the selected database', async () => {
        const dbName = await reserveDatabase()

        await initDb(dbName, SCHEMA_PATH)

        const tables = await tableNames(dbName)
        assert.ok(new Set(['project', 'recipe']).isSubsetOf(new Set(tables)))
    })

    test('creates empty recipe and project tables', async () => {
        const dbName = await reserveDatabase()

        await initDb(dbName, SCHEMA_PATH)

        assert.deepEqual(await rowCounts(dbName), {recipes: 0, projects: 0})
    })

    test('compares usernames without regard to case', async () => {
        const dbName = await reserveDatabase()
        await initDb(dbName, SCHEMA_PATH)
        const stored = await insertRecipe(dbName, aRecipe())
        const project = await insertProject(dbName, aProject())

        const recipes = await query(dbName, 'SELECT username FROM recipe WHERE username = $1', [stored.username.toUpperCase()])
        const projects = await query(dbName, 'SELECT username FROM project WHERE username = $1', [project.username.toUpperCase()])

        assert.deepEqual(recipes.rows, [{username: stored.username}])
        assert.deepEqual(projects.rows, [{username: project.username}])
    })

    // Deliberately not IF NOT EXISTS: a name collision must fail rather than take over a database
    // someone else owns, so only databases this suite created are ever dropped.
    const reserveDatabase = async () => {
        const dbName = `recipe_migrations_test_${randomBytes(6).toString('hex')}`
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
        const connection = await createConnection(dbName, {user: 'postgres', password: process.env.POSTGRES_ROOT_PASSWORD})
        try {
            return await connection.query(sql, params)
        } finally {
            await connection.end()
        }
    }

    const insertRecipe = async (dbName, recipe) => {
        await query(
            dbName,
            `INSERT INTO recipe (id, username, name, type, contents, creation_time, update_time)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [recipe.id, recipe.username, recipe.name, recipe.type, recipe.contents, recipe.creation_time, recipe.update_time]
        )
        return recipe
    }

    const insertProject = async (dbName, project) => {
        await query(dbName, 'INSERT INTO project (id, username, name) VALUES ($1, $2, $3)', [project.id, project.username, project.name])
        return project
    }

    const rowCounts = async dbName => {
        const {rows: [counts]} = await query(
            dbName,
            'SELECT (SELECT COUNT(*) FROM recipe) AS recipes, (SELECT COUNT(*) FROM project) AS projects'
        )
        return counts
    }

    const tableNames = async dbName => {
        const {rows} = await query(
            dbName,
            'SELECT table_name FROM information_schema.tables WHERE table_schema = \'public\' ORDER BY table_name'
        )
        return rows.map(({table_name}) => table_name)
    }
})

const aRecipe = () => ({
    id: 'a-recipe',
    username: 'owner',
    name: 'A recipe',
    type: 'MOSAIC',
    contents: {},
    creation_time: new Date('2026-01-01T00:00:00Z'),
    update_time: new Date('2026-01-01T00:00:00Z')
})

const aProject = () => ({
    id: 'a-project',
    username: 'owner',
    name: 'A project'
})

const SCHEMA_PATH = join(dirName(import.meta.url), '../migrations')
