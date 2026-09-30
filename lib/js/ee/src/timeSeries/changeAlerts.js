import {defer, forkJoin, map, of, shareReplay, switchMap} from 'rxjs'

import {geometryAoi} from '#sepal/ee/aoi'
import imageFactory from '#sepal/ee/imageFactory'
import {getCollection$} from '#sepal/ee/timeSeries/collection'
import {monitoringDates} from '#sepal/recipe/changeAlerts/monitoringDates'
import {mosaicRecipe} from '#sepal/recipe/changeAlerts/mosaicRecipe'
import {CHANGE_ALERT_BANDS} from '#sepal/recipe/type/changeAlerts'

import {analyzeChanges} from './changeAlertsAlgorithm.js'
import {withSegmentSource$} from './segmentSource.js'

const CHANGE_BANDS = CHANGE_ALERT_BANDS.map(({name}) => name)

// The reference supplies the pixels; whichever recipe under it produces the segments supplies the
// representation their dates are stored in and whether the monitored band can be selected on it - an
// asset-backed producer carries physical segment bands, not the band a consumer names.
const segmentSource$ = (reference, band, derive) =>
    withSegmentSource$(reference, ({dateFormat, selectableBaseBands}, buildImage) =>
        derive({dateFormat, ccdc: buildImage({selection: selectableBaseBands ? [band] : []})})
    )

// The changes are the output, answered from its declaration; a layer may instead show the mosaic a period is compared
// on, which is built around the reference's geometry and answers for itself.
const changeAlerts = (recipe, {...args} = {}) => {
    const {visualizationType} = args
    return visualizationType && visualizationType !== 'changes'
        ? collectionMosaic(recipe, args)
        : toChanges(recipe, args)
}

const collectionMosaic = (recipe, args) => {
    const delegate$ = segmentSource$(recipe.model.reference, recipe.model.sources.band, ({ccdc}) => ccdc).pipe(
        switchMap(ccdc => ccdc.getGeometry$()),
        map(aoi => toMosaic(aoi, recipe, args)),
        shareReplay({bufferSize: 1, refCount: true})
    )
    return {
        getImage$() {
            return delegate$.pipe(
                switchMap(delegate => delegate.getImage$())
            )
        },
        getBands$() {
            return delegate$.pipe(
                switchMap(delegate => delegate.getBands$())
            )
        },
        getVisParams$() {
            return delegate$.pipe(
                switchMap(delegate => delegate.getVisParams$())
            )
        },
        getGeometry$() {
            return delegate$.pipe(
                switchMap(delegate => delegate.getGeometry$())
            )
        }
    }
}

const toMosaic = (geometry, recipe, args) => {
    const mosaic = mosaicRecipe({
        model: recipe.model,
        period: args.visualizationType,
        mosaicType: args.mosaicType,
        aoi: geometryAoi(geometry)
    })
    if (!mosaic) {
        throw new Error(`Change Alerts has no mosaic for data set type: ${recipe.model.sources.dataSetType}`)
    }
    return imageFactory(mosaic, args)
}

const toChanges = (recipe, {selection: selectedBands, baseBands, outputBands} = {selection: [], baseBands: []}) => {
    const model = recipe.model
    const band = model.sources.band

    // The change bands are built together, whatever is asked for, so an operation naming its outputs is served
    // by projecting them. `selection` cannot: its value is discarded, and it only sequences the segment read.
    const project = image => outputBands?.length ? image.select(outputBands) : image

    const selectedBands$ = selectedBands && selectedBands.length
        ? of(selectedBands)
        : segmentSource$(model.reference, band, ({ccdc}) => ccdc).pipe(
            switchMap(ccdc => ccdc.getBands$())
        )

    const bands$ = selectedBands$.pipe(
        map(selectedBands => ({selectedBands, baseBands}))
    )
    const ccdc$ = bands$.pipe(
        switchMap(() => segmentSource$(model.reference, band, resolved => resolved))
    )

    const getObservations$ = (geometry, {calibrationStart, monitoringEnd}) => {
        const collectionRecipe = {model: {
            dates: {
                startDate: calibrationStart,
                endDate: monitoringEnd
            },
            sources: model.sources,
            options: model.options
        }}
        return getCollection$({
            recipe: collectionRecipe,
            geometry,
            bands: [band]
        })
    }

    return {
        getImage$: function () {
            // Only the image needs the period. Asking for the bands, or the geometry, must not fail on a
            // recipe that has not been given one yet; the image refuses it when subscribed.
            return defer(() => {
                const {monitoringEnd, monitoringStart, calibrationStart} = monitoringDates(model)
                return ccdc$.pipe(
                    switchMap(({ccdc, dateFormat}) =>
                        forkJoin({
                            segmentsImage: ccdc.getImage$(),
                            geometry: ccdc.getGeometry$()
                        }).pipe(
                            switchMap(({segmentsImage, geometry}) => getObservations$(geometry, {calibrationStart, monitoringEnd}).pipe(
                                map(collection => project(
                                    analyzeChanges({
                                        segmentsImage,
                                        dateFormat,
                                        collection,
                                        monitoringStart,
                                        band,
                                        minConfidence: recipe.model.changeAlertsOptions.minConfidence,
                                        minNumberOfChanges: recipe.model.changeAlertsOptions.minNumberOfChanges,
                                        numberOfObservations: recipe.model.changeAlertsOptions.numberOfObservations,
                                        mustBeConfirmedInMonitoring: recipe.model.changeAlertsOptions.mustBeConfirmedInMonitoring,
                                        mustBeStableBeforeChange: recipe.model.changeAlertsOptions.mustBeStableBeforeChange,
                                        mustStayChanged: recipe.model.changeAlertsOptions.mustStayChanged,
                                    }).clip(geometry)
                                ))
                            ))
                        ))
                )
            })
        },
        // The declaration's bands, read from nothing: no segment source, no geometry and no period.
        getBands$() {
            return of(CHANGE_BANDS)
        },
        getGeometry$() {
            return imageFactory(model.reference).getGeometry$()
        },

        histogramMaxPixels: model.source === 'RECIPE_REF' ? 1e3 : null
    }
}

export default changeAlerts
