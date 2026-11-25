import assert from 'node:assert/strict'
import {join} from 'node:path'
import {after, afterEach, before, beforeEach, describe, test} from 'node:test'

import {importFromMysql, StaleImportError} from '#sepal/db/mysqlImport'
import {configureNoLogging} from '#sepal/log'
import {dirName} from '#sepal/path'
import {createMysqlTestDb} from '#sepal/testSupport/db/mysqlTestDb'
import {createTestDb} from '#sepal/testSupport/db/testDb'

import {FINGERPRINT, IMPORT_SQL} from './databaseMigrations.js'

describe('recipe import from MySQL', () => {
    let source
    let target

    before(async () => {
        configureNoLogging()
        source = await createMysqlTestDb({name: 'recipe_import', migrations: MYSQL_SCHEMA_PATH})
    })

    beforeEach(async () => {
        await source.reset()
        target = await createTestDb({name: 'recipe_import', migrations: SCHEMA_PATH})
    })

    afterEach(() => target?.remove())

    after(() => source?.remove())

    test('imports every table\'s rows unchanged', async () => {
        const recipe = aRecipe({
            name: 'Café 😀 漢字',
            contents: {model: {name: 'Ünïcode 😀', dates: {years: [2020, 2021]}, cloud: {threshold: 0.25, mask: null}}},
            removed: 1, type_version: 7, revision: 4
        })
        const project = aProject({name: 'Projet 😀', default_asset_folder: 'users/bob/Ünïcode', default_workspace_folder: 'Ünïcode 😀'})
        await seedRecipe(recipe)
        await seedProject(project)

        await importFromMysql(importOf(source, target))

        assert.deepEqual(await importedRecipes(target), [{...recipe, removed: true}])
        assert.deepEqual(await importedProjects(target), [project])
    })

    test('imports nothing when a recipe holds a document that is not JSON', async () => {
        await seedRecipe(aRecipe())
        await seedRecipe(aRecipe({id: 'not-json', contents: '{"model":'}))
        await seedProject(aProject())

        const imported = importFromMysql(importOf(source, target))

        await assert.rejects(imported, /invalid input syntax for type json/)
        assert.deepEqual(await rowCounts(target), {recipes: 0, projects: 0})
    })

    test('refuses to start after a change to recipe', async () => {
        const recipe = aRecipe()
        await seedRecipe(recipe)
        await importFromMysql(importOf(source, target))
        await source.query('UPDATE recipe SET removed = TRUE WHERE id = ?', [recipe.id])

        const restarted = importFromMysql(importOf(source, target))

        await assert.rejects(restarted, StaleImportError)
    })

    test('refuses to start after a change to project', async () => {
        const project = aProject()
        await seedProject(project)
        await importFromMysql(importOf(source, target))
        await source.query('UPDATE project SET name = ? WHERE id = ?', ['Renamed', project.id])

        const restarted = importFromMysql(importOf(source, target))

        await assert.rejects(restarted, StaleImportError)
    })

    const seedRecipe = recipe => {
        const row = {
            ...recipe,
            contents: typeof recipe.contents === 'string' ? recipe.contents : JSON.stringify(recipe.contents)
        }
        const columns = Object.keys(row)
        return source.query(
            `INSERT INTO recipe (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
            Object.values(row)
        )
    }

    const seedProject = project => {
        const columns = Object.keys(project)
        return source.query(
            `INSERT INTO project (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
            Object.values(project)
        )
    }
})

const aRecipe = overrides => ({
    id: 'a-recipe',
    username: 'bob',
    name: 'A recipe',
    type: 'MOSAIC',
    contents: {model: {}},
    creation_time: new Date('2026-01-02T03:04:05Z'),
    update_time: new Date('2026-02-03T04:05:06Z'),
    removed: 0,
    type_version: 1,
    project_id: 'a-project',
    revision: 1,
    ...overrides
})

const aProject = overrides => ({
    id: 'a-project',
    username: 'bob',
    name: 'A project',
    default_asset_folder: null,
    default_workspace_folder: null,
    ...overrides
})

const importOf = (source, target) => ({
    dbName: target.dbName,
    sourceDb: source.dbName,
    sqlPath: IMPORT_SQL,
    fingerprint: FINGERPRINT,
    mysql: {
        host: process.env.MYSQL_FDW_HOST ?? process.env.MYSQL_HOST,
        user: source.account.username,
        password: source.account.password
    }
})

const importedRecipes = async target => {
    const {rows} = await target.query(`
        SELECT id, username, name, type, contents, creation_time, update_time, removed, type_version, project_id, revision
        FROM recipe ORDER BY id`)
    return rows
}

const importedProjects = async target => {
    const {rows} = await target.query(
        'SELECT id, username, name, default_asset_folder, default_workspace_folder FROM project ORDER BY id')
    return rows
}

const rowCounts = async target => {
    const {rows: [counts]} = await target.query(
        'SELECT (SELECT COUNT(*) FROM recipe) AS recipes, (SELECT COUNT(*) FROM project) AS projects')
    return counts
}

const MYSQL_SCHEMA_PATH = join(dirName(import.meta.url), '../migrations-mysql')
const SCHEMA_PATH = join(dirName(import.meta.url), '../migrations')
