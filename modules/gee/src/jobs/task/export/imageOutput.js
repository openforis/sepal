import {map, switchMap, throwError} from 'rxjs'

import {INVALID, READY, settledImageOutput$} from '#sepal/recipe/output/observeImageOutput'
import {dependencyValidity, VALID} from '#sepal/recipe/source/dependencyValidity'

import {dependencyError, imageOutputAcquisition, readinessError, recipeClosure$} from '../../executionReadiness.js'

// Resolved from the recipe being exported, never accepted from the submitter. A failed read, an incomplete closure, a
// malformed declaration or a recipe producing no image fails the export.
//
// The description reads only the dependencies its providers need, so it cannot stand for whether the recipe may
// run. A closure whose dependencies are not structurally sound fails the export before anything is described,
// whether or not the description would have read the broken part; and an output that cannot run - its own
// configuration, or any recipe whose image running it builds, failing a requirement (readiness.js) - fails it too.
// The image is built beside this check, so a refused export may already have started Earth Engine work.

export const resolveImageOutput$ = recipe =>
    describe$(recipe)

// Only the bands the export names. An export naming none builds whatever its producer builds by default, which the
// available bands do not describe.
export const selectedBandEncoding = (description, selectedBandNames) => {
    const byName = new Map(description.output.bands.map(band => [band.name, band]))
    return (selectedBandNames || []).map(name => byName.get(name)).filter(band => band)
}

const describe$ = recipe => recipeClosure$(recipe).pipe(
    switchMap(closure => {
        const validity = dependencyValidity(closure)
        return validity.status === VALID
            ? settledImageOutput$({graph: closure.graph, ...imageOutputAcquisition})
            : throwError(() => dependencyError(recipe, validity))
    }),
    map(({status, description, diagnostics, error, readiness}) => {
        if (status !== READY) {
            throw outputError(recipe, {status, diagnostics, error})
        }
        if (readiness.status !== READY) {
            throw readinessError(recipe, readiness)
        }
        return description
    })
)

// A provider that faulted is diagnosed by the error it threw and nothing else, so what the state carries
// decides what the failure can name.
const outputError = (recipe, {status, diagnostics, error}) => {
    const outcome = status === INVALID ? 'invalid output' : 'unavailable output'
    const cause = diagnostics.length
        ? `${outcome} (${diagnostics.map(({code}) => code).join(', ')})`
        : error ? `${outcome}: ${error.message}` : outcome
    return new Error(`Could not describe the output of recipe ${recipe.id}: ${cause}`, {cause: error})
}
