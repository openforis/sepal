import {filter, map, of, switchMap, take, throwError} from 'rxjs'

import {OPTICAL_COLLECTION_DEFAULTS} from '#sepal/recipe/capability/opticalCollectionDefaults'
import {
    completeRecipeClosure$,
    DEFAULT_RECIPE_CLOSURE_LIMITS
} from '#sepal/recipe/source/completeRecipeClosure'
import {ASSET} from '#sepal/recipe/source/reference'
import {getDataSetBands} from '~/app/home/body/process/recipe/opticalMosaic/sources'
import {getRecipeType} from '~/app/home/body/process/recipeTypeRegistry'
import {selectFrom} from '~/stateUtils'

import {createLoadRecipesById$} from '../../sourceRuntime/recipeClosureLoader'
import {resolveProvider, UNSUPPORTED} from '../sourceProvider'

// What PyEO Alerts can learn about the imagery a classification was trained on.
//
// Two independent answers. `bands` limits the index gate and is wanted whenever a classification is in
// hand; `defaults` is the collection configuration a user's new selection fills the panels from, and is
// asked for only then. A source that declares no optical collection still answers about its bands - it is
// configured by hand, not rejected - so only a failure to RESOLVE the imagery propagates.
//
// One-shot. Nothing here watches, caches or writes: the panel decides what to stage and when to commit.

export const SELECTED_SCENES = 'SELECTED_SCENES'
export const NOT_DERIVABLE = 'NOT_DERIVABLE'

//   {bands, defaults: {sources, options, start, end} | null, restriction: SELECTED_SCENES | NOT_DERIVABLE | null}
export const readInputImagery$ = (reference, {loadRecipe$, loadedRecipes, assetMetadata$}, {defaults} = {}) =>
    reference?.type === ASSET
        ? fromAsset$(reference.id, {assetMetadata$}, defaults)
        : producer$(reference, {loadRecipe$, loadedRecipes}).pipe(
            switchMap(producer => fromProducer$(producer, {assetMetadata$}, defaults))
        )

// The closure of the SELECTED IMAGERY, rooted at the record the classification names. The classification's
// own training data is not imagery, and a training recipe it can no longer resolve says nothing about the
// imagery it was trained on.
const producer$ = (reference, {loadRecipe$, loadedRecipes}) =>
    loadRecipe$(reference.id).pipe(
        switchMap(rootRecipe => completeRecipeClosure$({
            rootRecipe,
            seedRecipesById: new Map(Object.entries(loadedRecipes || {})),
            loadRecipesById$: createLoadRecipesById$({loadRecipe$}),
            limits: DEFAULT_RECIPE_CLOSURE_LIMITS
        })),
        filter(({status}) => status === 'COMPLETE'),
        take(1),
        map(({graph, recipesById}) => {
            if (graph.diagnostics.length) {
                throw new Error(`Unresolved imagery: ${graph.diagnostics[0].code}`)
            }
            return resolveProvider(reference, recipesById, OPTICAL_COLLECTION_DEFAULTS)
        })
    )

const fromProducer$ = ({record, declared, assetId, error}, {assetMetadata$}, defaults) => {
    // A producer that declares no optical collection is the one case a consumer answers for itself. Every
    // other way the walk can end is a source that could not be read.
    if (error && error.reason !== UNSUPPORTED) {
        return throwError(() => error)
    }
    // Either the walk ended on an asset, or it ended on a recipe whose declaration names one.
    const asset = assetId !== undefined ? assetId : declared?.defaultsAsset?.(record.model) ?? null
    if (asset) {
        return fromAsset$(asset, {assetMetadata$}, defaults)
    }
    const producer = record || error.record
    return of({
        bands: bandsOf(producer),
        ...(defaults ? recipeDefaults(producer, !!record) : NOTHING_PROPOSED)
    })
}

// One read answers both: the bands an exported mosaic carries, and the configuration it was built with.
const fromAsset$ = (assetId, {assetMetadata$}, defaults) =>
    assetMetadata$({asset: assetId}).pipe(
        map(metadata => ({
            bands: metadata?.bandNames || undefined,
            ...(defaults ? assetDefaults(metadata) : NOTHING_PROPOSED)
        }))
    )

const NOTHING_PROPOSED = {defaults: null, restriction: null}

const notDerivable = {defaults: null, restriction: NOT_DERIVABLE}

// A record answers about its bands whether or not it states a collection to derive defaults from.
const bandsOf = record => {
    const dataSets = selectFrom(record, 'model.sources.dataSets')
    return dataSets ? getDataSetBands(record) : undefined
}

const recipeDefaults = (record, declaredProducer) => {
    if (!declaredProducer) {
        return notDerivable
    }
    // Hand-picked scenes are not a window a monitoring period can follow from.
    if (record.model?.sceneSelectionOptions?.type === 'SELECT') {
        return {defaults: null, restriction: SELECTED_SCENES}
    }
    const [start, end] = getRecipeType(record.type).getDateRange(record)
    return {
        defaults: {
            sources: record.model.sources,
            options: record.model.compositeOptions || record.model.options,
            start,
            end
        },
        restriction: null
    }
}

const assetDefaults = metadata => {
    const properties = metadata?.properties || {}
    const start = properties['system:time_start']
    const end = properties['system:time_end']
    const sources = parsed(properties.recipe_sources)
    const options = parsed(properties.recipe_compositeOptions || properties.recipe_options)
    return sources && options && start !== undefined && end !== undefined
        ? {defaults: {sources, options, start, end}, restriction: null}
        : notDerivable
}

// A property that is not the JSON it claims to be leaves the configuration underivable; it does not unsay
// the band names read from the same response.
const parsed = value => {
    try {
        return value ? JSON.parse(value) : null
    } catch (_error) {
        return null
    }
}
