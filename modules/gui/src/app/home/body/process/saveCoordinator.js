import _ from 'lodash'

const MAX_ATTEMPTS = 3
const CONFLICT = 412

export const SAVED = 'SAVED'
export const SAVING = 'SAVING'
export const FAILED = 'FAILED'
export const CONFLICTED = 'CONFLICT'
export const UNRESOLVED = 'UNRESOLVED'

export const DEFAULT_UNCONFIRMED_AFTER_MS = 60000

const SYSTEM_CLOCK = {
    now: () => Date.now(),
    setTimeout: (callback, ms) => setTimeout(callback, ms),
    clearTimeout: id => clearTimeout(id)
}

// Serializes saves per recipe and coalesces pending saves. A draft's base revision advances only from an
// acknowledgement or a coherent recipe load, which distinguish a committed write, a safe retry and a
// conflicting remote write.
//
// What is persisted is published as a state per recipe, after every transition and never between the steps of one:
//
//   status    SAVED | SAVING | FAILED | CONFLICT | UNRESOLVED
//   model     the model object whose content is persisted at `revision`, or undefined before anything is
//   revision  the recipe's acknowledged or coherently loaded revision
//   since     when the oldest content not yet acknowledged was submitted, while SAVING
//   unconfirmed  that content has been waiting longer than `unconfirmedAfterMs`
//
// `model` is known by identity. Content is established as equal only where it is compared anyway: an
// acknowledgement or a recovering load of the content sent, a coherent load, or `equivalent` - the autosave's own
// comparison finding a new model object with nothing to save. A FAILED save was refused, so its content is not
// persisted; the coordinator goes on with whatever was queued after it. Being unconfirmed only reports how long
// the wait has been: nothing is cancelled, retried or given up because of it, and a later acknowledgement ends it.
export const createSaveCoordinator = ({
    save, loadRecipe, onOutcome = () => {}, onState = () => {},
    unconfirmedAfterMs = DEFAULT_UNCONFIRMED_AFTER_MS, clock = SYSTEM_CLOCK
}) => {
    const states = new Map()

    const submit = recipe => {
        const state = stateOf(recipe.id)
        if (!state.pending) {
            state.pendingSince = clock.now()
        }
        state.pending = recipe
        pump(recipe.id)
        publish(recipe.id, state)
    }

    // Replacing the state starts a new generation, invalidating callbacks from the previous open. The load that
    // opens a recipe is coherent, so its model is what is persisted at its revision.
    const open = (id, revision, model) => {
        release(states.get(id))
        const state = fresh(revision, model)
        states.set(id, state)
        publish(id, state)
    }

    const forget = id => {
        release(states.get(id))
        states.delete(id)
        onState(id, null)
    }

    // The autosave compared `from` and `to` by value and found nothing to save.
    const equivalent = (id, from, to) => {
        const state = states.get(id)
        if (!state || from === to) {
            return
        }
        if (state.inFlight?.model === from) {
            state.inFlight.model = to
        }
        if (state.pending?.model === from) {
            state.pending = {...state.pending, model: to}
        }
        if (state.acknowledgedModel === from) {
            state.acknowledgedModel = to
            publish(id, state)
        }
    }

    const pump = id => {
        const state = stateOf(id)
        if (state.inFlight || state.latched || !state.pending) {
            return
        }
        const request = {
            recipe: state.pending,
            model: state.pending.model,
            since: state.pendingSince,
            expectedRevision: state.baseRevision,
            attempts: 1
        }
        state.pending = null
        state.pendingSince = null
        transmit(id, state, request)
    }

    const transmit = (id, state, request) => {
        state.inFlight = request
        save({recipe: request.recipe, expectedRevision: request.expectedRevision}).then(
            result => current(id, state, request) && acknowledged(id, state, request, result),
            error => current(id, state, request) && failed(id, state, request, error)
        )
    }

    const acknowledged = (id, state, request, result) => {
        if (isRevision(result?.revision)) {
            adopt(id, state, result.revision)
        } else {
            resolve(id, state, request, Object.assign(new Error('Malformed acknowledgement'), {result}))
        }
    }

    const failed = (id, state, request, error) => {
        if (isRefusal(error)) {
            state.inFlight = null
            state.refused = true
            pump(id)
            publish(id, state)
            outcome(id, FAILED, {error})
        } else {
            resolve(id, state, request, error)
        }
    }

    // The load carries content and revision from one row, so the comparison and the revision it adopts
    // describe the same state.
    const resolve = (id, state, request, cause) =>
        loadRecipe(id).then(
            stored => {
                if (!current(id, state, request)) {
                    return
                }
                if (!isRevision(stored?.revision)) {
                    retry(id, state, request, cause)
                } else if (_.isEqual(comparable(stored), comparable(request.recipe))) {
                    adopt(id, state, stored.revision)
                } else if (stored.revision === request.expectedRevision) {
                    retry(id, state, request, cause)
                } else {
                    latch(id, state, 'CONFLICT', cause)
                }
            },
            () => current(id, state, request) && retry(id, state, request, cause)
        )

    const adopt = (id, state, revision) => {
        const {model} = state.inFlight
        state.inFlight = null
        state.baseRevision = revision
        state.acknowledgedModel = model
        state.refused = false
        pump(id)
        publish(id, state)
        outcome(id, SAVED, {revision, model})
    }

    const retry = (id, state, request, cause) =>
        request.attempts < MAX_ATTEMPTS
            ? transmit(id, state, {...request, attempts: request.attempts + 1})
            : latch(id, state, 'UNRESOLVED', cause)

    const latch = (id, state, status, error) => {
        state.latched = status
        state.inFlight = null
        publish(id, state)
        outcome(id, status, {error})
    }

    const outcome = (id, status, extra) => onOutcome({recipeId: id, status, ...extra})

    const publish = (id, state) => {
        if (states.get(id) !== state) {
            return
        }
        const since = state.latched ? null : state.inFlight?.since ?? state.pendingSince ?? null
        schedule(id, state, since)
        onState(id, {
            status: state.latched || (since !== null ? SAVING : state.refused ? FAILED : SAVED),
            model: state.acknowledgedModel,
            revision: state.baseRevision,
            since,
            unconfirmed: since !== null && clock.now() - since >= unconfirmedAfterMs
        })
    }

    // The deadline belongs to the content waiting, so a new wait starts only when older content is acknowledged.
    const schedule = (id, state, since) => {
        if (state.deadline?.since === since) {
            return
        }
        release(state)
        if (since !== null) {
            const remaining = Math.max(0, since + unconfirmedAfterMs - clock.now())
            state.deadline = {since, timer: clock.setTimeout(() => publish(id, state), remaining)}
        }
    }

    const release = state => {
        if (state?.deadline) {
            clock.clearTimeout(state.deadline.timer)
            state.deadline = null
        }
    }

    // State identity prevents callbacks from an earlier open or forgotten recipe from committing.
    const current = (id, state, request) => states.get(id) === state && state.inFlight === request

    const stateOf = id => states.get(id) || states.set(id, fresh()).get(id)

    const fresh = (baseRevision, acknowledgedModel) => ({
        baseRevision, acknowledgedModel, inFlight: null, pending: null, pendingSince: null, latched: null,
        refused: false, deadline: null
    })

    return {save: submit, open, forget, equivalent}
}

const isRevision = value => Number.isSafeInteger(value) && value > 0

const isRefusal = error => error?.status >= 400 && error?.status < 500 && error?.status !== CONFLICT

// Compare only what a save writes: JSON omits undefined, while placement and the revision are server-owned
// and would otherwise make every stored recipe differ from the one that produced it.
const comparable = recipe => _.omit(JSON.parse(JSON.stringify(recipe)), ['projectId', 'revision'])
