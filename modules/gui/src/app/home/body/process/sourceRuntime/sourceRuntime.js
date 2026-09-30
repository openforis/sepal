import {NEVER, Observable, Subscriber, Subscription} from 'rxjs'

import {
    completeRecipeClosure$,
    DEFAULT_RECIPE_CLOSURE_LIMITS
} from '#sepal/recipe/source/completeRecipeClosure'
import {dependencyValidity} from '#sepal/recipe/source/dependencyValidity'

import {createRecipeImageOutputObserver} from '../recipe/imageOutputObserver'
import {recipeContent} from '../recipe/recipeContent'
import {compatibleBasis, DESCRIBE, outputLoading} from '../recipe/recipeOutput'
import {DEFAULT_OUTPUT_RETENTION, OutputRegistry} from './outputRegistry'
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
//
// A terminal answers two questions about the one closure this operation completed: what the recipe's output is,
// from what its providers read, and whether its dependencies are structurally sound, from the whole closure.
// `dependencyValidity` is null where the operation ended before its closure said anything. `basis` is the content
// of every record that closure read, so a caller holding the answer can tell whether it is still about the
// records it now has.
//
// `completeDependencies$` is the same operation stopped after its closure: validity without describing, for a
// caller whose bands are already known and must not be failed by a description it never needed.
//
// `watchOutput$`, `heldFor` and `retryOutput` are for consumers with a lifetime of their own - map layers and Retrieve
// panels. They watch an output question for as long as they are open and read what the runtime holds for it; the
// runtime shares the loading their reads name between them (outputRegistry.js). `session` and `sessionChanges$` are
// what the watches read the session from; without them nothing is ever watched.

const PENDING = 'PENDING'

export const createSourceRuntime = ({
    environment$,
    session = () => NO_SESSION,
    sessionChanges$ = NEVER,
    createObserver = createRecipeImageOutputObserver,
    completeClosure$ = completeRecipeClosure$,
    loadRecipesById$ = createLoadRecipesById$(),
    closureLimits = DEFAULT_RECIPE_CLOSURE_LIMITS,
    retention = DEFAULT_OUTPUT_RETENTION,
    clock
}) => {
    const operation$ = ({recipe, describes}) => new Observable(subscriber => {
        // Ownership is established before anything can publish. A synchronous LOADING, or an invalidation raised
        // from inside a subscriber reacting to it, both re-enter here while setup is still running; without this
        // the operation would be publishing before it owned the work it was publishing about.
        let settled = false
        let observer = null
        let captured = null
        let closureOutcome = null
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
            subscriber.next({
                ...envelope,
                dependencyValidity: closureOutcome ? dependencyValidity(closureOutcome) : null,
                basis: closureOutcome ? basisOf(closureOutcome.graph) : []
            })
            release()
            subscriber.complete()
        }

        const unavailable = error => terminate(describes
            ? {status: 'UNAVAILABLE', description: null, diagnostics: [], error}
            : {status: 'UNAVAILABLE', error})

        const publishLoading = () => {
            if (!settled && !loadingPublished) {
                loadingPublished = true
                subscriber.next(describes
                    ? {status: 'LOADING', description: null, diagnostics: [], error: null}
                    : {status: 'LOADING', error: null})
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
                            closureOutcome = state
                            describes
                                ? observe(state.graph)
                                : terminate({status: 'COMPLETE', error: null})
                        } else if (state.status === 'FAILED') {
                            // What the failed closure had established, for the failure it is about to deliver.
                            closureOutcome = state
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

    const resolveImageOutput$ = ({recipe}) => operation$({recipe, describes: true})
    const completeDependencies$ = ({recipe}) => operation$({recipe, describes: false})
    const outputs = new OutputRegistry({
        session,
        sessionChanges$,
        acquisitionOf: outputLoading,
        operationOf: ({kind, recipe}) => kind === DESCRIBE
            ? resolveImageOutput$({recipe})
            : completeDependencies$({recipe}),
        isCompatible: compatibleBasis,
        retention,
        ...(clock && {clock})
    })

    return {
        resolveImageOutput$,
        completeDependencies$,
        watchOutput$: question => outputs.watchOutput$(question),
        heldFor: key => outputs.heldFor(key),
        retryOutput: question => outputs.retryOutput(question),
        close: () => outputs.close()
    }
}

const NO_SESSION = Object.freeze({catalogue: {}, credentials: null, closed: false})

const basisOf = graph => graph.recipes.map(record => ({id: record.id, content: recipeContent(record)}))
