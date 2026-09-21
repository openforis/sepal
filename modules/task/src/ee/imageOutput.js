import {filter, map, of, switchMap, take} from 'rxjs'

import {assetBandEvidence, typedBands} from '#sepal/ee/bandEvidence'
import ee from '#sepal/ee/ee'
import ImageFactory from '#sepal/ee/imageFactory'
import {loadRecipe$} from '#sepal/ee/recipe'
import {bandsWithEncoding, encodingPropertyKeys} from '#sepal/recipe/output/bandEncoding'
import {isUndeclaredOutputOnly} from '#sepal/recipe/output/diagnostic'
import {INVALID, READY, settledImageOutput$} from '#sepal/recipe/output/observeImageOutput'
import {AVAILABLE_BANDS} from '#sepal/recipe/output/provider'
import {recipeType} from '#sepal/recipe/recipeTypeRegistry'
import {
    completeRecipeClosure$,
    DEFAULT_RECIPE_CLOSURE_LIMITS
} from '#sepal/recipe/source/completeRecipeClosure'
import {createLoadRecipesById$} from '#sepal/recipe/source/recipeClosureLoader'
import {ASSET} from '#sepal/recipe/source/reference'

// Resolved from the recipe being exported, never accepted from the submitter. An undeclared output is unknown; a
// failed read, an incomplete closure or a malformed declaration fails the export.

export const resolveImageOutput$ = recipe =>
    recipeType(recipe.type)?.imageOutput
        ? describe$(recipe)
        : of(null)

// Only the bands the export names. An export naming none builds whatever its producer builds by default, which the
// available bands do not describe.
export const selectedBandEncoding = (description, selectedBandNames) => {
    if (!description) {
        return []
    }
    const byName = new Map(description.output.bands.map(band => [band.name, band]))
    return (selectedBandNames || []).map(name => byName.get(name)).filter(band => band)
}

const describe$ = recipe => closure$(recipe).pipe(
    switchMap(graph => settledImageOutput$({graph, ...acquisition})),
    map(({status, description, diagnostics, error}) => {
        if (status === READY) {
            return description
        }
        if (isUndeclaredOutputOnly(diagnostics)) {
            return null
        }
        throw outputError(recipe, {status, diagnostics, error})
    })
)

// Unseeded, so the description is built only from this operation's own reads.
const closure$ = recipe => completeRecipeClosure$({
    rootRecipe: recipe,
    seedRecipesById: new Map(),
    loadRecipesById$: createLoadRecipesById$({loadRecipe$}),
    limits: DEFAULT_RECIPE_CLOSURE_LIMITS
}).pipe(
    filter(({status}) => status === 'COMPLETE'),
    take(1),
    map(({graph}) => graph)
)

// This runtime builds the image itself rather than asking a service for its bands, and an asset is read with
// its stored encoding. A producer asked what it can be asked for answers from its own catalogue, which costs
// no image and no evaluation; its physical facts come from the declaration that asked.
const acquisition = {
    observeBands$: ({reference, recipe, observes}) => reference.type === ASSET
        ? assetEvidence$(reference.id)
        : observes === AVAILABLE_BANDS
            ? ImageFactory(recipe).getBands$().pipe(map(bandNames => bandNames.map(name => ({name}))))
            : ImageFactory(recipe).getImage$().pipe(
                switchMap(image => ee.getInfo$(typedBands(image), 'image band evidence'))
            ),
    declarationFor: recipe => recipeType(recipe.type)?.imageOutput
}

const assetEvidence$ = id => ImageFactory({type: ASSET, id}).getImage$().pipe(
    switchMap(image => ee.getInfo$(
        assetBandEvidence(image, {encodingProperties: encodingPropertyKeys()}),
        'asset band evidence'
    )),
    map(({bands, encoding}) => bandsWithEncoding(bands, encoding))
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
