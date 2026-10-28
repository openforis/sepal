import {defer, throwError} from 'rxjs'

import {currentRecipeScope} from './recipeScope.js'

// The GeoID service's feature for a GeoID, read through the execution operation in progress - which owns the
// reader, and shares a lookup between everything in the operation that resolves the same GeoID.
export const loadGeoIdFeature$ = geoId => defer(() => {
    const scope = currentRecipeScope()
    return scope
        ? scope.geoIdFeature$(geoId)
        : throwError(() => new Error(`No execution operation in progress; cannot resolve GeoID: ${geoId}`))
})
