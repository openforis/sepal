import {Observable, Subscriber} from 'rxjs'

import {buildRecipeDependencyGraph} from './dependencyGraph.js'
import {MISSING_SOURCE} from './diagnostic.js'

export const DEFAULT_RECIPE_CLOSURE_LIMITS = Object.freeze({
    maxDepth: 16,
    maxNodes: 64,
    maxSerializedBytes: 8 * 1024 * 1024,
    maxLoadingRounds: 16,
    maxFrontierSize: 32,
    requestConcurrency: 4
})

const LIMIT_FIELDS = Object.keys(DEFAULT_RECIPE_CLOSURE_LIMITS)

const closureError = (code, message) => Object.assign(new Error(`Recipe closure: ${message}`), {code})

const validateLimits = limits => {
    if (!limits || typeof limits !== 'object' || Array.isArray(limits)) {
        throw closureError('RECIPE_CLOSURE_INVALID_LIMITS', 'limits must be an object')
    }
    LIMIT_FIELDS.forEach(field => {
        if (!Number.isInteger(limits[field]) || limits[field] <= 0) {
            throw closureError('RECIPE_CLOSURE_INVALID_LIMITS', `${field} must be a positive integer`)
        }
    })
}

const validateRecipeRecord = record => {
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
        throw closureError('RECIPE_CLOSURE_MALFORMED_RECORD', 'a recipe record must be an object')
    }
    if (typeof record.id !== 'string' || !record.id.trim()) {
        throw closureError('RECIPE_CLOSURE_MALFORMED_RECORD', 'a recipe record must have a non-blank string id')
    }
    if (typeof record.type !== 'string' || !record.type.trim()) {
        throw closureError('RECIPE_CLOSURE_MALFORMED_RECORD', 'a recipe record must have a non-blank string type')
    }
    return record
}

const serializedBytes = record => new TextEncoder().encode(JSON.stringify(record)).length

const orderedFrontier = diagnostics => {
    const seen = new Set()
    return diagnostics.reduce((frontier, diagnostic) => {
        const id = diagnostic.recipePath.at(-1)
        if (!seen.has(id)) {
            seen.add(id)
            frontier.push({id, depth: diagnostic.recipePath.length - 1})
        }
        return frontier
    }, [])
}

const validateLoadedRecords = ({records, requestedIds}) => {
    if (!Array.isArray(records)) {
        throw closureError('RECIPE_CLOSURE_MALFORMED_RESPONSE', 'loader response must be an array')
    }
    const requested = new Set(requestedIds)
    const byId = new Map()
    records.forEach(record => {
        validateRecipeRecord(record)
        if (byId.has(record.id)) {
            throw closureError('RECIPE_CLOSURE_DUPLICATE_RECORD', `loader returned ${record.id} more than once`)
        }
        if (!requested.has(record.id)) {
            throw closureError('RECIPE_CLOSURE_UNREQUESTED_RECORD', `loader returned unrequested recipe ${record.id}`)
        }
        byId.set(record.id, record)
    })
    const missing = requestedIds.find(id => !byId.has(id))
    if (missing) {
        throw closureError('RECIPE_CLOSURE_MISSING_RECORD', `loader did not return requested recipe ${missing}`)
    }
    return requestedIds.map(id => byId.get(id))
}

export const completeRecipeClosure$ = ({
    rootRecipe,
    seedRecipesById,
    loadRecipesById$,
    limits = DEFAULT_RECIPE_CLOSURE_LIMITS
}) => new Observable(subscriber => {
    let recipesById
    let currentBytes
    let loadingPublished = false
    let loadingRounds = 0

    const fail = error => {
        if (!subscriber.closed) {
            subscriber.error(error)
        }
    }

    const admit = records => {
        const nextBytes = records.reduce((total, record) => total + serializedBytes(record), currentBytes)
        if (nextBytes > limits.maxSerializedBytes) {
            throw closureError('RECIPE_CLOSURE_SERIALIZED_BYTE_LIMIT', 'serialized closure is too large')
        }
        records.forEach(record => recipesById.set(record.id, record))
        currentBytes = nextBytes
    }

    const finish = graph => {
        subscriber.next({status: 'COMPLETE', recipesById, graph})
        subscriber.complete()
    }

    const run = () => {
        if (subscriber.closed) {
            return
        }
        let graph
        try {
            graph = buildRecipeDependencyGraph({rootRecipe, recipesById})
            if (graph.recipes.length > limits.maxNodes) {
                throw closureError('RECIPE_CLOSURE_NODE_LIMIT', 'closure contains too many recipes')
            }
        } catch (error) {
            return fail(error)
        }

        const definitive = graph.diagnostics.some(({code}) => code !== MISSING_SOURCE)
        if (definitive || graph.diagnostics.length === 0) {
            return finish(graph)
        }

        try {
            const frontier = orderedFrontier(graph.diagnostics)
            if (frontier.length > limits.maxFrontierSize) {
                throw closureError('RECIPE_CLOSURE_FRONTIER_LIMIT', 'dependency frontier is too wide')
            }
            if (frontier.some(({depth}) => depth > limits.maxDepth)) {
                throw closureError('RECIPE_CLOSURE_DEPTH_LIMIT', 'dependency path is too deep')
            }
            if (recipesById.size + frontier.length > limits.maxNodes) {
                throw closureError('RECIPE_CLOSURE_NODE_LIMIT', 'closure contains too many recipes')
            }

            const seeded = []
            frontier.forEach(({id}) => {
                if (seedRecipesById.has(id)) {
                    const record = validateRecipeRecord(seedRecipesById.get(id))
                    if (record.id !== id) {
                        throw closureError('RECIPE_CLOSURE_SEED_ID_MISMATCH', `seed key ${id} does not match record id`)
                    }
                    seeded.push(record)
                }
            })
            if (seeded.length) {
                admit(seeded)
                return run()
            }

            if (loadingRounds >= limits.maxLoadingRounds) {
                throw closureError('RECIPE_CLOSURE_LOADING_ROUND_LIMIT', 'too many authenticated loading rounds')
            }
            loadingRounds++
            if (!loadingPublished) {
                loadingPublished = true
                subscriber.next({status: 'LOADING'})
                if (subscriber.closed) {
                    return
                }
            }

            const ids = frontier.map(({id}) => id)
            let response
            let responseCount = 0
            const loaderSubscriber = new Subscriber({
                next: records => {
                    response = records
                    responseCount++
                },
                error: fail,
                complete: () => {
                    if (subscriber.closed) {
                        return
                    }
                    try {
                        if (responseCount !== 1) {
                            throw closureError('RECIPE_CLOSURE_MALFORMED_RESPONSE', 'loader must emit one response')
                        }
                        admit(validateLoadedRecords({records: response, requestedIds: ids}))
                        run()
                    } catch (error) {
                        fail(error)
                    }
                }
            })
            subscriber.add(loaderSubscriber)
            loadRecipesById$({ids, concurrency: limits.requestConcurrency}).subscribe(loaderSubscriber)
        } catch (error) {
            fail(error)
        }
    }

    try {
        validateLimits(limits)
        if (!(seedRecipesById instanceof Map)) {
            throw closureError('RECIPE_CLOSURE_MALFORMED_RESPONSE', 'seedRecipesById must be a Map')
        }
        validateRecipeRecord(rootRecipe)
        recipesById = new Map([[rootRecipe.id, rootRecipe]])
        currentBytes = 0
        admit([rootRecipe])
        run()
    } catch (error) {
        fail(error)
    }
})
