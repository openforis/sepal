import {defer, from, map, mergeMap, Observable, toArray} from 'rxjs'

// The reader is injected because each runtime reads with its own authority. It must answer each id with exactly
// one record for that id.

export const createLoadRecipesById$ = ({loadRecipe$} = {}) =>
    ({ids, concurrency}) => defer(() => from(ids.map((id, index) => ({id, index}))).pipe(
        mergeMap(({id, index}) => defer(() => loadOne$({id, loadRecipe$})).pipe(
            map(record => ({index, record}))
        ), concurrency),
        toArray(),
        map(records => records
            .sort((a, b) => a.index - b.index)
            .map(({record}) => record))
    ))

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
