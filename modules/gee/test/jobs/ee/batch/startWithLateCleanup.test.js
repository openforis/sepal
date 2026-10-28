import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {Subject, throwError} from 'rxjs'

import {startWithLateCleanup$} from '#gee/jobs/ee/batch/startWithLateCleanup'

const observe = () => {
    const values = []
    const errors = []
    let completed = false
    return {
        values,
        errors,
        isCompleted: () => completed,
        observer: {
            next: value => values.push(value),
            error: error => errors.push(error),
            complete: () => {
                completed = true
            }
        }
    }
}

const spy = () => {
    const calls = []
    const fn = (...args) => calls.push(args)
    fn.calls = calls
    return fn
}

describe('startWithLateCleanup$', () => {
    // The race: the caller has already gone away, but Earth Engine was ALREADY asked to create the task.
    // Dropping the pending start here is what orphans it - the id arrives with nobody left to cancel it.
    it('hands a task id that arrives after cancellation to late cleanup instead of the gone subscriber', () => {
        const start$ = new Subject()
        const onStartedAfterCancellation = spy()
        const {values, errors, observer} = observe()

        const subscription = startWithLateCleanup$({start$, onStartedAfterCancellation}).subscribe(observer)
        subscription.unsubscribe()

        // Earth Engine accepts the submission afterwards.
        start$.next('t1')
        start$.complete()

        assert.deepEqual(onStartedAfterCancellation.calls, [['t1']])
        assert.deepEqual(values, [])
        assert.deepEqual(errors, [])
    })

    it('forwards a task id that arrives normally and claims no cleanup', () => {
        const start$ = new Subject()
        const onStartedAfterCancellation = spy()
        const {values, observer, isCompleted} = observe()

        startWithLateCleanup$({start$, onStartedAfterCancellation}).subscribe(observer)
        start$.next('t1')
        start$.complete()

        assert.deepEqual(values, ['t1'])
        assert.equal(isCompleted(), true)
        assert.deepEqual(onStartedAfterCancellation.calls, [])
    })

    // Once the id has been delivered, polling owns the task and runs cleanup from its own finalize. Claiming
    // it here too would cancel the same task twice.
    it('does not claim cleanup when unsubscribed after the id was delivered', () => {
        const start$ = new Subject()
        const onStartedAfterCancellation = spy()
        const {observer} = observe()

        const subscription = startWithLateCleanup$({start$, onStartedAfterCancellation}).subscribe(observer)
        start$.next('t1')
        subscription.unsubscribe()

        assert.deepEqual(onStartedAfterCancellation.calls, [])
    })

    // There is no task to clean up, and the caller is gone - reporting it would surface an unhandled error
    // against a request nobody is waiting for.
    it('swallows a start failure that arrives after cancellation', () => {
        const start$ = new Subject()
        const onStartedAfterCancellation = spy()
        const {values, errors, observer, isCompleted} = observe()

        const subscription = startWithLateCleanup$({start$, onStartedAfterCancellation}).subscribe(observer)
        subscription.unsubscribe()
        start$.error(new Error('submission rejected'))

        assert.deepEqual(onStartedAfterCancellation.calls, [])
        assert.deepEqual(errors, [])
        assert.deepEqual(values, [])
        assert.equal(isCompleted(), false)
    })

    // A submission Earth Engine refuses while the caller is still there must still reach it as an error.
    it('forwards a start failure that arrives before cancellation', () => {
        const {errors, observer} = observe()
        startWithLateCleanup$({
            start$: throwError(() => new Error('submission rejected')),
            onStartedAfterCancellation: spy()
        }).subscribe(observer)
        assert.deepEqual(errors.map(({message}) => message), ['submission rejected'])
    })
})
