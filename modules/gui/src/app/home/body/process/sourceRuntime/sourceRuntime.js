import {Observable} from 'rxjs'

import {createRecipeImageOutputObserver} from '../recipe/imageOutputObserver'
import {SOURCE_IDENTITY_CHANGED, SOURCE_RUNTIME_UNAVAILABLE, sourceRuntimeError} from './sourceRuntimeError'

// The GUI source runtime.
//
// Consumers ask it about a source; they never learn where dependency records come from, how observations are
// routed, or how a missing recipe will one day be loaded. Those are the things this boundary exists to hide.
//
// `resolveImageOutput$` is deliberately distinct from the shared library's pure synchronous `resolveImageOutput`:
// this one observes runtime evidence asynchronously.
//
// Cold and one-shot. Subscription starts the operation and captures the environment; unsubscription is the only
// public cancellation. The stream never errors - a failed observation, a broken environment and an unexpected
// throw all become a terminal UNAVAILABLE carrying the original error - so no consumer has to defend the error
// channel to stay correct.

const PENDING = 'PENDING'

export const createSourceRuntime = ({environment$, createObserver = createRecipeImageOutputObserver}) => ({
    resolveImageOutput$: ({recipe}) => new Observable(subscriber => {
        // Ownership is established before anything can publish. A synchronous LOADING, or an invalidation raised
        // from inside a subscriber reacting to it, both re-enter here while setup is still running; without this
        // the operation would be publishing before it owned the work it was publishing about.
        let settled = false
        let observer = null
        let observation = null
        let captured = null

        // Both halves are needed: unsubscribing from `state$` stops us listening, while `cancel()` is what
        // releases the observer's in-flight Earth Engine requests.
        const release = () => {
            const currentObservation = observation
            const currentObserver = observer
            observation = null
            observer = null
            currentObservation?.unsubscribe()
            currentObserver?.cancel()
        }

        const terminate = envelope => {
            if (settled) {
                return
            }
            settled = true
            subscriber.next(envelope)
            release()
            subscriber.complete()
        }

        const unavailable = error => terminate({
            status: 'UNAVAILABLE',
            description: null,
            diagnostics: [],
            error
        })

        const observe = ({catalogue}) => {
            observer = createObserver()
            observation = observer.state$.subscribe(state => {
                if (settled || state.status === PENDING) {
                    return
                }
                if (state.status === 'LOADING') {
                    subscriber.next(state)
                } else {
                    terminate(state)
                }
            })
            observer.observe({recipe, loadedRecipes: catalogue})
        }

        // RxJS does not propagate a throw from a next handler out of subscribe(), so the guard has to be here
        // rather than around the subscription: an unexpected failure must reach the consumer as evidence, not
        // vanish into RxJS's unhandled-error reporting.
        const onEnvironment = environment => {
            try {
                if (settled) {
                    return
                }
                if (!captured) {
                    captured = environment
                    return observe(environment)
                }
                if (environment.earthEngineGeneration !== captured.earthEngineGeneration) {
                    unavailable(sourceRuntimeError(SOURCE_IDENTITY_CHANGED))
                }
            } catch (error) {
                unavailable(error)
            }
        }

        const environment = environment$.subscribe({
            next: onEnvironment,
            error: error => unavailable(error),
            // Completion means the scope that owned this runtime ended, whether before or during the
            // operation. Reported before cleanup so detached work learns why it stopped.
            complete: () => unavailable(sourceRuntimeError(SOURCE_RUNTIME_UNAVAILABLE))
        })

        return () => {
            settled = true
            release()
            environment.unsubscribe()
        }
    })
})
