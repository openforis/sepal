import {Observable} from 'rxjs'

// The only Redux adapter in the source runtime.
//
// Lazy by construction: nothing subscribes to the store until an operation subscribes to `environment$`. With no
// active operation, a Redux action does no source-runtime work at all.
//
// On subscription it synchronously reads one atomic environment. Redux invokes store subscribers synchronously
// during dispatch, so an operation subscribed immediately after a dispatch sees that dispatch's catalogue without
// waiting for a React render or effect.
//
// After the first emission it publishes only on an Earth Engine credential-container change. A catalogue-only
// Redux change emits nothing. Such an envelope still carries the catalogue as it is at that moment, for a stable
// shape, and the runtime deliberately ignores it: an operation captures the catalogue once, and one resolution
// must never combine records from different GUI states.
//
// The catalogue is passed by reference, never copied. Copying would duplicate a potentially large read-only object
// for no reader - the shared graph builder only reads it - and would hide from a caller that this is the same
// object Redux holds.

const CATALOGUE_PATH = ['process', 'loadedRecipes']
const CREDENTIALS_PATH = ['user', 'currentUser', 'googleTokens']

const at = (state, path) =>
    path.reduce((value, key) => value?.[key], state)

export const createReduxSourceEnvironment = ({store}) => {
    let closed = false
    const closeListeners = new Set()

    return {
        // Cold in every sense: creating the adapter reads nothing and subscribes to nothing. The credential
        // baseline belongs to a subscription rather than to the adapter, so an idle runtime holds no reference
        // to credential material at all.
        environment$: new Observable(subscriber => {
            if (closed) {
                subscriber.complete()
                return
            }

            // An invalidation epoch, not an account identity, and private to this subscription - generations are
            // only ever compared against this operation's own baseline. The credential CONTAINER is held for
            // reference comparison and never dereferenced, so no credential value is read, copied, compared,
            // logged or published. Replacement, addition and removal all count: each means the credentials are
            // not the ones this operation started under. That over-invalidates when a refresh replaces the
            // container without changing account, which is safe and retryable.
            const initialState = store.getState()
            let credentials = at(initialState, CREDENTIALS_PATH)
            let generation = 0

            // One `getState()` per selection, so catalogue and credentials always come from the same state.
            // Redux is synchronous, so two reads could not actually disagree today; taking one keeps that
            // independent of the state source staying synchronous.
            const environmentFrom = state => ({
                catalogue: at(state, CATALOGUE_PATH) || {},
                earthEngineGeneration: generation
            })

            const initial = environmentFrom(initialState)
            // Subscribed BEFORE the first emission. A consumer reacting to that emission can dispatch, and a
            // store subscription established afterwards would miss exactly the change it was created to catch.
            const unsubscribeStore = store.subscribe(() => {
                const state = store.getState()
                const next = at(state, CREDENTIALS_PATH)
                // Compared by reference against this subscription's baseline. A catalogue-only change is not a
                // credential change and publishes nothing.
                if (next !== credentials) {
                    credentials = next
                    generation++
                    subscriber.next(environmentFrom(state))
                }
            })
            const onClose = () => subscriber.complete()
            closeListeners.add(onClose)
            subscriber.next(initial)
            return () => {
                credentials = null
                closeListeners.delete(onClose)
                unsubscribeStore()
            }
        }),
        close: () => {
            closed = true
            // Copied before iterating: completing a subscriber runs its teardown, which mutates the set.
            Array.from(closeListeners).forEach(onClose => onClose())
            closeListeners.clear()
        }
    }
}
