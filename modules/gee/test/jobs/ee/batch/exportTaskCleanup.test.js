import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {lastValueFrom, of, throwError, toArray} from 'rxjs'

import {cleanupExportTask$, completionError, isRunning} from '#gee/jobs/ee/batch/exportTaskCleanup'

const collect = obs => lastValueFrom(obs.pipe(toArray()))

const spy = impl => {
    const calls = []
    const fn = (...args) => {
        calls.push(args)
        return impl(...args)
    }
    fn.calls = calls
    return fn
}

describe('isRunning', () => {
    it('treats UNSUBMITTED/READY/RUNNING as running', () => {
        assert.equal(isRunning('UNSUBMITTED'), true)
        assert.equal(isRunning('READY'), true)
        assert.equal(isRunning('RUNNING'), true)
    })

    it('treats terminal states as not running', () => {
        assert.equal(isRunning('COMPLETED'), false)
        assert.equal(isRunning('FAILED'), false)
        assert.equal(isRunning('CANCELLED'), false)
    })
})

describe('completionError', () => {
    const error = ({state, error_message}) =>
        completionError({status: {state, error_message}, description: 'probability-per-stratum'})

    it('accepts a COMPLETED task', () => {
        assert.equal(error({state: 'COMPLETED'}), null)
    })

    it('surfaces the Earth Engine message of a FAILED task', () => {
        const failure = error({state: 'FAILED', error_message: 'Reducer.setOutputs: Need 1 output names'})
        assert.ok(failure.message.includes('probability-per-stratum'))
        assert.ok(failure.message.includes('FAILED'))
        assert.ok(failure.message.includes('Reducer.setOutputs: Need 1 output names'))
        assert.equal(
            failure.userMessage.args.earthEngineMessage,
            'Reducer.setOutputs: Need 1 output names'
        )
    })

    it('reports a CANCELLED task that carries no Earth Engine message', () => {
        const failure = error({state: 'CANCELLED'})
        assert.ok(failure.message.includes('probability-per-stratum'))
        assert.ok(failure.message.includes('CANCELLED'))
        assert.ok(failure.userMessage.args.earthEngineMessage.includes('CANCELLED'))
    })

    it('reports an UNKNOWN state as a failure rather than a success', () => {
        assert.ok(error({state: 'UNKNOWN'}).message.includes('UNKNOWN'))
    })
})

describe('cleanupExportTask$', () => {
    it('cancels a task that is still running', async () => {
        const cancel$ = spy(() => of('cancelled'))
        const status$ = () => of({state: 'RUNNING'})
        const result = await collect(cleanupExportTask$({eeTaskId: 't1', description: 'd', status$, cancel$}))
        assert.equal(cancel$.calls.length, 1)
        assert.partialDeepStrictEqual(cancel$.calls[0][0], {eeTaskId: 't1', maxRetries: 3})
        assert.deepEqual(result, [true])
    })

    it('does not cancel a task that is already terminal', async () => {
        const cancel$ = spy(() => of('cancelled'))
        const status$ = () => of({state: 'COMPLETED'})
        const result = await collect(cleanupExportTask$({eeTaskId: 't1', description: 'd', status$, cancel$}))
        assert.equal(cancel$.calls.length, 0)
        assert.deepEqual(result, [false])
    })

    it('falls back to a direct cancel when the status check fails', async () => {
        const cancel$ = spy(() => of('cancelled'))
        const status$ = () => throwError(() => new Error('status failed'))
        await collect(cleanupExportTask$({eeTaskId: 't1', description: 'd', status$, cancel$}))
        assert.equal(cancel$.calls.length, 1)
        assert.partialDeepStrictEqual(cancel$.calls[0][0], {eeTaskId: 't1', maxRetries: 0})
    })
})
