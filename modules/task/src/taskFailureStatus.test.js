import {deserializeError, serializeError} from 'serialize-error'

import {EEException} from '#sepal/ee/exception'
import {ClientException, toException} from '#sepal/exception'

import {taskFailureStatus} from './taskFailureStatus.js'

// Mirror the worker -> scheduler boundary (lib/js/shared/src/worker): serializeError(toException(error)) on
// the worker side, deserializeError on the scheduler side.
const crossWorkerBoundary = error => deserializeError(serializeError(toException(error)))

describe('taskFailureStatus', () => {
    it('uses a structured userMessage as the status descriptor', () => {
        const error = {userMessage: {key: 'some.key', message: 'A {thing} failed', args: {thing: 'stratum'}}}
        expect(taskFailureStatus(error)).toEqual({
            messageKey: 'some.key',
            defaultMessage: 'A {thing} failed',
            messageArgs: {thing: 'stratum'}
        })
    })

    it('preserves an explicit userMessage across the worker boundary (real ClientException)', () => {
        const error = new ClientException('technical detail', {
            userMessage: {key: 'some.key', message: 'A {thing} failed', args: {thing: 'stratum'}}
        })
        expect(taskFailureStatus(crossWorkerBoundary(error))).toEqual({
            messageKey: 'some.key',
            defaultMessage: 'A {thing} failed',
            messageArgs: {thing: 'stratum'}
        })
    })

    it('keeps an EE exception message user-visible across the worker boundary', () => {
        const error = new EEException('EE failed', {cause: 'Computation timed out', operationId: 'op-1'})
        const status = taskFailureStatus(crossWorkerBoundary(error))
        expect(status.messageKey).toBe('gee.error.earthEngineException')
        expect(status.messageArgs.earthEngineMessage).toBe('Computation timed out')
        expect(status.defaultMessage).toContain('Computation timed out')
    })

    it('shows a generic "Internal error" (no raw text) for a plain Error crossing the worker boundary', () => {
        const status = taskFailureStatus(crossWorkerBoundary(new Error('boom')))
        expect(status.messageKey).toBe('error.internal')
        expect(status.defaultMessage).toBe('Internal error')
        expect(JSON.stringify(status)).not.toContain('boom')
    })

    it('shows a generic descriptor (no raw text) for a string error crossing the worker boundary', () => {
        const status = taskFailureStatus(crossWorkerBoundary('boom'))
        expect(status.messageKey).toBe('error.internal')
        expect(JSON.stringify(status)).not.toContain('boom')
    })

    it('uses a generic task-failure descriptor (no raw text) for an error with no userMessage', () => {
        const status = taskFailureStatus(new Error('boom'))
        expect(status.messageKey).toBe('tasks.status.failedGeneric')
        expect(status.defaultMessage).toBe('The task failed. Check the logs for details.')
        expect(JSON.stringify(status)).not.toContain('boom')
    })

    it('uses a generic task-failure descriptor (no raw text) for a bare string with no userMessage', () => {
        const status = taskFailureStatus('boom')
        expect(status.messageKey).toBe('tasks.status.failedGeneric')
        expect(JSON.stringify(status)).not.toContain('boom')
    })
})
