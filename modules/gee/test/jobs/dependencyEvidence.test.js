import assert from 'node:assert/strict'
import {beforeEach, describe, it, mock} from 'node:test'

import {defer, lastValueFrom, of} from 'rxjs'

// What a dependency reads now, as the calculating operations, the task's stages and the GUI's acquisition take it:
// recipes read through the request's RecipeScope, assets by their metadata tokens. The recipe service and Earth
// Engine's asset metadata are substituted; the closure, projection and digest are production's.

const assets = {}
// Run once, after the first metadata read: what changes between two reads of the same request.
let readsObserved = null

mock.module('#gee/jobs/ee/asset/versions', {
    exports: {
        assetVersions$: ids => defer(() => {
            const answers = ids.map(id => assets[id] ? {id, ...assets[id]} : {id, failure: {kind: 'DEFINITIVE', code: 'NOT_FOUND'}})
            const afterRead = readsObserved
            readsObserved = null
            afterRead?.()
            return of(answers)
        })
    }
})

const {RecipeScope, inRecipeScope} = await import('#sepal/ee/recipeScope')
const {dependencyEvidence$, withDependencyEvidence$} = await import('#gee/jobs/dependencyEvidence')
const {stratumFrameQuestion} = await import('#sepal/recipe/samplingDesign/stratumFrame')
const {probabilitySourceQuestion} = await import('#sepal/recipe/samplingDesign/stratumProbabilities')

const FRAME = 'SAMPLING_STRATUM_FRAME'
const PROBABILITY = 'SAMPLING_PROBABILITY_SOURCE'

let records

beforeEach(() => {
    Object.keys(assets).forEach(id => delete assets[id])
    records = {}
    readsObserved = null
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

describe('the probability source as a request reads it', () => {
    it('keeps its meaning across a revision that changes only a title, while recording the revisions read', async () => {
        storeProbability({revision: 1, inputId: 'mosaic-1'})
        records['mosaic-1'] = {id: 'mosaic-1', type: 'MOSAIC', revision: 1, model: {compositeOptions: {compose: 'MEDIAN'}}}
        const before = await probabilityOf(recipeProbability())
        storeProbability({revision: 2, title: 'Renamed', inputId: 'mosaic-1'})

        const after = await probabilityOf(recipeProbability())

        assert.equal(after.digest, before.digest)
        assert.deepEqual(after.provenance.recipes, [{id: 'mosaic-1', revision: 1}, {id: 'probability-1', revision: 2}])
    })

    it('changes meaning when a recipe the probability recipe reads changes', async () => {
        storeProbability({inputId: 'mosaic-1'})
        records['mosaic-1'] = {id: 'mosaic-1', type: 'MOSAIC', revision: 1, model: {compositeOptions: {compose: 'MEDIAN'}}}
        const before = await probabilityOf(recipeProbability())
        records['mosaic-1'] = {...records['mosaic-1'], revision: 2, model: {compositeOptions: {compose: 'MEDOID'}}}

        assert.notEqual((await probabilityOf(recipeProbability())).digest, before.digest)
    })

    it('changes meaning for any edit of a recipe whose type projects no narrower meaning of its product', async () => {
        storeProbability()
        const before = await probabilityOf(recipeProbability())
        records['probability-1'] = {...records['probability-1'], revision: 2, model: {...records['probability-1'].model, unrelated: true}}

        assert.notEqual((await probabilityOf(recipeProbability())).digest, before.digest)
    })

    it('changes meaning when the probability asset is replaced at the same id', async () => {
        assets['users/alice/probability'] = {type: 'IMAGE', version: 't1'}
        const before = await probabilityOf(assetProbability())
        assets['users/alice/probability'] = {type: 'IMAGE', version: 't2'}

        const after = await probabilityOf(assetProbability())

        assert.notEqual(after.digest, before.digest)
        assert.deepEqual(after.provenance.assets, [{id: 'users/alice/probability', version: 't2'}])
    })

    it('names a probability source read without a token as unversioned', async () => {
        assets['gs://bucket/probability.tif'] = {type: 'IMAGE', version: null, unversioned: true}

        const evidence = await probabilityOf({type: 'ASSET', assetId: 'gs://bucket/probability.tif', band: 'probability'})

        assert.deepEqual(evidence.unversioned, ['gs://bucket/probability.tif'])
    })

    it('is not part of the stratum frame', async () => {
        assets['users/alice/strata'] = {type: 'IMAGE', version: 't1'}
        assets['users/alice/probability'] = {type: 'IMAGE', version: 't1'}
        const design = {...designOver(assetStratification()), proportions: assetProbability()}
        const before = await frameOf(design)
        assets['users/alice/probability'] = {type: 'IMAGE', version: 't2'}

        assert.equal((await frameOf(design)).digest, before.digest)
    })
})

describe('a calculation answered with its evidence', () => {
    it('carries the evidence it was calculated from', async () => {
        assets['users/alice/strata'] = {type: 'IMAGE', version: 't1'}

        const {result, evidence} = await calculated(() => of('areas'))

        assert.equal(result, 'areas')
        assert.deepEqual(evidence[FRAME].provenance.assets, [{id: 'users/alice/strata', version: 't1'}])
    })

    it('carries the evidence of every dependency it read', async () => {
        assets['users/alice/strata'] = {type: 'IMAGE', version: 't1'}
        assets['users/alice/probability'] = {type: 'IMAGE', version: 't1'}

        const {evidence} = await calculatedOverBoth(() => of('probabilities'))

        assert.deepEqual(evidence[FRAME].provenance.assets, [{id: 'users/alice/strata', version: 't1'}])
        assert.deepEqual(evidence[PROBABILITY].provenance.assets, [{id: 'users/alice/probability', version: 't1'}])
    })

    it('is refused when an asset only the probability source reads is replaced before it answers', async () => {
        assets['users/alice/strata'] = {type: 'IMAGE', version: 't1'}
        assets['users/alice/probability'] = {type: 'IMAGE', version: 't1'}

        await assert.rejects(
            calculatedOverBoth(() => defer(() => {
                assets['users/alice/probability'] = {type: 'IMAGE', version: 't2'}
                return of('probabilities')
            })),
            error => error.errorCode === 'CALCULATION_INPUTS_CHANGED'
        )
    })

    it('is refused when an asset both dependencies read is replaced between their reads, though it is not replaced again', async () => {
        assets['users/alice/shared'] = {type: 'IMAGE', version: 't1'}
        const replacedAfterFirstRead = () => {
            assets['users/alice/shared'] = {type: 'IMAGE', version: 't2'}
        }

        await assert.rejects(
            calculatedOverShared(replacedAfterFirstRead, () => of('probabilities')),
            error => error.errorCode === 'CALCULATION_INPUTS_CHANGED'
        )
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

const recipeProbability = () => ({type: 'RECIPE', recipeId: 'probability-1', band: 'probability'})

const assetProbability = () => ({type: 'ASSET', assetId: 'users/alice/probability', band: 'probability'})

const storeProbability = ({revision = 1, title = 'Probability', inputId} = {}) => {
    records['probability-1'] = {
        id: 'probability-1', type: 'CLASSIFICATION', revision, title,
        model: {
            inputImagery: {images: inputId ? [{imageId: 'i-1', type: 'RECIPE_REF', id: inputId}] : []},
            legend: {entries: [{value: 1}, {value: 2}]}
        }
    }
}

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

const probabilityOf = proportions =>
    lastValueFrom(inScope(dependencyEvidence$(PROBABILITY, probabilitySourceQuestion({...designOver(assetStratification()), proportions}))))

const calculated = calculate$ => lastValueFrom(inScope(withDependencyEvidence$({
    dependencies: {[FRAME]: stratumFrameQuestion(designOver(assetStratification()))},
    calculate$
})))

const calculatedOverBoth = calculate$ => {
    const design = {...designOver(assetStratification()), proportions: assetProbability()}
    return lastValueFrom(inScope(withDependencyEvidence$({
        dependencies: {[FRAME]: stratumFrameQuestion(design), [PROBABILITY]: probabilitySourceQuestion(design)},
        calculate$
    })))
}

// One asset as both the stratification and the probability source, its metadata answered to each read in turn.
const calculatedOverShared = (afterFirstRead, calculate$) => {
    const shared = {type: 'ASSET', assetId: 'users/alice/shared', band: 'class', crs: 'EPSG:6933'}
    const design = {...designOver(shared), proportions: {...shared, band: 'probability'}}
    readsObserved = afterFirstRead
    return lastValueFrom(inScope(withDependencyEvidence$({
        dependencies: {[FRAME]: stratumFrameQuestion(design), [PROBABILITY]: probabilitySourceQuestion(design)},
        calculate$
    })))
}
