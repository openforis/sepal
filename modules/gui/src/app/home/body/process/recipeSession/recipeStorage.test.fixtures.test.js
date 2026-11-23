import {firstValueFrom} from 'rxjs'
import {describe, expect, it} from 'vitest'

import {gzip$} from '~/gzip'

import {recipeStorage} from './recipeStorage.test.fixtures'

// The storage fake answers saves and reads as the recipe module does (modules/recipe/src/routes.js,
// recipeRepository.js), over content compressed as the GUI compresses it (~/gzip).

const ID = 'recipe-1'
const RECIPE = {id: ID, type: 'MOSAIC', title: 'Mosaic', model: {bands: ['red', 'nir']}}

describe('a save', () => {
    it('creates a recipe at revision 1, which a read answers with what was saved and where it was placed', async () => {
        const storage = recipeStorage()

        const saved = await save(storage, {recipe: RECIPE, projectId: 'project-1'})

        expect(saved).toEqual({revision: 1})
        expect(await read(storage, ID)).toEqual({...RECIPE, projectId: 'project-1', revision: 1})
    })

    it('updates a recipe at the revision stored to the next, keeping where it was placed', async () => {
        const storage = recipeStorage({records: [{...RECIPE, projectId: 'project-1', revision: 2}]})
        const edited = {...RECIPE, model: {bands: ['swir1']}}

        const saved = await save(storage, {recipe: edited, projectId: 'project-2', expectedRevision: 2})

        expect(saved).toEqual({revision: 3})
        expect(await read(storage, ID)).toEqual({...edited, projectId: 'project-1', revision: 3})
    })

    it('is refused at another revision as a conflict naming the revision stored, which it leaves as it was', async () => {
        const storage = recipeStorage({records: [{...RECIPE, revision: 2}]})

        const refusal = save(storage, {recipe: {...RECIPE, model: {bands: ['swir1']}}, expectedRevision: 1})

        await expect(refusal).rejects.toMatchObject({status: 412, response: {code: 'RECIPE_REVISION_CONFLICT', currentRevision: 2}})
        expect(await read(storage, ID)).toEqual({...RECIPE, projectId: null, revision: 2})
    })

    it('is refused as a conflict creating a recipe already stored', async () => {
        const storage = recipeStorage({records: [{...RECIPE, revision: 1}]})

        const refusal = save(storage, {recipe: {...RECIPE, model: {bands: ['swir1']}}})

        await expect(refusal).rejects.toMatchObject({status: 412, response: {code: 'RECIPE_REVISION_CONFLICT', currentRevision: 1}})
        expect(await read(storage, ID)).toEqual({...RECIPE, projectId: null, revision: 1})
    })

    it('is refused for a recipe of another type, and one not stored is not found, as a read of it is', async () => {
        const storage = recipeStorage({records: [{...RECIPE, revision: 1}]})

        await expect(save(storage, {recipe: {...RECIPE, type: 'RADAR_MOSAIC'}, expectedRevision: 1}))
            .rejects.toMatchObject({status: 409, response: {code: 'RECIPE_TYPE_MISMATCH'}})
        await expect(save(storage, {recipe: {...RECIPE, id: 'recipe-2'}, expectedRevision: 1})).rejects.toMatchObject({status: 404})
        await expect(read(storage, 'recipe-2')).rejects.toMatchObject({status: 404})
        expect(await read(storage, ID)).toEqual({...RECIPE, projectId: null, revision: 1})
    })
})

it('reads back what was sent uncompressed as JSON carries it, where a test passes content through', async () => {
    const storage = recipeStorage()

    await firstValueFrom(storage.save$({id: ID, type: RECIPE.type, gzippedContents: {...RECIPE, unset: undefined}}))

    expect(await read(storage, ID)).toEqual({...RECIPE, projectId: null, revision: 1})
})

// As the GUI saves (recipeSession.js): the recipe compressed, named after its title, placed in its project.
const save = async (storage, {recipe, projectId, expectedRevision}) =>
    firstValueFrom(storage.save$({
        id: recipe.id,
        projectId,
        type: recipe.type,
        name: recipe.title,
        gzippedContents: await firstValueFrom(gzip$(recipe)),
        expectedRevision
    }))

const read = (storage, id) =>
    firstValueFrom(storage.load$(id))
