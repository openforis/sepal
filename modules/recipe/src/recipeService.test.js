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

        assert.deepEqual(recipe, {...stored.content, projectId: stored.projectId, revision})
    })

    test('returns a recipe to its owner, with placement and revision', async () => {
        const stored = recipeToStore({projectId: 'sampling-project'})
        const {revision} = await repository.saveRecipe(stored)

        const recipe = await service.loadRecipe({principal: owner, recipeId: stored.id})

        assert.deepEqual(recipe, {...stored.content, projectId: stored.projectId, revision})
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
    test('returns the moved recipe under its new project', async () => {
        const destinationProjectId = 'destination-project'
        const stored = recipeToStore({projectId: 'original-project'})
        await repository.saveRecipe(stored)

        const recipes = await service.moveRecipes({
            principal: owner, projectId: destinationProjectId, recipeIds: [stored.id]
        })

        assert.equal(recipes.length, 1)

        assert.partialDeepStrictEqual(recipes, [{
            id: stored.id, projectId: destinationProjectId
        }])
    })
})

describe('saveProject', () => {
    test('returns the owner\'s projects, the new one among them', async () => {
        const project = aProject()

        const projects = await service.saveProject({principal: owner, project})

        assert.equal(projects.length, 1)
        assert.partialDeepStrictEqual(projects, [{...project, username: owner.username}])
    })
})

describe('removeProject', () => {
    test('returns the owner\'s remaining projects', async () => {
        const removed = projectToStore({id: 'to-remove'})
        const kept = projectToStore({id: 'to-keep'})
        await repository.saveProject(removed)
        await repository.saveProject(kept)

        const remaining = await service.removeProject({principal: owner, projectId: removed.id})

        assert.deepEqual(remaining.map(({id}) => id), [kept.id])
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

const projectToStore = ({owner: projectOwner = owner.username, ...project} = {}) => ({
    ...aProject(project),
    owner: projectOwner
})

const aRecipe = (over = {}) => ({
    id: 'a-recipe', projectId: null, name: 'A recipe', type: 'MOSAIC', content: aRecipeContent(), ...over
})

const aProject = (over = {}) => ({id: 'a-project', name: 'A project', ...over})

const aRecipeContent = (over = {}) => ({model: {}, ...over})

const owner = {username: 'bob', roles: []}
const anotherUser = {username: 'alice', roles: []}
const administrator = {username: 'root', roles: ['application_admin']}

const MOSAIC_VERSION = currentVersionForType('MOSAIC')
