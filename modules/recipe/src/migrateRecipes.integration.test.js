import {join} from 'path'

import {configureNoLogging} from '#sepal/log'
import {dirName} from '#sepal/path'
import {failingDb} from '#sepal/testSupport/db/faultyConnection'
import {createTestDb} from '#sepal/testSupport/db/testDb'

import {migrateRecipes} from './migrateRecipes.js'
import {currentVersionForType} from './migration/registry.js'
import {RecipeRepository} from './recipeRepository.js'

describe('migrateRecipes', () => {
    let testDb
    let repository

    beforeAll(async () => {
        configureNoLogging()
        testDb = await createTestDb({name: 'recipemigraterecipes', migrations: MIGRATIONS_PATH})
        repository = new RecipeRepository(testDb.db)
    })

    beforeEach(() => testDb.reset())

    afterAll(() => testDb?.remove())

    test('brings recipes below the current version up to it', async () => {
        const stale = await givenRecipe({id: 'stale', typeVersion: OUTDATED_TYPE_VERSION})
        await givenRecipe({id: 'current', typeVersion: MOSAIC_VERSION})

        await migrateRecipes({repository, log: silent})

        const remaining = await staleRecipeIds()
        const migrated = await repository.findRecipe(stale.id)
        expect(remaining).toEqual([])
        expect(migrated.recipe.revision).toBe(MIGRATED_REVISION)
    })

    // The injected failure precedes this operation's only write, so this shows isolation between
    // recipes rather than rollback within one; rollback has its own coverage in the repository suite.
    test('leaves a recipe whose save fails untouched, and migrates the others', async () => {
        const refused = await givenRecipe({id: 'refused', typeVersion: OUTDATED_TYPE_VERSION})
        const other = await givenRecipe({id: 'other', typeVersion: OUTDATED_TYPE_VERSION})
        const before = await repository.findRecipe(refused.id)
        const refusingOneSave = new RecipeRepository(failingDb(testDb.db, {
            when: theMigrationSaveOf(refused.id), error: new Error('save refused')
        }))

        await migrateRecipes({repository: refusingOneSave, log: silent})

        const untouched = await repository.findRecipe(refused.id)
        const remaining = await staleRecipeIds()
        const migrated = await repository.findRecipe(other.id)
        expect(untouched).toEqual(before)
        expect(remaining).toEqual([refused.id])
        expect(migrated.recipe.revision).toBe(MIGRATED_REVISION)
    })

    test('logs and skips a recipe it cannot read, and migrates the others', async () => {
        const unreadable = await givenRecipe({id: 'unreadable', typeVersion: OUTDATED_TYPE_VERSION})
        const other = await givenRecipe({id: 'other', typeVersion: OUTDATED_TYPE_VERSION})
        const before = await repository.findRecipe(unreadable.id)
        const log = aRecordingLog()
        const readingOneAsUnreadable = new RecipeRepository(withUnreadableRecord(testDb.db, unreadable.id))

        await migrateRecipes({repository: readingOneAsUnreadable, log})

        const untouched = await repository.findRecipe(unreadable.id)
        const remaining = await staleRecipeIds()
        const migrated = await repository.findRecipe(other.id)
        expect(untouched).toEqual(before)
        expect(remaining).toEqual([unreadable.id])
        expect(migrated.recipe.revision).toBe(MIGRATED_REVISION)
        expect(log.warnings).toEqual([expect.stringContaining(unreadable.id)])
    })

    const givenRecipe = async recipe => {
        const stored = aRecipe(recipe)
        await repository.saveRecipe(stored)
        return stored
    }

    const staleRecipeIds = async () =>
        (await repository.findRecipesToMigrate('MOSAIC', MOSAIC_VERSION)).map(({id}) => id)

    // Lets every real query run, then makes one returned record unreadable on the way back. Nothing
    // malformed is stored, and every other call and result passes through untouched.
    const withUnreadableRecord = (db, id) => ({
        withTransaction: callback => db.withTransaction(connection => callback(corrupting(connection, id))),
        withConnection: callback => db.withConnection(connection => callback(corrupting(connection, id)))
    })

    // Delegated with the real connection as receiver; only row sets are rewritten, so a write result
    // keeps its shape.
    const corrupting = (connection, id) => ({
        query: async (sql, params) => {
            const [rows, ...rest] = await connection.query(sql, params)
            return [Array.isArray(rows) ? rows.map(row => unreadableIf(row, id)) : rows, ...rest]
        },
        beginTransaction: () => connection.beginTransaction(),
        commit: () => connection.commit(),
        rollback: () => connection.rollback(),
        release: () => connection.release(),
        destroy: () => connection.destroy()
    })

    const unreadableIf = (row, id) => row.id === id ? {...row, contents: 'not json'} : row

    const aRecordingLog = () => {
        const warnings = []
        return {warnings, info: () => {}, warn: message => warnings.push(message)}
    }

    // The migration write of one recipe: the statement that advances its version, for that id alone.
    const theMigrationSaveOf = id => (sql, params) =>
        /UPDATE recipe SET type_version/i.test(sql) && params.includes(id)

    const aRecipe = (over = {}) => ({
        id: 'a-recipe', owner: OWNER, projectId: null, name: 'A recipe', type: 'MOSAIC',
        typeVersion: MOSAIC_VERSION, content: {model: {}}, ...over
    })
})

const silent = {info: () => {}, warn: () => {}}

const OWNER = 'bob'
const MIGRATED_REVISION = 2
const MOSAIC_VERSION = currentVersionForType('MOSAIC')
const OUTDATED_TYPE_VERSION = MOSAIC_VERSION - 1

const MIGRATIONS_PATH = join(dirName(import.meta.url), '../migrations')
