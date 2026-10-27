import {map, of, switchMap, throwError} from 'rxjs'

import {requireCcdcRequestedOutputs$} from '#gee/jobs/requestedBands'
import {CCDC_SEGMENTS} from '#sepal/recipe/capability/ccdcSegments'
import {discoverProvider, FOUND} from '#sepal/recipe/capability/discoverProvider'
import {processingOfProducer} from '#sepal/recipe/changeAlerts/processing'
import {INVALID, READY, settledImageOutput$} from '#sepal/recipe/output/observeImageOutput'
import {dependencyValidity, VALID} from '#sepal/recipe/source/dependencyValidity'
import ccdcType from '#sepal/recipe/type/ccdc'

import {dependencyError, imageOutputAcquisition, readinessError, recipeClosure$} from '../../executionReadiness.js'

// Resolved from the recipe being exported, never accepted from the submitter. A failed read, an incomplete closure, a
// malformed declaration or a recipe producing no image fails the export.
//
// The description reads only the dependencies its providers need, so it cannot stand for whether the recipe may
// run. A closure whose dependencies are not structurally sound fails the export before anything is described,
// whether or not the description would have read the broken part; and an output that cannot run - its own
// configuration, or any recipe whose image running it builds, failing a requirement (readiness.js) - fails it too.
// Asset exports construct their product only after this check passes (imageAssetExport.js); evidence needed to
// establish readiness is distinct from the product being exported.

export const resolveImageOutput$ = recipe =>
    describe$(recipe)

// The image output, then what the bands the image is to be built with (`request`) add: for a direct CCDC, the measures
// they ask it to fit, each one its Classification provides (requireCcdcRequestedOutputs$) - a capability refused as a
// client's error. Its Classification's training is the image output's, judged first. Nothing of the image is built for it.
export const resolveRequestedImageOutput$ = (recipe, request) =>
    resolveImageOutput$(recipe).pipe(
        switchMap(imageOutput => judgesRequest(recipe)
            ? requireCcdcRequestedOutputs$(recipe, request).pipe(map(() => imageOutput))
            : of(imageOutput)
        )
    )

// Whether the bands a recipe's image is requested with can ask more of its sources than its image output does.
export const judgesRequest = recipe => recipe.type === ccdcType.type

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
            ? settledImageOutput$({graph: closure.graph, ...imageOutputAcquisition}).pipe(
                map(result => ({...result, processing: executedProcessing(recipe, closure.graph)}))
            )
            : throwError(() => dependencyError(recipe, validity))
    }),
    map(({status, description, diagnostics, error, readiness, processing}) => {
        if (status !== READY) {
            throw outputError(recipe, {status, diagnostics, error})
        }
        if (readiness.status !== READY) {
            throw readinessError(recipe, readiness)
        }
        return processing ? {...description, ...processing} : description
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

// Only the declared computing segment producer can establish a complete processing record. Wrappers retain that
// producer's values; unrelated outputs and assets of unknown provenance acquire no invented processing metadata.
const executedProcessing = (recipe, graph) => {
    const records = new Map(graph.recipes.map(record => [record.id, record]))
    const {status, provider} = discoverProvider({type: 'RECIPE_REF', id: recipe.id}, records, CCDC_SEGMENTS)
    return status === FOUND && provider.record && !provider.declared.segmentsAsset
        ? {processing: processingOfProducer(provider.record.model).record, segmentDateFormat: provider.declared.dateFormat?.(provider.record.model)} : null
}
