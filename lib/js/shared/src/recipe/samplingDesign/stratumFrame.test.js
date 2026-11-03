import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {strataFreshness, stratumFrameQuestion} from './stratumFrame.js'

// Whether a design's saved areas are still about their inputs, judged from the evidence saved with them and the stratum
// frame's evidence as it reads now. States and codes are literals.

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

describe('the frame a design configures', () => {
    it('is read in the CRS probabilities have always been calculated in where the design states none', () => {
        const design = {...unstratified(), stratification: {skip: true}}

        assert.equal(stratumFrameQuestion(design).crs, 'EPSG:6933')
    })

    it('is read in the Stratification CRS the design states', () => {
        const design = {...stratified(), stratification: {...stratified().stratification, crs: 'EPSG:3857'}}

        assert.equal(stratumFrameQuestion(design).crs, 'EPSG:3857')
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
