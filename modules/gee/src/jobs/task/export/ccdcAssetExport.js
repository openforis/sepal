import {forkJoin, map, switchMap} from 'rxjs'

import {requireCcdcRequestedOutputs$} from '#gee/jobs/requestedBands'
import ccdc from '#sepal/ee/timeSeries/ccdc'
import {formatProperties} from '#sepal/formatProperties'
import {processingOfProducer} from '#sepal/recipe/changeAlerts/processing'
import ccdcType from '#sepal/recipe/type/ccdc'

import {resolveImageOutput$} from './imageOutput.js'
import {startImageToAssetExport$} from './toAsset.js'
import {toVisualizationProperties} from './visualizations.js'

export const startCcdcAssetExport$ = params =>
    ccdcAssetSource$(params).pipe(
        switchMap(startImageToAssetExport$)
    )

// Every CCDC Segments export passes here, so here it is held to what the image output of a CCDC requires (imageOutput.js),
// then to the measures it names (requireCcdcRequestedOutputs$) - judged as a CCDC whatever type the recipe states, since
// its segments are built as a CCDC's: only a recipe that can run as one has its segments built. Establishing that may
// itself read Earth Engine - the closure, and the evidence its requirements need - and its failures are passed on as
// they are.
export const ccdcAssetSource$ = ({image, description}) => {
    const {recipe, bands, scale, visualizations, properties, ...other} = image
    const built = {...recipe, type: ccdcType.type}
    return resolveImageOutput$(built).pipe(
        switchMap(() => requireCcdcRequestedOutputs$(built, {selection: bands})),
        switchMap(() => {
            const segments = ccdc(recipe, {selection: bands})
            return forkJoin({
                segments: segments.getImage$(),
                geometry: segments.getGeometry$()
            })
        }),
        map(({segments, geometry}) => {
            const formattedProperties = formatProperties({...properties, scale})
            const allBands = getAllBands(bands)
            return {
                ...other,
                description,
                image: segments,
                region: geometry.bounds(),
                scale,
                pyramidingPolicy: {'.default': 'sample'},
                maxPixels: 1e13,
                properties: {
                    formattedProperties,
                    processing: JSON.stringify(processingOfProducer(built.model).record),
                    startDate: recipe.model.dates.startDate,
                    endDate: recipe.model.dates.endDate,
                    dateFormat: recipe.model.ccdcOptions.dateFormat,
                    surfaceReflectance: recipe.model.options.corrections?.includes('SR') && 1,
                    ...toVisualizationProperties(visualizations, {selection: allBands})
                }
            }
        })
    )
}

const getAllBands = bands => {
    const rmse = bands.map(band => `${band}_rmse`)
    const magnitude = bands.map(band => `${band}_magnitude`)
    const intercept = bands.map(band => `${band}_intercept`)
    const slope = bands.map(band => `${band}_slope`)
    const phase1 = bands.map(band => `${band}_phase_1`)
    const amplitude1 = bands.map(band => `${band}_amplitude_1`)
    const phase2 = bands.map(band => `${band}_phase_2`)
    const amplitude2 = bands.map(band => `${band}_amplitude_2`)
    const phase3 = bands.map(band => `${band}_phase_3`)
    const amplitude3 = bands.map(band => `${band}_amplitude_3`)
    const segmentBands = ['tStart', 'tEnd', 'tBreak', 'numObs', 'changeProb']
    return [
        ...bands,
        ...rmse,
        ...magnitude,
        ...intercept,
        ...slope,
        ...phase1,
        ...amplitude1,
        ...phase2,
        ...amplitude2,
        ...phase3,
        ...amplitude3,
        ...segmentBands
    ]
}
