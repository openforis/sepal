import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {stratumFrameQuestion} from './stratumFrame.js'
import {
    admittedProportionsFrameFreshness,
    probabilitySourceQuestion,
    proportionsFreshness,
    stratumProbabilitiesQuestion
} from './stratumProbabilities.js'

// Whether a design's automatic proportions are still about what they were calculated from - the stratum frame and the
// probability source - judged from the evidence saved with them and both dependencies' evidence as they read now.
// States and codes are literals.

describe('saved automatic proportions', () => {
    it('are current while both dependencies read at the same digests, whatever revisions they were read at', () => {
        const design = stratified()
        const saved = withProportions(design, calculatedFrom(design, {frame: frame(design, {digest: 'f', revision: 7})}))

        assert.equal(proportionsFreshness(saved, current(design, {frame: frame(design, {digest: 'f', revision: 8})})), 'CURRENT')
    })

    it('are stale once the probability source reads at another digest, though the frame is unchanged', () => {
        const design = stratified()
        const saved = withProportions(design, calculatedFrom(design))

        assert.equal(proportionsFreshness(saved, current(design, {probability: source(design, {digest: 'changed'})})), 'STALE')
    })

    it('are stale once the frame reads at another digest', () => {
        const design = stratified()
        const saved = withProportions(design, calculatedFrom(design))

        assert.equal(proportionsFreshness(saved, current(design, {frame: frame(design, {digest: 'changed'})})), 'STALE')
    })

    it('are stale for another mode, target class or Scale', () => {
        const design = stratified()
        const saved = withProportions(design, calculatedFrom(design))
        const edited = proportions => ({...saved, proportions: {...saved.proportions, ...proportions}})

        assert.equal(proportionsFreshness(edited({anticipationStrategy: 'CATEGORICAL', targetClass: '2'}), current(design)), 'STALE')
        assert.equal(proportionsFreshness(edited({scale: 60}), current(design)), 'STALE')
    })

    it('are current through what is applied to the answer, and the mode it was asked in', () => {
        const design = stratified()
        const saved = withProportions(design, calculatedFrom(design))
        const presented = {
            ...saved,
            proportions: {...saved.proportions, percentage: true, anticipatedOverallProportion: 0.3, eeStrategy: 'BATCH'},
            stratification: {...saved.stratification, strata: [{value: 1, area: 50, weight: 0.5}]}
        }

        assert.equal(proportionsFreshness(presented, current(design)), 'CURRENT')
    })

    it('are unversioned once the probability source reads without a token, however often recalculated', () => {
        const design = stratified()
        const unversioned = source(design, {digest: 'p', unversioned: ['gs://bucket/probability.tif']})

        assert.equal(proportionsFreshness(withProportions(design, calculatedFrom(design, {probability: unversioned})), current(design, {probability: unversioned})), 'UNVERSIONED')
    })

    it('are not established while the probability source is still to be read', () => {
        const design = stratified()
        const saved = withProportions(design, calculatedFrom(design))

        assert.equal(proportionsFreshness(saved, {SAMPLING_STRATUM_FRAME: frame(design)}), null)
    })

    it('of an unstratified design are judged by its AOI, CRS and probability source, with no areas', () => {
        const design = unstratified()
        const saved = withProportions(design, calculatedFrom(design))

        assert.equal(proportionsFreshness(saved, current(design)), 'CURRENT')
        assert.equal(proportionsFreshness(saved, current(design, {frame: frame(design, {digest: 'other aoi'})})), 'STALE')
    })

    it('are not judged when entered by hand or skipped, and read no probability source', () => {
        const design = stratified()
        const manual = {...withProportions(design, null), proportions: {...withProportions(design, null).proportions, manual: [true]}}
        const skipped = {...design, proportions: {skip: true}}

        assert.equal(proportionsFreshness(manual, {}), 'CURRENT')
        assert.equal(proportionsFreshness(skipped, {}), 'CURRENT')
        assert.equal(probabilitySourceQuestion(manual), null)
        assert.equal(probabilitySourceQuestion(skipped), null)
    })

    // Skip is saved as a boolean or as the form's toggle.
    it('are judged with an empty skip toggle as not skipped, and not judged with a set one', () => {
        const design = stratified()
        const withSkip = skip => {
            const saved = withProportions(design, calculatedFrom(design))
            return {...saved, proportions: {...saved.proportions, skip}}
        }
        const changed = current(design, {probability: source(design, {digest: 'changed'})})

        assert.equal(proportionsFreshness(withSkip([]), changed), 'STALE')
        assert.notEqual(probabilitySourceQuestion(withSkip([])), null)
        assert.equal(proportionsFreshness(withSkip([true]), changed), 'CURRENT')
        assert.equal(probabilitySourceQuestion(withSkip([true])), null)
    })
})

describe('proportions saved by a client of the previous release', () => {
    it('are unknown with frame evidence alone', () => {
        const design = stratified()
        const legacy = {...design, proportions: {...automatic(), stratumFrameEvidence: frame(design)}}

        assert.equal(proportionsFreshness(legacy, current(design)), 'UNKNOWN')
    })

    it('are unknown beside full evidence a newer client recorded for other values, once the sources read as it says', () => {
        const design = stratified()
        const recordedForA = calculatedFrom(design)
        const valuesOfB = {...withProportions(design, recordedForA).proportions, stratumFrameEvidence: frame(design, {digest: 'f'})}

        assert.equal(proportionsFreshness({...design, proportions: valuesOfB}, current(design)), 'UNKNOWN')
    })

    it('are unknown where that client saved no frame evidence, as it saved null', () => {
        const design = stratified()
        const saved = {...withProportions(design, calculatedFrom(design)).proportions, stratumFrameEvidence: null}

        assert.equal(proportionsFreshness({...design, proportions: saved}, current(design)), 'UNKNOWN')
    })

    it('are still unversioned over a source without a token', () => {
        const design = stratified()
        const legacy = {...design, proportions: {...automatic(), stratumFrameEvidence: frame(design)}}
        const unversioned = source(design, {digest: 'p', unversioned: ['gs://bucket/probability.tif']})

        assert.equal(proportionsFreshness(legacy, current(design, {probability: unversioned})), 'UNVERSIONED')
    })
})

describe('the proportions a task was admitted with, at a later stage', () => {
    it('are judged by the frame they recorded, whatever the probability source reads now', () => {
        const design = stratified()
        const saved = withProportions(design, calculatedFrom(design))

        assert.equal(admittedProportionsFrameFreshness(saved, frame(design)), 'CURRENT')
        assert.equal(admittedProportionsFrameFreshness(saved, frame(design, {digest: 'changed'})), 'STALE')
    })

    it('are judged by the frame evidence a task admitted before full evidence was recorded carries', () => {
        const design = stratified()
        const legacy = {...design, proportions: {...automatic(), stratumFrameEvidence: frame(design)}}

        assert.equal(admittedProportionsFrameFreshness(legacy, frame(design)), 'CURRENT')
        assert.equal(admittedProportionsFrameFreshness(legacy, frame(design, {digest: 'changed'})), 'STALE')
    })
})

const stratified = () => ({
    aoi: {type: 'POLYGON', path: [[0, 0], [0, 1], [1, 1], [0, 0]]},
    stratification: {type: 'RECIPE', recipeId: 'classification-1', band: 'class', crs: 'EPSG:6933', scale: 30, strata: [{value: 1, area: 100, weight: 1}]}
})

const unstratified = () => ({
    aoi: {type: 'RECIPE', id: 'aoi-recipe'},
    stratification: {skip: true, crs: 'EPSG:6933'}
})

const automatic = () => ({
    anticipationStrategy: 'PROBABILITY',
    type: 'RECIPE',
    recipeId: 'probability-1',
    band: 'probability',
    scale: 30,
    anticipatedProportions: [{stratum: 1, proportion: 0.5}]
})

const withProportions = (model, evidence) => ({
    ...model,
    proportions: {...automatic(), ...evidence && {probabilityPerStratumCalculatedFrom: evidence}}
})

// Evidence as an operation returns it for this design's frame and probability source.
const frame = (model, {digest = 'f', revision = 1, unversioned = []} = {}) => ({
    dependency: 'SAMPLING_STRATUM_FRAME',
    contractVersion: 1,
    question: stratumFrameQuestion(model),
    digest,
    provenance: {recipes: [{id: 'classification-1', revision}], assets: []},
    unversioned
})

const source = (model, {digest = 'p', unversioned = []} = {}) => ({
    dependency: 'SAMPLING_PROBABILITY_SOURCE',
    contractVersion: 1,
    question: probabilitySourceQuestion({...model, proportions: automatic()}),
    digest,
    provenance: {recipes: [{id: 'probability-1', revision: 1}], assets: []},
    unversioned
})

const calculatedFrom = (model, {frame: frameEvidence = frame(model), probability = source(model)} = {}) => ({
    resource: {id: 'SAMPLING_STRATUM_PROBABILITIES', contractVersion: 1},
    question: stratumProbabilitiesQuestion({...model, proportions: automatic()}),
    dependencies: {SAMPLING_STRATUM_FRAME: frameEvidence, SAMPLING_PROBABILITY_SOURCE: probability}
})

const current = (model, {frame: frameEvidence = frame(model), probability = source(model)} = {}) => ({
    SAMPLING_STRATUM_FRAME: frameEvidence,
    SAMPLING_PROBABILITY_SOURCE: probability
})
