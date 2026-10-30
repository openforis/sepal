import assert from 'node:assert/strict'
import {beforeEach, describe, test} from 'node:test'

import {FakeRecipeRepository} from '../test/fakeRecipeRepository.js'
import {currentVersionForType} from './migration/registry.js'
import {RecipeService} from './recipeService.js'

let repository
let service

beforeEach(() => {
    repository = new FakeRecipeRepository()
    service = new RecipeService(repository)
})

describe('loadRecipe', () => {
    test('returns a recipe to its owner regardless of username case', async () => {
        const stored = recipeToStore()
        const {revision} = await repository.saveRecipe(stored)

        const recipe = await service.loadRecipe({principal: {...owner, username: 'BOB'}, recipeId: stored.id})

        assert.deepEqual(recipe, {...stored.content, folderId: stored.folderId, revision})
    })

    test('returns a recipe to its owner, with placement and revision', async () => {
        const stored = recipeToStore({folderId: 'sampling-folder'})
        const {revision} = await repository.saveRecipe(stored)

        const recipe = await service.loadRecipe({principal: owner, recipeId: stored.id})

        assert.deepEqual(recipe, {...stored.content, folderId: stored.folderId, revision})
    })

    test('hides a recipe owned by another user', async () => {
        const stored = recipeToStore()
        await repository.saveRecipe(stored)

        const recipe = await service.loadRecipe({principal: anotherUser, recipeId: stored.id})

        assert.equal(recipe, null)
    })

    test('returns a recipe owned by another user to an administrator', async () => {
        const stored = recipeToStore()
        await repository.saveRecipe(stored)

        const recipe = await service.loadRecipe({principal: administrator, recipeId: stored.id})

        assert.notEqual(recipe, null)
    })

    test('returns nothing for an unknown recipe', async () => {
        const recipe = await service.loadRecipe({principal: owner, recipeId: 'never-saved'})

        assert.equal(recipe, null)
    })
})

describe('saveRecipe', () => {
    test('stores the principal as owner', async () => {
        const recipe = aRecipe()

        await service.saveRecipe({principal: owner, recipe})

        assert.equal((await repository.findRecipe(recipe.id)).owner, owner.username)
    })

    test('stamps the current schema version for the recipe type', async () => {
        const recipe = aRecipe({type: 'MOSAIC'})

        await service.saveRecipe({principal: owner, recipe})

        assert.deepEqual(await repository.findRecipesToMigrate(recipe.type, MOSAIC_VERSION), [])
        const toMigrate = await repository.findRecipesToMigrate(recipe.type, MOSAIC_VERSION + 1)
        assert.equal(toMigrate.length, 1)
        assert.partialDeepStrictEqual(toMigrate, [{id: recipe.id, typeVersion: MOSAIC_VERSION}])
    })
})

describe('removeRecipes', () => {
    test('returns the owner\'s remaining recipes', async () => {
        const removed = recipeToStore({id: 'to-remove'})
        const kept = recipeToStore({id: 'to-keep'})
        await repository.saveRecipe(removed)
        await repository.saveRecipe(kept)

        const remaining = await service.removeRecipes({principal: owner, recipeIds: [removed.id]})

        assert.deepEqual(remaining.map(({id}) => id), [kept.id])
    })
})

describe('moveRecipes', () => {
    test('returns the moved recipe under its new folder', async () => {
        const destinationFolderId = 'destination-folder'
        const stored = recipeToStore({folderId: 'original-folder'})
        await repository.saveRecipe(stored)

        const recipes = await service.moveRecipes({
            principal: owner, folderId: destinationFolderId, recipeIds: [stored.id]
        })

        assert.equal(recipes.length, 1)

        assert.partialDeepStrictEqual(recipes, [{
            id: stored.id, folderId: destinationFolderId
        }])
    })
})

describe('saveFolder', () => {
    test('returns the owner\'s folders, the new one among them', async () => {
        const folder = aFolder()

        const result = await service.saveFolder({principal: owner, folder})

        assert.equal(result.folders.length, 1)
        assert.partialDeepStrictEqual(result, {
            outcome: 'saved',
            folders: [{...folder, username: owner.username}]
        })
    })

    test('reports the repository\'s rejection instead of the folders', async () => {
        const stored = folderToStore()
        await repository.saveFolder(stored)

        const result = await service.saveFolder({
            principal: owner, folder: {...aFolder(), parentId: stored.id}
        })

        assert.deepEqual(result, {outcome: 'cycle'})
    })
})

describe('removeFolder', () => {
    test('returns the owner\'s remaining folders', async () => {
        const removed = folderToStore({id: 'to-remove'})
        const kept = folderToStore({id: 'to-keep'})
        await repository.saveFolder(removed)
        await repository.saveFolder(kept)

        const result = await service.removeFolder({principal: owner, folderId: removed.id})

        assert.equal(result.folders.length, 1)
        assert.partialDeepStrictEqual(result, {
            outcome: 'removed',
            folders: [{id: kept.id}]
        })
    })

    test('reports the repository\'s rejection instead of the folders', async () => {
        const folder = folderToStore()
        await repository.saveFolder(folder)
        await repository.saveRecipe(recipeToStore({folderId: folder.id}))

        const result = await service.removeFolder({principal: owner, folderId: folder.id})

        assert.deepEqual(result, {outcome: 'notEmpty', folders: 0, recipes: 1})
    })
})

const recipeToStore = ({
    owner: recipeOwner = owner.username,
    typeVersion = MOSAIC_VERSION,
    ...recipe
} = {}) => ({
    ...aRecipe(recipe),
    owner: recipeOwner,
    typeVersion
})

const folderToStore = ({owner: folderOwner = owner.username, ...folder} = {}) => ({
    ...aFolder(folder),
    owner: folderOwner
})

const aRecipe = (over = {}) => ({
    id: 'a-recipe', folderId: null, name: 'A recipe', type: 'MOSAIC', content: aRecipeContent(), ...over
})

const aFolder = (over = {}) => ({id: 'a-folder', name: 'A folder', ...over})

const aRecipeContent = (over = {}) => ({model: {}, ...over})

const owner = {username: 'bob', roles: []}
const anotherUser = {username: 'alice', roles: []}
const administrator = {username: 'root', roles: ['application_admin']}

const MOSAIC_VERSION = currentVersionForType('MOSAIC')
