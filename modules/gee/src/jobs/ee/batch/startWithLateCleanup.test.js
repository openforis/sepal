import {Subject, throwError} from 'rxjs'

import {startWithLateCleanup$} from './startWithLateCleanup.js'

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

        expect(onStartedAfterCancellation.calls).toEqual([['t1']])
        expect(values).toEqual([])
        expect(errors).toEqual([])
    })

    it('forwards a task id that arrives normally and claims no cleanup', () => {
        const start$ = new Subject()
        const onStartedAfterCancellation = spy()
        const {values, observer, isCompleted} = observe()

        startWithLateCleanup$({start$, onStartedAfterCancellation}).subscribe(observer)
        start$.next('t1')
        start$.complete()

        expect(values).toEqual(['t1'])
        expect(isCompleted()).toBe(true)
        expect(onStartedAfterCancellation.calls).toEqual([])
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

        expect(onStartedAfterCancellation.calls).toEqual([])
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

        expect(onStartedAfterCancellation.calls).toEqual([])
        expect(errors).toEqual([])
        expect(values).toEqual([])
        expect(isCompleted()).toBe(false)
    })

    // A submission Earth Engine refuses while the caller is still there must still reach it as an error.
    it('forwards a start failure that arrives before cancellation', () => {
        const {errors, observer} = observe()
        startWithLateCleanup$({
            start$: throwError(() => new Error('submission rejected')),
            onStartedAfterCancellation: spy()
        }).subscribe(observer)
        expect(errors.map(({message}) => message)).toEqual(['submission rejected'])
    })
})
