import {catchError, defer, from, map, mergeMap, Observable, throwError, toArray} from 'rxjs'

// The reader is injected because each runtime reads with its own authority. It must answer each id with exactly
// one record for that id.
//
// A record that could not be read fails the request at once, the other reads cancelled, with an error naming it
// (`recipeId`), its own failure the cause, its `status` and `code` carried. Only that record's failure is known: a
// record whose read was cancelled is not known missing, even where storage would have answered so.

export const createLoadRecipesById$ = ({loadRecipe$} = {}) =>
    ({ids, concurrency}) => defer(() => from(ids.map((id, index) => ({id, index}))).pipe(
        mergeMap(({id, index}) => defer(() => loadOne$({id, loadRecipe$})).pipe(
            map(record => ({index, record})),
            catchError(error => throwError(() => failureOf(id, error)))
        ), concurrency),
        toArray(),
        map(records => records
            .sort((a, b) => a.index - b.index)
            .map(({record}) => record))
    ))

const failureOf = (id, error) => Object.assign(new Error(error?.message || String(error), {cause: error}), {
    recipeId: id,
    ...(error?.status === undefined ? {} : {status: error.status}),
    ...(error?.code === undefined ? {} : {code: error.code})
})

const loadOne$ = ({id, loadRecipe$}) => new Observable(subscriber => {
    let record
    let seen = false
    const request = loadRecipe$(id).subscribe({
        next: response => {
            if (seen) {
                subscriber.error(loaderError('RECIPE_CLOSURE_DUPLICATE_RECORD', `multiple records returned for ${id}`))
            } else {
                seen = true
                record = response
            }
        },
        error: error => subscriber.error(error),
        complete: () => {
            if (!seen) {
                subscriber.error(loaderError('RECIPE_CLOSURE_MISSING_RECORD', `no record returned for ${id}`))
            } else {
                try {
                    subscriber.next(validateResponse({id, record}))
                    subscriber.complete()
                } catch (error) {
                    subscriber.error(error)
                }
            }
        }
    })
    return () => request.unsubscribe()
})

const validateResponse = ({id, record}) => {
    if (!record || typeof record !== 'object' || Array.isArray(record)
        || typeof record.id !== 'string' || !record.id.trim()) {
        throw loaderError('RECIPE_CLOSURE_MALFORMED_RECORD', `invalid record returned for ${id}`)
    }
    if (record.id !== id) {
        throw loaderError('RECIPE_CLOSURE_MISMATCHED_RECORD', `requested ${id}, received ${record.id}`)
    }
    return record
}

const loaderError = (code, message) => Object.assign(new Error(`Recipe closure loader: ${message}`), {code})
