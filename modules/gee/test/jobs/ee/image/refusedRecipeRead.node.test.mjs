import assert from 'node:assert/strict'
import {beforeEach, describe, it, mock} from 'node:test'

import {firstValueFrom, of, throwError} from 'rxjs'

// What execution does with a recipe read the reader refuses, through the REAL imageFactory, recipeRef and
// masking. Who may read which recipe is Recipe's policy and is covered where that policy runs; here a
// refusal is simply what the reader answers with, and what matters is that the operation stops on it rather
// than resolving to something else.
//
// Run by Node's own test runner rather than Jest, because imageFactory loads every implementation through
// createRequire. Real Node supports require(esm); Jest's CJS resolver refuses it with ERR_REQUIRE_ESM.
// Launched from a Jest bridge so it runs in the ordinary gee gate.

let catalogue = {}
let recipesRead = []

// A refusal the reader can be recognised by. Asserting on a bare 404 would also be satisfied by any other
// not-found the operation produced on its own, which would say nothing about what reached the caller.
class RecipeReadRefused extends Error {
    constructor(id) {
        super(`No such recipe: ${id}`)
        this.name = 'RecipeReadRefused'
        this.refusedRecipe = id
        this.statusCode = 404
    }
}

const eeImage = id => ({id, select: () => eeImage(id), updateMask: () => eeImage(id)})

mock.module('#sepal/ee/ee', {
    exports: {
        default: {
            Image: image => (image && typeof image === 'object' ? image : eeImage(image)),
            ImageCollection: id => eeImage(id),
            getAsset$: () => of({type: 'Image', properties: {}}),
            getInfo$: value => of(value)
        }
    }
})

const {configureRecipeReader} = await import('#sepal/ee/recipe')

configureRecipeReader(id => {
    recipesRead.push(id)
    return catalogue[id]
        ? of(catalogue[id])
        : throwError(() => new RecipeReadRefused(id))
})

const {default: imageFactory} = await import('#sepal/ee/imageFactory')

// A Masking recipe over another recipe: resolving it requires reading both.
const masking = (id, innerId) => ({
    id, type: 'MASKING',
    model: {imageToMask: {type: 'RECIPE_REF', id: innerId}, imageMask: {type: 'ASSET', id: 'users/x/mask'}}
})

// Whatever the inner reference turns out to be is beside the point; it only has to resolve.
const overAnAsset = id => ({
    id, type: 'MASKING',
    model: {imageToMask: {type: 'ASSET', id: `users/x/${id}`}, imageMask: {type: 'ASSET', id: 'users/x/mask'}}
})

// Resolving the image is what reads the references; the outer record alone never reaches the inner.
const image$ = id => firstValueFrom(imageFactory({type: 'RECIPE_REF', id}).getImage$())

beforeEach(() => {
    catalogue = {}
    recipesRead = []
})

describe('a reference reached through another reference', () => {
    it('is resolved by reading the outer one and then it', async () => {
        catalogue = {outer: masking('outer', 'inner'), inner: overAnAsset('inner')}

        await image$('outer')

        assert.deepEqual(recipesRead, ['outer', 'inner'])
    })
})

describe('a recipe read the reader refuses', () => {
    it('stops the operation with the refusal the reader gave, naming the recipe it refused', async () => {
        catalogue = {outer: masking('outer', 'inner')}

        await assert.rejects(image$('outer'), refusalOf('inner'))
        assert.deepEqual(recipesRead, ['outer', 'inner'])
    })

    it('resolves nothing further when it is the outer reference', async () => {
        catalogue = {inner: overAnAsset('inner')}

        await assert.rejects(image$('outer'), refusalOf('outer'))
        assert.deepEqual(recipesRead, ['outer'])
    })

    // The refusal the reader produced, not merely something answering 404.
    const refusalOf = id => error =>
        error instanceof RecipeReadRefused && error.refusedRecipe === id && error.statusCode === 404
})
