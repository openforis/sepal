import {jest} from '@jest/globals'

// Fake registry: FAKE_TYPE's current version is 2, with a migration that lifts a v1 recipe up to v2
const FAKE_MIGRATIONS_BY_TYPE = {
    FAKE_TYPE: {
        2: contents => ({...contents, migrated: true})
    }
}

jest.unstable_mockModule('./migration/registry.js', () => ({
    MIGRATIONS_BY_TYPE: FAKE_MIGRATIONS_BY_TYPE,
    currentVersionForType: type => FAKE_MIGRATIONS_BY_TYPE[type] ? 2 : 1
}))

const listRecipesOfTypeBeforeVersion = jest.fn()
const saveMigratedRecipe = jest.fn()

jest.unstable_mockModule('./recipeRepository.js', () => ({
    listRecipesOfTypeBeforeVersion,
    saveMigratedRecipe
}))

const {migrateRecipes} = await import('./migrateRecipes.js')

beforeEach(() => {
    listRecipesOfTypeBeforeVersion.mockReset()
    saveMigratedRecipe.mockReset()
})

test('migrateRecipes migrates stale recipes and saves with new type_version', async () => {
    const row = {id: 'r1', username: 'alice', type_version: 1, contents: '{"x":1}'}
    listRecipesOfTypeBeforeVersion.mockResolvedValueOnce([row])
    saveMigratedRecipe.mockResolvedValueOnce()

    await migrateRecipes()

    expect(listRecipesOfTypeBeforeVersion).toHaveBeenCalledWith('FAKE_TYPE', 2)
    expect(saveMigratedRecipe).toHaveBeenCalledWith({
        id: 'r1',
        username: 'alice',
        typeVersion: 2,
        contents: JSON.stringify({x: 1, migrated: true})
    })
})

test('migrateRecipes error on one recipe does not abort the rest', async () => {
    const bad = {id: 'bad', username: 'alice', type_version: 1, contents: 'not-valid-json'}
    const good = {id: 'good', username: 'alice', type_version: 1, contents: '{"y":2}'}
    listRecipesOfTypeBeforeVersion.mockResolvedValueOnce([bad, good])
    saveMigratedRecipe.mockResolvedValueOnce()

    await migrateRecipes()

    // good recipe must still be saved despite bad recipe failing
    expect(saveMigratedRecipe).toHaveBeenCalledTimes(1)
    expect(saveMigratedRecipe).toHaveBeenCalledWith({
        id: 'good',
        username: 'alice',
        typeVersion: 2,
        contents: JSON.stringify({y: 2, migrated: true})
    })
})
