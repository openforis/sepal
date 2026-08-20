import {Observable} from 'rxjs'

// Bridges the window between "the export has been submitted" and "we know its id". A caller that goes away
// inside that window - a superseded interactive request, a closed panel - would otherwise leave the
// submission with nobody listening: the id arrives at a torn-down subscription, and the task runs on with
// nothing left that knows how to cancel it.
//
// So the pending start is deliberately NOT torn down with its subscriber. It stays subscribed until it
// succeeds or fails, and an id that arrives too late is handed to `onStartedAfterCancellation` instead of
// being forwarded. Cancelling earlier than that - synchronously, from teardown - is not an option: it can
// outrun the submission being registered, and cancel a task the server does not have yet.
//
// Ownership passes over exactly once. Once an id has been forwarded, the caller owns the task and this
// claims nothing, however the subscription ends afterwards.
//
// Generic and Earth Engine free: the start operation and what to do with a late id are both supplied.
export const startWithLateCleanup$ = ({start$, onStartedAfterCancellation}) =>
    new Observable(subscriber => {
        let cancelled = false
        let started = false
        let claimed = false
        const subscription = start$.subscribe({
            next: value => {
                started = true
                if (!cancelled) {
                    subscriber.next(value)
                } else if (!claimed) {
                    claimed = true
                    onStartedAfterCancellation(value)
                }
            },
            // After cancellation there is no task to clean up and nobody to report to; surfacing it would
            // raise an unhandled error against a request that no longer exists.
            error: error => cancelled || subscriber.error(error),
            complete: () => cancelled || subscriber.complete()
        })
        return () => {
            cancelled = true
            // Only safe to drop once the id is out: before that, this subscription is the only thing that
            // will ever learn it.
            if (started) {
                subscription.unsubscribe()
            }
        }
    })
