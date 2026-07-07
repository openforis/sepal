import {lastValueFrom, of, throwError, toArray} from 'rxjs'

import {cleanupExportTask$, isRunning} from './exportTaskCleanup.js'

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
        expect(isRunning('UNSUBMITTED')).toBe(true)
        expect(isRunning('READY')).toBe(true)
        expect(isRunning('RUNNING')).toBe(true)
    })

    it('treats terminal states as not running', () => {
        expect(isRunning('COMPLETED')).toBe(false)
        expect(isRunning('FAILED')).toBe(false)
        expect(isRunning('CANCELLED')).toBe(false)
    })
})

describe('cleanupExportTask$', () => {
    it('cancels a task that is still running', async () => {
        const cancel$ = spy(() => of('cancelled'))
        const status$ = () => of({state: 'RUNNING'})
        const result = await collect(cleanupExportTask$({eeTaskId: 't1', description: 'd', status$, cancel$}))
        expect(cancel$.calls.length).toBe(1)
        expect(cancel$.calls[0][0]).toMatchObject({eeTaskId: 't1', maxRetries: 3})
        expect(result).toEqual([true])
    })

    it('does not cancel a task that is already terminal', async () => {
        const cancel$ = spy(() => of('cancelled'))
        const status$ = () => of({state: 'COMPLETED'})
        const result = await collect(cleanupExportTask$({eeTaskId: 't1', description: 'd', status$, cancel$}))
        expect(cancel$.calls.length).toBe(0)
        expect(result).toEqual([false])
    })

    it('falls back to a direct cancel when the status check fails', async () => {
        const cancel$ = spy(() => of('cancelled'))
        const status$ = () => throwError(() => new Error('status failed'))
        await collect(cleanupExportTask$({eeTaskId: 't1', description: 'd', status$, cancel$}))
        expect(cancel$.calls.length).toBe(1)
        expect(cancel$.calls[0][0]).toMatchObject({eeTaskId: 't1', maxRetries: 0})
    })
})
