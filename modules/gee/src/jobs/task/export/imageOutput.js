import {catchError, defer, filter, map, switchMap, take, tap, throwError} from 'rxjs'

import {assetBandEvidence$, imageBandEvidence$} from '#sepal/ee/bandEvidence'
import ImageFactory from '#sepal/ee/imageFactory'
import {loadRecipe$} from '#sepal/ee/recipe'
import {INVALID, READY, settledImageOutput$} from '#sepal/recipe/output/observeImageOutput'
import {AVAILABLE_BANDS} from '#sepal/recipe/output/provider'
import {recipeType} from '#sepal/recipe/recipeTypeRegistry'
import {
    completeRecipeClosure$,
    DEFAULT_RECIPE_CLOSURE_LIMITS
} from '#sepal/recipe/source/completeRecipeClosure'
import {dependencyValidity, INVALID as INVALID_DEPENDENCIES, VALID} from '#sepal/recipe/source/dependencyValidity'
import {createLoadRecipesById$} from '#sepal/recipe/source/recipeClosureLoader'
import {ASSET} from '#sepal/recipe/source/reference'

// Resolved from the recipe being exported, never accepted from the submitter. A failed read, an incomplete closure, a
// malformed declaration or a recipe producing no image fails the export.
//
// The description reads only the dependencies its providers need, so it cannot stand for whether the recipe may
// run. A closure whose dependencies are not structurally sound fails the export before anything is described,
// whether or not the description would have read the broken part.

export const resolveImageOutput$ = recipe =>
    describe$(recipe)

// Only the bands the export names. An export naming none builds whatever its producer builds by default, which the
// available bands do not describe.
export const selectedBandEncoding = (description, selectedBandNames) => {
    const byName = new Map(description.output.bands.map(band => [band.name, band]))
    return (selectedBandNames || []).map(name => byName.get(name)).filter(band => band)
}

const describe$ = recipe => closure$(recipe).pipe(
    switchMap(closure => {
        const validity = dependencyValidity(closure)
        return validity.status === VALID
            ? settledImageOutput$({graph: closure.graph, ...acquisition})
            : throwError(() => dependencyError(recipe, validity))
    }),
    map(({status, description, diagnostics, error}) => {
        if (status === READY) {
            return description
        }
        throw outputError(recipe, {status, diagnostics, error})
    })
)

// Unseeded, so the description is built only from this operation's own reads. A failure stays the failure it
// was; what the closure had already established about its dependencies is named beside it.
const closure$ = recipe => defer(() => {
    let failed = null
    return completeRecipeClosure$({
        rootRecipe: recipe,
        seedRecipesById: new Map(),
        loadRecipesById$: createLoadRecipesById$({loadRecipe$}),
        limits: DEFAULT_RECIPE_CLOSURE_LIMITS
    }).pipe(
        tap(state => {
            if (state.status === 'FAILED') {
                failed = state
            }
        }),
        filter(({status}) => status === 'COMPLETE'),
        take(1),
        catchError(error => throwError(() => closureError(recipe, failed, error)))
    )
})

// This runtime builds the image itself rather than asking a service for its bands, and an asset is read with
// its stored encoding. A producer asked what it can be asked for answers from its own catalogue, which costs
// no image and no evaluation; its physical facts come from the declaration that asked.
const acquisition = {
    observeBands$: ({reference, recipe, observes}) => reference.type === ASSET
        ? assetBandEvidence$(reference.id)
        : observes === AVAILABLE_BANDS
            ? ImageFactory(recipe).getBands$().pipe(map(bandNames => bandNames.map(name => ({name}))))
            : imageBandEvidence$(recipe),
    declarationFor: recipe => recipeType(recipe.type)?.imageOutput
}

const codesOf = diagnostics => diagnostics.map(({code}) => code).join(', ')

const dependencyError = (recipe, {status, diagnostics}) =>
    new Error(`Recipe ${recipe.id} cannot run: its dependencies are ${status.toLowerCase()} (${codesOf(diagnostics)})`)

// Only a failure after a definitive diagnosis gains a message of its own, naming both; any other is passed on
// untouched, and the original is always the cause.
const closureError = (recipe, failed, error) => {
    const validity = failed && dependencyValidity(failed)
    return validity?.status === INVALID_DEPENDENCIES
        ? new Error(
            `Could not read the dependencies of recipe ${recipe.id}: ${error?.message || error}; already known: ${codesOf(validity.diagnostics)}`,
            {cause: error}
        )
        : error
}

// A provider that faulted is diagnosed by the error it threw and nothing else, so what the state carries
// decides what the failure can name.
const outputError = (recipe, {status, diagnostics, error}) => {
    const outcome = status === INVALID ? 'invalid output' : 'unavailable output'
    const cause = diagnostics.length
        ? `${outcome} (${diagnostics.map(({code}) => code).join(', ')})`
        : error ? `${outcome}: ${error.message}` : outcome
    return new Error(`Could not describe the output of recipe ${recipe.id}: ${cause}`, {cause: error})
}
