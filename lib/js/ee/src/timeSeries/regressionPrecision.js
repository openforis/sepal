import {AsyncLocalStorage} from 'node:async_hooks'

import {map, Observable} from 'rxjs'

import {collectionRegressionEncoding} from '#sepal/recipe/classifiedOutputs'

const storage = new AsyncLocalStorage()

// Export compatibility follows collections actually built, including nested inputs, not a saved model's band names.
export const recordRegressionPrecision = dataSets =>
    storage.getStore()?.add(1 / collectionRegressionEncoding({sources: {dataSets}}).scale)

export const withRegressionPrecision$ = image$ => new Observable(subscriber => {
    const scales = new Set()
    return storage.run(scales, () => image$.pipe(
        map(image => ({image, regressionPrecision: scales.size ? JSON.stringify({version: 1, scales: [...scales].sort((a, b) => a - b)}) : null}))
    ).subscribe(subscriber))
})
