import assert from 'node:assert/strict'
import {beforeEach, describe, it, mock} from 'node:test'

import {defer, lastValueFrom, of} from 'rxjs'

// What a dependency reads now, as the calculating operations, the task's stages and the GUI's acquisition take it:
// recipes read through the request's RecipeScope, assets by their metadata tokens. The recipe service and Earth
// Engine's asset metadata are substituted; the closure, projection and digest are production's.

const assets = {}

mock.module('#gee/jobs/ee/asset/versions', {
    exports: {
        assetVersions$: ids => defer(() => of(ids.map(id => assets[id] ? {id, ...assets[id]} : {id, failure: {kind: 'DEFINITIVE', code: 'NOT_FOUND'}})))
    }
})

const {RecipeScope, inRecipeScope} = await import('#sepal/ee/recipeScope')
const {dependencyEvidence$, withDependencyEvidence$} = await import('#gee/jobs/dependencyEvidence')
const {stratumFrameQuestion} = await import('#sepal/recipe/samplingDesign/stratumFrame')

const FRAME = 'SAMPLING_STRATUM_FRAME'

let records

beforeEach(() => {
    Object.keys(assets).forEach(id => delete assets[id])
    records = {}
})

describe('the stratum frame as a request reads it', () => {
    it('keeps its meaning across a revision that changes only a title, while recording the revision read', async () => {
        storeClassification({revision: 7})
        const before = await frameOf(designOver(recipeStratification()))
        storeClassification({revision: 8, title: 'Renamed'})

        const after = await frameOf(designOver(recipeStratification()))

        assert.equal(after.digest, before.digest)
        assert.deepEqual(after.provenance.recipes, [{id: 'classification-1', revision: 8}])
    })

    it('changes meaning when a recipe the stratification reads changes', async () => {
        storeClassification({inputId: 'mosaic-1'})
        records['mosaic-1'] = {id: 'mosaic-1', type: 'MOSAIC', revision: 1, model: {compositeOptions: {compose: 'MEDIAN'}}}
        const before = await frameOf(designOver(recipeStratification()))
        records['mosaic-1'] = {...records['mosaic-1'], revision: 2, model: {compositeOptions: {compose: 'MEDOID'}}}

        const after = await frameOf(designOver(recipeStratification()))

        assert.notEqual(after.digest, before.digest)
        assert.deepEqual(after.provenance.recipes.map(({id}) => id), ['classification-1', 'mosaic-1'])
    })

    it('changes meaning when the recipe an AOI references changes, though the AOI selection is the same', async () => {
        assets['users/alice/strata'] = {type: 'IMAGE', version: 't1'}
        records['aoi-recipe'] = {id: 'aoi-recipe', type: 'MOSAIC', revision: 1, model: {aoi: {type: 'POLYGON', path: [[0, 0], [0, 1], [1, 1]]}}}
        const design = {aoi: {type: 'RECIPE', id: 'aoi-recipe'}, stratification: assetStratification()}
        const before = await frameOf(design)
        records['aoi-recipe'] = {...records['aoi-recipe'], revision: 2, model: {aoi: {type: 'POLYGON', path: [[0, 0], [0, 2], [2, 2]]}}}

        assert.notEqual((await frameOf(design)).digest, before.digest)
    })

    it('changes meaning when an asset is replaced at the same id', async () => {
        assets['users/alice/strata'] = {type: 'IMAGE', version: 't1'}
        const before = await frameOf(designOver(assetStratification()))
        assets['users/alice/strata'] = {type: 'IMAGE', version: 't2'}

        const after = await frameOf(designOver(assetStratification()))

        assert.notEqual(after.digest, before.digest)
        assert.deepEqual(after.provenance.assets, [{id: 'users/alice/strata', version: 't2'}])
    })

    it('names an asset read without a token as unversioned', async () => {
        assets['users/alice/strata'] = {type: 'IMAGE', version: null, unversioned: true}

        const evidence = await frameOf(designOver(assetStratification()))

        assert.deepEqual(evidence.unversioned, ['users/alice/strata'])
    })

    it('is answered for the question asked', async () => {
        assets['users/alice/strata'] = {type: 'IMAGE', version: 't1'}
        const design = designOver(assetStratification())

        const evidence = await frameOf(design)

        assert.deepEqual(evidence.question, stratumFrameQuestion(design))
        assert.equal(evidence.dependency, FRAME)
    })
})

describe('a calculation answered with its evidence', () => {
    it('carries the evidence it was calculated from', async () => {
        assets['users/alice/strata'] = {type: 'IMAGE', version: 't1'}

        const {result, evidence} = await calculated(() => of('areas'))

        assert.equal(result, 'areas')
        assert.deepEqual(evidence.provenance.assets, [{id: 'users/alice/strata', version: 't1'}])
    })

    it('is refused when an asset it read is replaced before it answers', async () => {
        assets['users/alice/strata'] = {type: 'IMAGE', version: 't1'}

        await assert.rejects(
            calculated(() => defer(() => {
                assets['users/alice/strata'] = {type: 'IMAGE', version: 't2'}
                return of('areas')
            })),
            error => error.errorCode === 'CALCULATION_INPUTS_CHANGED'
        )
    })
})

const designOver = stratification => ({aoi: {type: 'POLYGON', path: [[0, 0], [0, 1], [1, 1]]}, stratification})

const recipeStratification = () => ({type: 'RECIPE', recipeId: 'classification-1', band: 'class', crs: 'EPSG:6933'})

const assetStratification = () => ({type: 'ASSET', assetId: 'users/alice/strata', band: 'class', crs: 'EPSG:6933'})

const storeClassification = ({revision = 1, title = 'Classes', inputId} = {}) => {
    records['classification-1'] = {
        id: 'classification-1', type: 'CLASSIFICATION', revision, title,
        model: {
            inputImagery: {images: inputId ? [{imageId: 'i-1', type: 'RECIPE_REF', id: inputId}] : []},
            legend: {entries: [{value: 1}, {value: 2}]}
        }
    }
}

const inScope = observable$ => inRecipeScope(new RecipeScope(id => of(records[id])), observable$)

const frameOf = design => lastValueFrom(inScope(dependencyEvidence$(FRAME, stratumFrameQuestion(design))))

const calculated = calculate$ => lastValueFrom(inScope(withDependencyEvidence$({
    dependency: FRAME,
    question: stratumFrameQuestion(designOver(assetStratification())),
    calculate$
})))
