import {NEVER, of} from 'rxjs'

import {assetProcessing} from '#sepal/recipe/changeAlerts/processing'
import {buildRecipeDependencyGraph} from '#sepal/recipe/source/dependencyGraph'
import {dependencyValidity} from '#sepal/recipe/source/dependencyValidity'

import {typedSegmentsAssetDescription} from '../ccdc/segmentsAsset'
import {createRecipeImageOutputObserver} from '../imageOutputObserver'
import {sourceKeyOf} from '../sourceEvidence'

// A Change Alerts reference to a segments asset as the source runtime establishes it, for tests that read a recipe
// without running the runtime: what its observation publishes, and what its DESCRIBE answers. Each is derived by the
// production code that derives it, from one metadata answer; nothing here states a verdict.

// A segments asset's metadata as Earth Engine answers for it, fitted for `band`.
export const segmentsAssetMetadata = ({band, properties = {dateFormat: 1, surfaceReflectance: 1}}) => {
    const bands = [['tStart', 1], ['tEnd', 1], [`${band}_coefs`, 2], [`${band}_rmse`, 1]]
    return {
        type: 'Image',
        bandNames: bands.map(([name]) => name),
        bands: bands.map(([id, dimensions]) => ({id, dimensions: [5015, 3093], data_type: {type: 'PixelType', precision: 'double', dimensions}})),
        properties
    }
}

// The evidence the observation publishes for the asset selected as `reference` (referenceObservation.js): its segments
// and its processing, both from the same metadata.
export const observedSegmentsAsset = (reference, metadata) => ({
    status: 'OBSERVED',
    sourceKey: sourceKeyOf(reference),
    segments: typedSegmentsAssetDescription(metadata, {assetId: reference.id}),
    processing: assetProcessing(metadata.properties)
})

// What the source runtime's DESCRIBE answers once Earth Engine has described what the read observes: the real observer
// over the closure the session holds, Earth Engine describing each segments asset as the records' evidence already
// describes it, and that closure's validity. A read observing anything else is answered nothing, as it is before Earth
// Engine answers.
export const describedByRuntime = records => {
    const assetBands = Object.fromEntries(records.flatMap(record => {
        const typed = record.ui?.sourceEvidence?.segments?.typedBands
        return typed ? [[typed.assetId, typed.bands]] : []
    }))
    if (!Object.keys(assetBands).length) {
        return null
    }
    const graph = buildRecipeDependencyGraph({rootRecipe: records[0], recipesById: new Map(records.map(record => [record.id, record]))})
    let answered = true
    const observer = createRecipeImageOutputObserver({
        observeBands$: ({reference}) => {
            const bands = reference.type === 'ASSET' && assetBands[reference.id]
            answered = answered && Boolean(bands)
            return bands ? of(bands) : NEVER
        }
    })
    let latest = null
    const states = observer.state$.subscribe(state => latest = state)
    observer.observe({graph})
    states.unsubscribe()
    observer.cancel()
    return answered && latest ? {...latest, dependencyValidity: dependencyValidity({status: 'COMPLETE', graph})} : null
}
