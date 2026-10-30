import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {proportionsFrameFreshness, strataFreshness, stratumFrameQuestion} from './stratumFrame.js'

// Whether a design's saved areas and automatic proportions are still about their inputs, judged from the evidence
// saved with them and the stratum frame's evidence as it reads now. States and codes are literals.

describe('saved stratum areas', () => {
    it('are current while the frame reads at the same digest, whatever revisions it was read at', () => {
        const design = stratified()
        const saved = withAreas(design, frame(design, {digest: 'a', revision: 7}))

        assert.equal(strataFreshness(saved, frame(design, {digest: 'a', revision: 8})), 'CURRENT')
    })

    it('are stale once the frame reads at another digest', () => {
        const design = stratified()
        const saved = withAreas(design, frame(design, {digest: 'a'}))

        assert.equal(strataFreshness(saved, frame(design, {digest: 'b'})), 'STALE')
    })

    it('are stale for another selected band, without current evidence, though the totals are those saved', () => {
        const design = stratified()
        const saved = withAreas(design, frame(design, {digest: 'a'}))
        const otherBand = {...saved, stratification: {...saved.stratification, band: 'other'}}

        assert.equal(strataFreshness(otherBand, null), 'STALE')
    })

    it('are stale for another Scale', () => {
        const design = stratified()
        const saved = withAreas(design, frame(design, {digest: 'a'}))

        assert.equal(strataFreshness({...saved, stratification: {...saved.stratification, scale: 20}}, frame(design, {digest: 'a'})), 'STALE')
    })

    it('are unknown without evidence', () => {
        const design = stratified()

        assert.equal(strataFreshness(design, frame(design, {digest: 'a'})), 'UNKNOWN')
    })

    it('are unversioned when the frame reads a source without a token, however often recalculated', () => {
        const design = stratified()
        const unversioned = frame(design, {digest: 'a', unversioned: ['gs://bucket/strata.tif']})

        assert.equal(strataFreshness(withAreas(design, unversioned), unversioned), 'UNVERSIONED')
        assert.equal(strataFreshness(design, unversioned), 'UNVERSIONED')
    })

    it('are not established while the frame is still to be read', () => {
        const design = stratified()

        assert.equal(strataFreshness(withAreas(design, frame(design, {digest: 'a'})), null), null)
    })

    it('are not judged where stratification is skipped', () => {
        assert.equal(strataFreshness(unstratified(), null), 'CURRENT')
    })
})

describe('saved automatic proportions', () => {
    it('are current when their frame matches the current one, calculated at a newer revision than the areas', () => {
        const design = stratified()
        const saved = withProportions(withAreas(design, frame(design, {digest: 'a', revision: 7})), frame(design, {digest: 'a', revision: 8}))

        assert.equal(proportionsFrameFreshness(saved, frame(design, {digest: 'a', revision: 8})), 'CURRENT')
        assert.equal(strataFreshness(saved, frame(design, {digest: 'a', revision: 8})), 'CURRENT')
    })

    it('are stale once the frame groups other pixels, whatever the areas and weights still say', () => {
        const design = stratified()
        const saved = withProportions(withAreas(design, frame(design, {digest: 'a'})), frame(design, {digest: 'a'}))

        assert.equal(proportionsFrameFreshness(saved, frame(design, {digest: 'b'})), 'STALE')
    })

    it('are unknown without frame evidence', () => {
        const design = stratified()
        const legacy = {...design, proportions: {anticipatedProportions: [{stratum: 1, proportion: 0.5}]}}

        assert.equal(proportionsFrameFreshness(legacy, frame(design, {digest: 'a'})), 'UNKNOWN')
    })

    it('of an unstratified design are judged by its AOI and CRS alone, with no areas', () => {
        const design = unstratified()
        const saved = withProportions(design, frame(design, {digest: 'aoi'}))

        assert.equal(proportionsFrameFreshness(saved, frame(design, {digest: 'aoi'})), 'CURRENT')
        assert.equal(proportionsFrameFreshness(saved, frame(design, {digest: 'other aoi'})), 'STALE')
    })

    it('are not judged when entered by hand', () => {
        const design = stratified()
        const manual = {...design, proportions: {manual: [true], anticipatedProportions: [{stratum: 1, proportion: 0.5}]}}

        assert.equal(proportionsFrameFreshness(manual, frame(design, {digest: 'b'})), 'CURRENT')
    })
})

const stratified = () => ({
    aoi: {type: 'POLYGON', path: [[0, 0], [0, 1], [1, 1], [0, 0]]},
    stratification: {type: 'RECIPE', recipeId: 'classification-1', band: 'class', crs: 'EPSG:6933', scale: 30}
})

const unstratified = () => ({
    aoi: {type: 'RECIPE', id: 'aoi-recipe'},
    stratification: {skip: true, crs: 'EPSG:6933'}
})

// Frame evidence as an operation returns it for this design's frame.
const frame = (model, {digest, revision = 1, unversioned = []}) => ({
    dependency: 'SAMPLING_STRATUM_FRAME',
    contractVersion: 1,
    question: stratumFrameQuestion(model),
    digest,
    provenance: {recipes: [{id: 'classification-1', revision}], assets: []},
    unversioned
})

const withAreas = (model, evidence) => ({
    ...model,
    stratification: {
        ...model.stratification,
        strata: [{value: 1, area: 100, weight: 1}],
        strataCalculatedFrom: {
            resource: {id: 'SAMPLING_STRATUM_AREAS', contractVersion: 1},
            question: {scale: Number(model.stratification.scale)},
            dependencies: {SAMPLING_STRATUM_FRAME: evidence}
        }
    }
})

const withProportions = (model, evidence) => ({
    ...model,
    proportions: {anticipatedProportions: [{stratum: 1, proportion: 0.5}], stratumFrameEvidence: evidence}
})
