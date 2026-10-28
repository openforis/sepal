import assert from 'node:assert/strict'
import {beforeEach, describe, it, mock} from 'node:test'

// The radar collection BAYTS monitors, as the algorithm itself asks for it (bayts.js): built with the processing the
// alerts resolved for it (#sepal/recipe/bayts/processing), values the history built its statistics with kept as they
// are. Earth Engine and the collection are substituted; the collection records what it is asked for, and stops the run.

// Whatever is asked of it, answers itself.
const anything = new Proxy(function () {}, {get: (_target, key) => key === 'then' ? undefined : anything, apply: () => anything})

let monitored

mock.module('#sepal/ee/ee', {exports: {default: anything}})
mock.module('#sepal/ee/radar/collection', {exports: {
    createCollection: options => {
        monitored = options
        throw new Error('monitoring collection built')
    }
}})

const {bayts} = await import('#sepal/ee/bayts/bayts')
const {effectiveSettings, processingOfProducer} = await import('#sepal/recipe/bayts/processing')

beforeEach(() => {
    monitored = undefined
})

describe('the radar collection BAYTS monitors', () => {
    it('is built with a history\'s SNIC compactness of zero, not the algorithm\'s default', () => {
        const {model} = effectiveSettings({options: {orbits: ['ASCENDING']}}, processingOfProducer({options: {spatialSpeckleFilter: 'SNIC', snicCompactness: 0}}))

        assert.throws(() => bayts({...model.options, historicalStats: anything}), /monitoring collection built/)

        assert.equal(monitored.spatialSpeckleFilter, 'SNIC')
        assert.equal(monitored.snicCompactness, 0)
    })

    it('is built with the algorithm\'s own processing where it is given none', () => {
        assert.throws(() => bayts({historicalStats: anything}), /monitoring collection built/)

        assert.partialDeepStrictEqual(monitored, {spatialSpeckleFilter: 'LEE', kernelSize: 9, snicSize: 5, snicCompactness: 0.15})
    })
})
