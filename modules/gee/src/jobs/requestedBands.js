import {map, of, switchMap} from 'rxjs'

import {requireExecutable$} from '#gee/jobs/executionReadiness'
import {loadRecipe$} from '#sepal/ee/recipe'
import {unsupportedClassifiedOutput} from '#sepal/ee/timeSeries/classifiedOutputRefusal'
import {isClassifiedOutput, unprovidedClassifiedOutputs} from '#sepal/recipe/classifiedOutputs'
import {requestedMeasures} from '#sepal/recipe/type/ccdc'

// What a request reading bands of a recipe's collection is held to before anything of it is built:
//   1. `operation` over `recipe`, as its type declares it: every finding of its own configuration and of what it needs -
//      for a Time Series or a CCDC, the Classification its Sources select trainable, whatever bands are named;
//   2. the outputs the request names (`requested`) being ones the Classification provides - refused as the collection
//      refuses them (lib/js/ee/src/timeSeries/collection.js), a client's error.
// So a finding of the configuration, a Classification that cannot be trained included, precedes a refused output.
// Establishing readiness may itself read Earth Engine - its evidence - but nothing of the request is computed and
// nothing trained.
export const requireRequestedBands$ = ({recipe, operation, requested}) =>
    requireExecutable$({recipe, operation}).pipe(
        switchMap(() => requireProvidedOutputs$({recipe, requested}))
    )

// The second alone, for a request whose own operation is judged otherwise - a download, by the recipe's image output it
// is held to (task/export/imageOutput.js) - and judged first.
export const requireProvidedOutputs$ = ({recipe, requested}) =>
    provided$(recipe, requested)

// The second for a request for a CCDC's image, by the measures it asks it to fit (requestedMeasures). The breakpoint
// bands fitted beside them are its configuration's, judged with its image.
export const requireCcdcRequestedOutputs$ = (recipe, request) =>
    requireProvidedOutputs$({recipe, requested: requestedMeasures(request)})

// The Classification is read as the readiness read it, once per request (recipeScope.js), and its outputs judged by
// the rule its record declares them by (unprovidedClassifiedOutputs).
const provided$ = (recipe, requested) => {
    const classificationId = recipe.model.sources?.classification
    return classificationId && requested.some(isClassifiedOutput)
        ? loadRecipe$(classificationId).pipe(
            map(classification => {
                const unsupported = unprovidedClassifiedOutputs(classification, requested)
                if (unsupported.length) {
                    throw unsupportedClassifiedOutput(classificationId, unsupported)
                }
            })
        )
        : of(undefined)
}
