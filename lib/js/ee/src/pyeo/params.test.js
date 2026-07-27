import assert from 'node:assert/strict'
import {test} from 'node:test'

import {toUolParams} from './params.js'

test('passes change classes through', () => {
    const p = toUolParams({changeFromClasses: [1], changeToClasses: [2, 3]})
    assert.deepEqual(p.changeFromClasses, [1])
    assert.deepEqual(p.changeToClasses, [2, 3])
})

test('maps minConsecutiveDetections to the validated-detections threshold', () => {
    const p = toUolParams({minConsecutiveDetections: 4})
    assert.equal(p.minRequiredValidatedDetectionsThreshold, 4)
})

test('applies UoL default thresholds', () => {
    const p = toUolParams({})
    assert.equal(p.minRequiredClassifierDetectionsThreshold, 5)
    assert.equal(p.percentageProbabilityThreshold, 50)
    assert.equal(p.minRequiredFromDetectionsThreshold, 2)
    assert.equal(p.minRequiredToDetectionsThreshold, 2)
    assert.equal(p.minRequiredValidatedDetectionsThreshold, 2)
})

test('index gate on passes the chosen index and threshold through', () => {
    const p = toUolParams({indexGate: {index: 'nbr', threshold: 0.2}})
    assert.equal(p.indexGate.use, true)
    assert.equal(p.indexGate.index, 'nbr')
    assert.equal(p.indexGate.threshold, 0.2)
    assert.equal(p.indexGate.minRequiredDeltaIndexDetectionsThreshold, 5)
})

test('index gate off uses pass-through threshold -2.0 and defaults to ndvi', () => {
    const p = toUolParams({indexGate: undefined})
    assert.equal(p.indexGate.use, false)
    assert.equal(p.indexGate.threshold, -2.0)
    assert.equal(p.indexGate.index, 'ndvi')
})
