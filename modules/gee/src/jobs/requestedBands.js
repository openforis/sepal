import {map, of, switchMap} from 'rxjs'

import {requireExecutable$} from '#gee/jobs/executionReadiness'
import {loadRecipe$} from '#sepal/ee/recipe'
import {unsupportedClassifiedOutput} from '#sepal/ee/timeSeries/classifiedOutputRefusal'
import {isClassifiedOutput, requestStages, unprovidedClassifiedOutputs} from '#sepal/recipe/classifiedOutputs'

// What a request reading bands of a recipe's collection is held to before anything of it is built:
//   1. `operation` over `recipe`, as its type declares it: every finding of its own configuration first, a configured
//      classified band's training included;
//   2. the outputs the request names (`requested`) being ones the Classification provides - refused as the collection
//      refuses them (lib/js/ee/src/timeSeries/collection.js), a client's error;
//   3. the stages the bands the operation builds (`effective`, as the code building them derives them) add
//      (requestStages): classifying the collection, judged without the recipe's AOI, which training does not read.
// A request building only bands of the images runs the first alone. Establishing readiness may itself read Earth
// Engine - its evidence - but nothing of the request is computed and nothing trained.
export const requireRequestedBands$ = ({recipe, operation, requested, effective}) =>
    requireExecutable$({recipe, operation}).pipe(
        switchMap(() => requireRequestStages$({recipe, requested, effective}))
    )

// The second and third alone, for a request whose own operation is judged otherwise - a download, by the recipe's
// image output it is held to (task/export/imageOutput.js) - and judged first.
export const requireRequestStages$ = ({recipe, requested, effective}) => {
    const stages = requestStages(effective)
    return (stages.length ? provided$(recipe, requested) : of(undefined)).pipe(
        switchMap(() => stages.reduce(
            (judged$, stage) => judged$.pipe(switchMap(() => requireExecutable$({recipe: withoutAoi(recipe), operation: stage}))),
            of(undefined)
        ))
    )
}

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

const withoutAoi = ({model: {aoi: _aoi, ...model}, ...recipe}) => ({...recipe, model})
