import {Observable, Subscriber, Subscription} from 'rxjs'

import {
    completeRecipeClosure$,
    DEFAULT_RECIPE_CLOSURE_LIMITS
} from '#sepal/recipe/source/completeRecipeClosure'

import {createRecipeImageOutputObserver} from '../recipe/imageOutputObserver'
import {createLoadRecipesById$} from './recipeClosureLoader'
import {SOURCE_IDENTITY_CHANGED, SOURCE_RUNTIME_UNAVAILABLE, sourceRuntimeError} from './sourceRuntimeError'

// The GUI source runtime.
//
// Consumers ask it about a source; they never learn where dependency records come from, how observations are
// routed, or how a missing recipe is loaded. Those are the things this boundary exists to hide.
//
// `resolveImageOutput$` is deliberately distinct from the shared library's pure synchronous `resolveImageOutput`:
// this one observes runtime evidence asynchronously.
//
// Cold and one-shot. Subscription starts the operation and captures the environment; unsubscription is the only
// public cancellation. The stream never errors - a failed observation, a broken environment and an unexpected
// throw all become a terminal UNAVAILABLE carrying the original error - so no consumer has to defend the error
// channel to stay correct.

const PENDING = 'PENDING'

const loadingState = () => ({
    status: 'LOADING',
    description: null,
    diagnostics: [],
    error: null
})

export const createSourceRuntime = ({
    environment$,
    createObserver = createRecipeImageOutputObserver,
    completeClosure$ = completeRecipeClosure$,
    loadRecipesById$ = createLoadRecipesById$(),
    closureLimits = DEFAULT_RECIPE_CLOSURE_LIMITS
}) => ({
    resolveImageOutput$: ({recipe}) => new Observable(subscriber => {
        // Ownership is established before anything can publish. A synchronous LOADING, or an invalidation raised
        // from inside a subscriber reacting to it, both re-enter here while setup is still running; without this
        // the operation would be publishing before it owned the work it was publishing about.
        let settled = false
        let observer = null
        let captured = null
        let loadingPublished = false
        const work = new Subscription()

        const release = () => {
            const currentObserver = observer
            observer = null
            work.unsubscribe()
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

        const publishLoading = () => {
            if (!settled && !loadingPublished) {
                loadingPublished = true
                subscriber.next(loadingState())
            }
        }

        const observe = graph => {
            const currentObserver = createObserver()
            observer = currentObserver
            const observation = new Subscriber({
                next: state => {
                    if (settled || state.status === PENDING) {
                        return
                    }
                    if (state.status === 'LOADING') {
                        publishLoading()
                    } else {
                        terminate(state)
                    }
                },
                error: unavailable
            })
            work.add(observation)
            currentObserver.state$.subscribe(observation)
            currentObserver.observe({graph})
        }

        const completeClosure = ({catalogue}) => {
            const closure = completeClosure$({
                rootRecipe: recipe,
                seedRecipesById: new Map(Object.entries(catalogue || {})),
                loadRecipesById$,
                limits: closureLimits
            })
            const closureSubscriber = new Subscriber({
                next: state => {
                    try {
                        if (settled) {
                            return
                        }
                        if (state.status === 'LOADING') {
                            publishLoading()
                        } else if (state.status === 'COMPLETE') {
                            observe(state.graph)
                        } else {
                            unavailable(new Error(`Source runtime: unexpected closure state ${state.status}`))
                        }
                    } catch (error) {
                        unavailable(error)
                    }
                },
                error: unavailable
            })
            // The subscriber belongs to the operation before subscription. A synchronous LOADING callback can
            // invalidate the runtime and close it before the closure attempts authenticated HTTP work.
            work.add(closureSubscriber)
            closure.subscribe(closureSubscriber)
        }

        const onEnvironment = environment => {
            try {
                if (settled) {
                    return
                }
                if (!captured) {
                    captured = environment
                    return completeClosure(environment)
                }
                if (environment.earthEngineGeneration !== captured.earthEngineGeneration) {
                    unavailable(sourceRuntimeError(SOURCE_IDENTITY_CHANGED))
                }
            } catch (error) {
                unavailable(error)
            }
        }

        const environment = new Subscriber({
            next: onEnvironment,
            error: error => unavailable(error),
            // Completion means the scope that owned this runtime ended, whether before or during the
            // operation. Reported before cleanup so detached work learns why it stopped.
            complete: () => unavailable(sourceRuntimeError(SOURCE_RUNTIME_UNAVAILABLE))
        })
        work.add(environment)
        environment$.subscribe(environment)

        return () => {
            settled = true
            release()
        }
    })
})
