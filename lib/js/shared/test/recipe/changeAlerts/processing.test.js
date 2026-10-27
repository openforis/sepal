import assert from 'node:assert/strict'
import {test} from 'node:test'

import {assetProcessing, effectiveSettings, processingOfProducer, seedMonitoring} from '../../../src/recipe/changeAlerts/processing.js'

const model = {sources: {dataSetType: 'OPTICAL', dataSets: {LANDSAT: ['LANDSAT_8']}, band: 'red'}, options: {corrections: ['SR', 'BRDF'], brdfMultiplier: 9, spatialSpeckleFilter: 'LEE'}}

test('recipe processing uses execution defaults, preserving consumer choices and saved copies', () => {
    const saved = structuredClone(model)
    const facts = processingOfProducer({sources: {dataSetType: 'RADAR'}, options: {}})
    const effective = effectiveSettings(model, facts)
    assert.deepEqual(effective.model.sources, model.sources)
    assert.deepEqual(effective.model.options.corrections, [])
    assert.equal(effective.model.options.brdfMultiplier, 4)
    assert.equal(effective.model.options.spatialSpeckleFilter, 'NONE')
    assert.equal(effective.fields.geometricCorrection.value, 'ELLIPSOID')
    assert.equal(effective.fields.SR.state, 'REFERENCE')
    assert.deepEqual(model, saved)
})

test('absent metadata is an editable fallback, pending and failed reads are not', () => {
    const absent = effectiveSettings(model, assetProcessing({}))
    assert.equal(absent.fields.SR.state, 'NOT_RECORDED')
    assert.deepEqual(absent.model.options.corrections, model.options.corrections)
    for (const state of ['PENDING', 'UNAVAILABLE']) {
        const result = effectiveSettings(model, {state})
        assert.equal(result.fields.SR.state, state)
        assert.equal(result.fields.SR.value, undefined)
        assert.equal(result.model, null)
    }
})

test('canonical complete metadata wins over malformed legacy forms and round trips producer processing', () => {
    const producer = {sources: {dataSetType: 'OPTICAL', dataSets: {LANDSAT: ['LANDSAT_8']}, classification: 'private', cloudPercentageThreshold: 17}, options: {corrections: ['SR'], cloudBuffer: 200}}
    const facts = processingOfProducer(producer)
    const read = assetProcessing({processing: JSON.stringify(facts.record), recipe_options: 'broken'})
    assert.equal(effectiveSettings(model, read).fields.SR.value, true)
    assert.equal(effectiveSettings(model, read).fields.BRDF.value, false)
    assert.deepEqual(read.defaults, facts.defaults)
    assert.equal(facts.record.classification, undefined)
})

test('complete legacy options supply defaults; partial options record only stated fields', () => {
    const complete = effectiveSettings(model, assetProcessing({recipe_type: 'CCDC', recipe_options: '{}'}))
    assert.equal(complete.fields.spatialSpeckleFilter.state, 'RECORDED')
    assert.equal(complete.fields.spatialSpeckleFilter.value, 'NONE')
    const partial = effectiveSettings(model, assetProcessing({recipe_options: JSON.stringify({corrections: ['SR']})}))
    assert.equal(partial.fields.SR.state, 'RECORDED')
    assert.equal(partial.fields.spatialSpeckleFilter.state, 'NOT_RECORDED')
    assert.equal(partial.fields.spatialSpeckleFilter.value, 'LEE')
})

test('legacy nested forms and SR-only metadata respect per-field precedence', () => {
    const nested = {recipe_type: 'CCDC', recipe_options: JSON.stringify({corrections: ['BRDF'], brdfMultiplier: 3})}
    const read = effectiveSettings(model, assetProcessing({recipe_options: '{"brdfMultiplier":5}', formattedProperties: nested, surfaceReflectance: 1, dateFormat: 0}))
    assert.equal(read.fields.brdfMultiplier.value, 5)
    assert.equal(read.fields.SR.value, false)
    assert.equal(read.fields.dateFormat.value, 0)
    assert.equal(effectiveSettings(model, assetProcessing({surfaceReflectance: false})).fields.SR.value, false)
})

test('a malformed governing form holds rather than falling through; repair clears it', () => {
    for (const processing of ['broken', 'null', '{"options":{"corrections":"SR"}}']) {
        const result = effectiveSettings(model, assetProcessing({processing, surfaceReflectance: 1}))
        assert.equal(result.fields.SR.state, 'UNREADABLE')
        assert.equal(result.model, null)
    }
    assert.ok(effectiveSettings(model, assetProcessing({processing: '{"options":{}}'})).model)
})

test('seeds a coherent consumer set only, excluding required matches and non-monitoring configuration', () => {
    const facts = processingOfProducer({sources: {dataSetType: 'RADAR', dataSets: {SENTINEL_1: ['SENTINEL_1']}, breakpointBands: ['VV'], classification: 'private'}, options: {orbits: ['DESCENDING'], geometricCorrection: 'TERRAIN', spatialSpeckleFilter: 'LEE', minObservations: 4}, ccdcOptions: {lambda: 2}})
    const seeded = seedMonitoring(facts)
    assert.deepEqual(seeded.sources, {dataSetType: 'RADAR', dataSets: {SENTINEL_1: ['SENTINEL_1']}})
    assert.deepEqual(seeded.options, {orbits: ['DESCENDING'], minObservations: 4})
    assert.deepEqual(seedMonitoring(assetProcessing({})), {})
})

test('valid higher complete forms shield malformed lower forms, while partial forms do not claim unstated fields', () => {
    const complete = assetProcessing({recipe_type: 'CCDC', recipe_options: '{}', formattedProperties: '{bad'})
    assert.ok(effectiveSettings(model, complete).model)
    const partial = assetProcessing({recipe_options: '{"brdfMultiplier":5}', formattedProperties: '{bad'})
    assert.equal(partial.fields.brdfMultiplier.value, 5)
    assert.equal(partial.fields.SR.state, 'UNREADABLE')
    assert.equal(effectiveSettings(model, partial).model, null)
})

test('malformed governing source metadata cannot seed an incoherent collection or become a fallback', () => {
    for (const properties of [
        {recipe_sources: '{bad'},
        {processing: JSON.stringify({dataSets: 'LANDSAT_8', options: {}})},
        {processing: JSON.stringify({options: {geometricCorrection: 'unknown'}})}
    ]) {
        const facts = assetProcessing(properties)
        assert.equal(effectiveSettings(model, facts).model, null)
        assert.deepEqual(seedMonitoring(facts), {})
    }
    assert.ok(effectiveSettings(model, assetProcessing({processing: '{"options":{}}', recipe_sources: '{bad'})).model)
})

test('date format is top-level and recorded zero wins over the consumer fallback', () => {
    const consumer = {...model, reference: {dateFormat: 2}}
    assert.equal(effectiveSettings(consumer, assetProcessing({dateFormat: 0})).model.reference.dateFormat, 0)
    assert.equal(effectiveSettings(consumer, assetProcessing({})).model.reference.dateFormat, 2)
    assert.equal(effectiveSettings(consumer, assetProcessing({dateFormat: 'invalid'})).model, null)
})

test('first Apply derives a coherent family from the producer collection rather than stale source labels', () => {
    const defaults = seedMonitoring(processingOfProducer({sources: {dataSetType: 'OPTICAL', dataSets: {SENTINEL_1: ['SENTINEL_1']}}}))
    assert.equal(defaults.sources.dataSetType, 'RADAR')
})
