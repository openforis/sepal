import {FakeRecipeRepository} from '../test/fakeRecipeRepository.js'
import {migrateRecipes} from './migrateRecipes.js'
import {currentVersionForType} from './migration/registry.js'

let repository

beforeEach(() => {
    repository = new FakeRecipeRepository()
})

describe('migrateRecipes', () => {
    test('brings recipes below the current version up to it', async () => {
        await givenRecipe('stale', OUTDATED_TYPE_VERSION)
        await givenRecipe('current', MOSAIC_VERSION)

        await migrateRecipes({repository, log: silent})

        expect(await staleRecipeIds()).toEqual([])
    })

    test('lets the others through when one recipe cannot be migrated', async () => {
        await givenRecipe('unreadable', OUTDATED_TYPE_VERSION)
        await givenRecipe('readable', OUTDATED_TYPE_VERSION)

        await migrateRecipes({repository: withUnreadableDocument(repository, 'unreadable'), log: silent})

        expect(await staleRecipeIds()).toEqual(['unreadable'])
    })
})

const givenRecipe = (id, typeVersion) => repository.saveRecipe({
    id, owner: OWNER, projectId: null, name: id, type: 'MOSAIC', typeVersion, content: aRecipeContent()
})

const aRecipeContent = (over = {}) => ({model: {}, ...over})

const staleRecipeIds = async () =>
    (await repository.findRecipesToMigrate('MOSAIC', MOSAIC_VERSION)).map(({id}) => id)

// The adapter reports a document it cannot parse rather than failing the batch; this is that recipe.
const withUnreadableDocument = (repository, unreadableId) => ({
    findRecipesToMigrate: async (...args) =>
        (await repository.findRecipesToMigrate(...args))
            .map(recipe => recipe.id === unreadableId ? {...recipe, content: null} : recipe),
    saveMigratedRecipe: migrated => repository.saveMigratedRecipe(migrated)
})

const silent = {info: () => {}, warn: () => {}}

const OWNER = 'bob'

const MOSAIC_VERSION = currentVersionForType('MOSAIC')
const OUTDATED_TYPE_VERSION = MOSAIC_VERSION - 1
