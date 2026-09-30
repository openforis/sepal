import {Observable} from 'rxjs'

import {actionBuilder} from '~/action-builder'

import {cacheAcceptance, initializeRecipe, REPLACE} from '../recipeCache'

// The only Redux adapter in the source runtime.
//
// Lazy by construction: nothing subscribes to the store until an operation subscribes to `environment$` or a watch
// to `sessionChanges$`. With neither active, a Redux action does no source-runtime work at all.
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
const TABS_PATH = ['process', 'tabs']
const LISTING_PATH = ['process', 'recipes']
const LISTING_STATE_PATH = ['process', 'recipeListing']
const SAVES_PATH = ['process', 'saveStates']

const EMPTY_CATALOGUE = Object.freeze({})
const NO_CREDENTIALS = Object.freeze({})
const NOTHING = Object.freeze({})
const NONE = Object.freeze([])
const CLOSED_SESSION = Object.freeze({
    catalogue: EMPTY_CATALOGUE, credentials: NO_CREDENTIALS, listing: NONE, listingState: NOTHING, tabs: NONE,
    saves: NOTHING, closed: true
})

const at = (state, path) =>
    path.reduce((value, key) => value?.[key], state)

// One opaque token per credential container, compared by identity. The container is a WeakMap key and nothing
// else, so no credential value is read, retained or published.
const CREDENTIAL_TOKENS = new WeakMap()

const credentialToken = container => {
    if (!container || typeof container !== 'object') {
        return NO_CREDENTIALS
    }
    if (!CREDENTIAL_TOKENS.has(container)) {
        CREDENTIAL_TOKENS.set(container, Object.freeze({}))
    }
    return CREDENTIAL_TOKENS.get(container)
}

// One `getState()`, so everything comes from the same state. Each part is passed by reference, so a reader can tell
// what changed by identity:
//
//   catalogue     the records the session holds, drafts of open recipes among them
//   credentials   an opaque token standing for the credential container
//   listing       the recipe listing: which recipes storage holds, at which revision (recipeListing.js)
//   listingState  how current the listing is
//   tabs          the open recipes, whose records are drafts
//   saves         what each open recipe's saves have made persistent (saveCoordinator.js)
const sessionOf = state => ({
    catalogue: at(state, CATALOGUE_PATH) || EMPTY_CATALOGUE,
    credentials: credentialToken(at(state, CREDENTIALS_PATH)),
    listing: at(state, LISTING_PATH) || NONE,
    listingState: at(state, LISTING_STATE_PATH) || NOTHING,
    tabs: at(state, TABS_PATH) || NONE,
    saves: at(state, SAVES_PATH) || NOTHING,
    closed: false
})

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
        // The session as the store holds it now, for a watch deciding what its question is and whether an answer is
        // still about the credentials in effect. Reading subscribes to nothing.
        session: () => closed ? CLOSED_SESSION : sessionOf(store.getState()),
        // Notifies after every store change, and completes when the scope ends.
        sessionChanges$: new Observable(subscriber => {
            if (closed) {
                subscriber.complete()
                return
            }
            const unsubscribeStore = store.subscribe(() => subscriber.next())
            const onClose = () => subscriber.complete()
            closeListeners.add(onClose)
            return () => {
                closeListeners.delete(onClose)
                unsubscribeStore()
            }
        }),
        // A record the runtime read from storage replaces the session's cached copy only when that copy is present, not
        // a draft and older, judged as the record arrives (recipeCache.js). The runtime retains no cache entry, so one
        // that is absent stays absent and the record stays the runtime's own. Returns whether it was replaced.
        replaceCachedRecipe: record => {
            if (closed) {
                return false
            }
            const state = store.getState()
            const open = (at(state, TABS_PATH) || []).some(({id}) => id === record.id)
            const cached = at(state, [...CATALOGUE_PATH, record.id])
            const saveState = at(state, [...SAVES_PATH, record.id])
            if (cacheAcceptance({record, cached, open, saveState}) !== REPLACE) {
                return false
            }
            store.dispatch(actionBuilder('REFRESH_CACHED_RECIPE', {recipeId: record.id})
                .set(['process.loadedRecipes', record.id], initializeRecipe(record))
                .build())
            return true
        },
        // Applies update({recipes, listingState, saves}) → {recipes?, listingState?} to the listing as it stands now.
        updateRecipeListing: update => {
            if (closed) {
                return
            }
            const state = store.getState()
            const {recipes, listingState} = update({
                recipes: at(state, LISTING_PATH) || [],
                listingState: at(state, LISTING_STATE_PATH) || {},
                saves: at(state, SAVES_PATH) || {}
            })
            if (!recipes && !listingState) {
                return
            }
            const action = actionBuilder('UPDATE_RECIPE_LISTING')
            recipes && action.set('process.recipes', recipes)
            listingState && action.set('process.recipeListing', listingState)
            store.dispatch(action.build())
        },
        close: () => {
            closed = true
            // Copied before iterating: completing a subscriber runs its teardown, which mutates the set.
            Array.from(closeListeners).forEach(onClose => onClose())
            closeListeners.clear()
        }
    }
}
