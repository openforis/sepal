import {catchError, defer, filter, map, switchMap, take, tap, throwError} from 'rxjs'

import {assetBandEvidence$, imageBandEvidence$} from '#sepal/ee/bandEvidence'
import ImageFactory from '#sepal/ee/imageFactory'
import {loadRecipe$} from '#sepal/ee/recipe'
import {READY, settledReadiness$} from '#sepal/recipe/output/observeImageOutput'
import {AVAILABLE_BANDS} from '#sepal/recipe/output/provider'
import {NOT_READY} from '#sepal/recipe/output/readiness'
import {recipeType} from '#sepal/recipe/recipeTypeRegistry'
import {
    completeRecipeClosure$,
    DEFAULT_RECIPE_CLOSURE_LIMITS
} from '#sepal/recipe/source/completeRecipeClosure'
import {dependencyValidity, INVALID as INVALID_DEPENDENCIES, VALID} from '#sepal/recipe/source/dependencyValidity'
import {createLoadRecipesById$} from '#sepal/recipe/source/recipeClosureLoader'
import {ASSET} from '#sepal/recipe/source/reference'

// Whether an operation over a recipe can run, before anything of it is built: its dependencies sound, and what its type
// declares the operation requires met (output/readiness.js). Nothing of the recipe's own image is described; what a
// requirement asks of its inputs is read, from Earth Engine where it must be. A recipe that cannot run fails it, as do
// a failed read, an incomplete closure and an operation its type does not declare.
//
// The recipe is the one the operation runs: a caller that runs it changed - a pixel chart at the clicked point - passes
// it so changed.
export const requireExecutable$ = ({recipe, operation}) =>
    recipeClosure$(recipe).pipe(
        switchMap(closure => {
            const validity = dependencyValidity(closure)
            return validity.status === VALID
                ? settledReadiness$({graph: closure.graph, operation, ...imageOutputAcquisition})
                : throwError(() => dependencyError(recipe, validity))
        }),
        map(readiness => {
            if (readiness.status !== READY) {
                throw readinessError(recipe, readiness)
            }
        })
    )

// Unseeded, so what is established is only this operation's own reads. A failure stays the failure it was; what the
// closure had already established about its dependencies is named beside it.
export const recipeClosure$ = recipe => defer(() => {
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
export const imageOutputAcquisition = {
    observeBands$: ({reference, recipe, observes}) => reference.type === ASSET
        ? assetBandEvidence$(reference.id)
        : observes === AVAILABLE_BANDS
            ? ImageFactory(recipe).getBands$().pipe(map(bandNames => bandNames.map(name => ({name}))))
            : imageBandEvidence$(recipe),
    declarationFor: recipe => recipeType(recipe.type)?.imageOutput,
    readinessFor: recipe => recipeType(recipe.type)
}

export const dependencyError = (recipe, {status, diagnostics}) =>
    new Error(`Recipe ${recipe.id} cannot run: its dependencies are ${status.toLowerCase()} (${codesOf(diagnostics)})`)

export const readinessError = (recipe, {status, findings, failures = []}) => new Error(status === NOT_READY
    ? `Recipe ${recipe.id} cannot run: ${codesOf(findings)}`
    : `Recipe ${recipe.id} cannot run: what it needs could not be read${failures[0] ? `: ${failures[0].message}` : ''}`,
{cause: failures[0]})

const codesOf = diagnostics => diagnostics.map(({code}) => code).join(', ')

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
