import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {defer, lastValueFrom, of} from 'rxjs'

import {gateFinalExport$} from '#gee/jobs/task/samplingDesign/finalValidationGate'
import {assertMatches} from '#sepal/testSupport/assert'

const allocation = [
    {stratum: 1, label: 'a', sampleSize: 5},
    {stratum: 2, label: 'b', sampleSize: 3}
]

// export$ that records whether it was ever subscribed, so we can assert the validation gates it.
const spyExport = () => {
    let subscribed = false
    const export$ = defer(() => {
        subscribed = true
        return of('EXPORTED')
    })
    return {export$, wasSubscribed: () => subscribed}
}

const systematic = extra => ({
    arrangementStrategy: 'SYSTEMATIC',
    sampleSizeStrategy: 'OVER',
    effectiveMinimum: 2,
    minDistance: 60,
    pixelSize: 10,
    ...extra
})

const gate = ({counts, config}) => {
    const {export$, wasSubscribed} = spyExport()
    return {promise: lastValueFrom(gateFinalExport$({counts$: of(counts), allocation, config, export$})), wasSubscribed}
}

describe('gateFinalExport$', () => {
    it('blocks the export when a stratum is below the statistical floor', async () => {
        const {promise, wasSubscribed} = gate({counts: {1: 5, 2: 1}, config: systematic()})
        await assert.rejects(promise, error => {
            assertMatches(error, {
                userMessage: {key: 'tasks.samplingDesign.underproduction.message'}
            })

            return true
        })
        assert.equal(wasSubscribed(), false)
    })

    it('blocks the export when a stratum misses the configured minimum', async () => {
        const {promise, wasSubscribed} = gate({counts: {1: 5, 2: 3}, config: systematic({effectiveMinimum: 4, sampleSizeStrategy: 'CLOSEST'})})
        const error = await promise.catch(e => e)
        assert.deepEqual(error.userMessage.args.advice.map(({kind}) => kind), ['configuredMinimum'])
        assert.equal(wasSubscribed(), false)
    })

    it('blocks the export under OVER when a stratum misses the requested allocation', async () => {
        const {promise, wasSubscribed} = gate({counts: {1: 5, 2: 2}, config: systematic()})
        const error = await promise.catch(e => e)
        assert.deepEqual(
            error.userMessage.args.advice.map(({kind}) => kind),
            ['requestedAllocation']
        )
        assert.equal(wasSubscribed(), false)
    })

    it('lets CLOSEST undershoot the request once the minimum is met, and subscribes the export', async () => {
        const {promise, wasSubscribed} = gate({counts: {1: 5, 2: 2}, config: systematic({sampleSizeStrategy: 'CLOSEST'})})
        assert.equal(await promise, 'EXPORTED')
        assert.equal(wasSubscribed(), true)
    })

    it('requires the requested count for random sampling', async () => {
        const {promise, wasSubscribed} = gate({
            counts: {1: 5, 2: 2},
            config: {arrangementStrategy: 'RANDOM', effectiveMinimum: 2, minDistance: 0, pixelSize: 10}
        })
        const error = await promise.catch(e => e)
        assert.deepEqual(
            error.userMessage.args.advice.map(({kind}) => kind),
            ['requestedAllocation']
        )
        assert.equal(wasSubscribed(), false)
    })

    it('carries configuration-aware advice, keyed and with computed arguments', async () => {
        const {promise} = gate({counts: {1: 5, 2: 1}, config: systematic()})
        const error = await promise.catch(e => e)
        const [{kind, actions}] = error.userMessage.args.advice
        assert.equal(kind, 'statisticalMinimum')
        assert.ok(
            actions.map(({key}) => key).includes('tasks.samplingDesign.underproduction.reduceSystematicMinDistance')
        )
        // The threshold is derived from the submitted 60 m / 10 m grid, not hard-coded copy.
        assert.deepEqual(
            actions.find(({key}) => key.endsWith('reduceSystematicMinDistance')).args,
            {minDistance: 60, threshold: 55.4}
        )
    })

    it('subscribes the export when every stratum satisfies its contract', async () => {
        const {promise, wasSubscribed} = gate({counts: {1: 5, 2: 3}, config: systematic()})
        assert.equal(await promise, 'EXPORTED')
        assert.equal(wasSubscribed(), true)
    })
})
