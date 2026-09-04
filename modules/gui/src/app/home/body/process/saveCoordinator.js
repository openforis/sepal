import _ from 'lodash'

const MAX_ATTEMPTS = 3
const CONFLICT = 412

// Serializes saves per recipe and coalesces pending saves. A draft's base revision advances only from an
// acknowledgement or a coherent recipe load, which distinguish a committed write, a safe retry and a
// conflicting remote write.
export const createSaveCoordinator = ({save, loadRecipe, onOutcome = () => {}}) => {
    const states = new Map()

    const submit = recipe => {
        stateOf(recipe.id).pending = recipe
        pump(recipe.id)
    }

    // Replacing the state starts a new generation, invalidating callbacks from the previous open.
    const open = (id, revision) => states.set(id, fresh(revision))

    const forget = id => states.delete(id)

    const pump = id => {
        const state = stateOf(id)
        if (state.inFlight || state.latched || !state.pending) {
            return
        }
        const request = {recipe: state.pending, expectedRevision: state.baseRevision, attempts: 1}
        state.pending = null
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
            outcome(id, 'FAILED', {error})
            pump(id)
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
        state.inFlight = null
        state.baseRevision = revision
        outcome(id, 'SAVED', {revision})
        pump(id)
    }

    const retry = (id, state, request, cause) =>
        request.attempts < MAX_ATTEMPTS
            ? transmit(id, state, {...request, attempts: request.attempts + 1})
            : latch(id, state, 'UNRESOLVED', cause)

    const latch = (id, state, status, error) => {
        state.latched = true
        state.inFlight = null
        outcome(id, status, {error})
    }

    const outcome = (id, status, extra) => onOutcome({recipeId: id, status, ...extra})

    // State identity prevents callbacks from an earlier open or forgotten recipe from committing.
    const current = (id, state, request) => states.get(id) === state && state.inFlight === request

    const stateOf = id => states.get(id) || states.set(id, fresh()).get(id)

    const fresh = baseRevision => ({baseRevision, inFlight: null, pending: null, latched: false})

    return {save: submit, open, forget}
}

const isRevision = value => Number.isSafeInteger(value) && value > 0

const isRefusal = error => error?.status >= 400 && error?.status < 500 && error?.status !== CONFLICT

// Compare only what a save writes: JSON omits undefined, while placement and the revision are server-owned
// and would otherwise make every stored recipe differ from the one that produced it.
const comparable = recipe => _.omit(JSON.parse(JSON.stringify(recipe)), ['projectId', 'revision'])
