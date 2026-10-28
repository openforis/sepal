import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {assetProcessing, effectiveSettings, processingOfProducer, seedMonitoring} from '../../../src/recipe/bayts/processing.js'
import {BAYTS_ALERTS_PROCESSING} from '../../../src/recipe/requirement/baytsAlertsProcessing.js'

// What BAYTS Alerts monitors with: the history's geometric correction and spatial speckle filtering, its own passes,
// masks and angles, and what monitoring forces.

describe('the processing BAYTS Alerts monitors with', () => {
    it('is a historical recipe\'s, what its options leave out as it executes them, never the alerts\' copy', () => {
        const saved = structuredClone(ALERTS)

        const {model, fields} = effectiveSettings(ALERTS, processingOfProducer({options: {geometricCorrection: 'TERRAIN'}}))

        assert.deepEqual(model.options, {...ALERTS.options, ...HISTORY_EXECUTES, geometricCorrection: 'TERRAIN', ...FORCED})
        assert.equal(fields.spatialSpeckleFilter.state, 'REFERENCE')
        assert.deepEqual(ALERTS, saved)
    })

    it('is what an asset exported from a BAYTS Historical records, complete, beside the alerts\' own choices', () => {
        const {model, fields} = effectiveSettings(ALERTS, assetProcessing({
            recipe_type: 'BAYTS_HISTORICAL',
            recipe_options: JSON.stringify({spatialSpeckleFilter: 'REFINED_LEE', orbits: ['DESCENDING']})
        }))

        assert.deepEqual(model.options, {...ALERTS.options, ...HISTORY_EXECUTES, spatialSpeckleFilter: 'REFINED_LEE', ...FORCED})
        assert.equal(fields.kernelSize.state, 'RECORDED')
    })

    it('takes from options another recipe exported only what they state, leaving the rest the alerts\' own', () => {
        const {model, fields} = effectiveSettings(ALERTS, assetProcessing({
            recipe_type: 'MASKING',
            recipe_options: JSON.stringify({geometricCorrection: 'TERRAIN'})
        }))

        assert.equal(model.options.geometricCorrection, 'TERRAIN')
        assert.equal(fields.geometricCorrection.state, 'RECORDED')
        assert.deepEqual(fields.spatialSpeckleFilter, {state: 'NOT_RECORDED', value: 'LEE'})
    })

    it('falls back to the alerts\' own settings, editable, for an asset recording none, and to monitoring\'s where they state none', () => {
        const {model, fields} = effectiveSettings({options: {spatialSpeckleFilter: 'SNIC'}}, assetProcessing({}))

        assert.deepEqual(fields.spatialSpeckleFilter, {state: 'NOT_RECORDED', value: 'SNIC'})
        assert.deepEqual(fields.kernelSize, {state: 'NOT_RECORDED', value: 9})
        assert.equal(model.options.spatialSpeckleFilter, 'SNIC')
    })

    it('falls back to monitoring\'s settings, for an asset recording none, where those the alerts saved are no value it takes', () => {
        const {model, fields} = effectiveSettings({options: {kernelSize: NaN, strongScattererValues: [null, null]}}, assetProcessing({}))

        assert.deepEqual(fields.kernelSize, {state: 'NOT_RECORDED', value: 9})
        assert.deepEqual(model.options.strongScattererValues, [0, -5])
    })

    it('is unreadable, with no fallback, where the options an asset records cannot be read', () => {
        const processing = assetProcessing({recipe_type: 'BAYTS_HISTORICAL', recipe_options: '{broken'})

        const {model, fields} = effectiveSettings(ALERTS, processing)

        assert.equal(model, null)
        assert.ok(Object.values(fields).every(({state}) => state === 'UNREADABLE'))
        assert.equal(BAYTS_ALERTS_PROCESSING.evaluate(processing, {model: ALERTS}).diagnostic.code, 'UNREADABLE_REFERENCE_PROCESSING')
    })

    it('is unreadable where a setting it records is no value monitoring takes', () => {
        const processing = processingOfProducer({options: {spatialSpeckleFilter: 'SHARPEN'}})

        assert.deepEqual(BAYTS_ALERTS_PROCESSING.evaluate(processing, {model: ALERTS}).diagnostic.fields, ['spatialSpeckleFilter'])
    })

    for (const state of ['PENDING', 'UNAVAILABLE']) {
        it(`is unknown, neither refused nor the alerts' own, while the reference is ${state.toLowerCase()}`, () => {
            const {model, fields} = effectiveSettings(ALERTS, {state})

            assert.equal(model, null)
            assert.equal(fields.geometricCorrection.state, state)
            assert.deepEqual(BAYTS_ALERTS_PROCESSING.evaluate({state}, {model: ALERTS}), {status: 'NEEDS_EVIDENCE'})
        })
    }
})

describe('the monitoring choices a new recipe is seeded with', () => {
    it('are the reference\'s passes, masks and angles, nothing it owns or monitoring forces', () => {
        const seeded = seedMonitoring(processingOfProducer({options: {
            orbits: ['DESCENDING'], mask: ['SIDES'], minAngle: 31, maxAngle: 44, spatialSpeckleFilter: 'LEE', outlierRemoval: 'MODERATE'
        }}))

        assert.deepEqual(seeded, {options: {orbits: ['DESCENDING'], mask: ['SIDES'], minAngle: 31, maxAngle: 44}})
    })

    it('leave out what no history could monitor', () => {
        const seeded = seedMonitoring(processingOfProducer({options: {orbits: ['SIDEWAYS'], minAngle: 'steep', maxAngle: 44}}))

        assert.deepEqual(seeded, {options: {maxAngle: 44}})
    })

    it('are none from a reference whose processing cannot be read, or that is not yet read', () => {
        assert.deepEqual(seedMonitoring(assetProcessing({recipe_type: 'BAYTS_HISTORICAL', recipe_options: '{broken'})), {})
        assert.deepEqual(seedMonitoring({state: 'PENDING'}), {})
    })
})

const ALERTS = {
    reference: {type: 'ASSET', id: 'users/x/history'},
    options: {orbits: ['ASCENDING'], mask: ['FIRST_LAST'], minAngle: 32, maxAngle: 44, spatialSpeckleFilter: 'LEE', outlierRemoval: 'MODERATE'}
}

const FORCED = {outlierRemoval: 'NONE', multitemporalSpeckleFilter: 'NONE', orbitNumbers: 'ALL', minObservations: 1}

const HISTORY_EXECUTES = {
    geometricCorrection: 'ELLIPSOID', spatialSpeckleFilter: 'NONE', kernelSize: 5, sigma: 0.9, strongScatterers: 'RETAIN',
    strongScattererValues: [0, -5], snicSize: 3, snicCompactness: 0.15
}
