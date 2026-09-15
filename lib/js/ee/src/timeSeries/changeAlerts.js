import _ from 'lodash'
import moment from 'moment'
import {forkJoin, map, of, shareReplay, switchMap} from 'rxjs'

import {geometryAoi} from '#sepal/ee/aoi'
import imageFactory from '#sepal/ee/imageFactory'
import {getCollection$} from '#sepal/ee/timeSeries/collection'

import {analyzeChanges} from './changeAlertsAlgorithm.js'
import {withSegmentSource$} from './segmentSource.js'

const DATE_FORMAT = 'YYYY-MM-DD'

// The reference supplies the pixels; whichever recipe under it produces the segments supplies the
// representation their dates are stored in and whether the monitored band can be selected on it - an
// asset-backed producer carries physical segment bands, not the band a consumer names.
const segmentSource$ = (reference, band, derive) =>
    withSegmentSource$(reference, ({dateFormat, selectableBaseBands}, buildImage) =>
        derive({dateFormat, ccdc: buildImage({selection: selectableBaseBands ? [band] : []})})
    )

const changeAlerts = (recipe, {...args} = {}) => {
    const aoi$ = segmentSource$(recipe.model.reference, recipe.model.sources.band, ({ccdc}) => ccdc).pipe(
        switchMap(ccdc => ccdc.getGeometry$())
    )
    const {visualizationType} = args
    const delegate$ = aoi$.pipe(
        map(aoi => visualizationType && visualizationType !== 'changes'
            ? toMosaic(aoi, recipe, args)
            : toChanges(recipe, args)
        ),
        shareReplay({bufferSize: 1, refCount: true})
    )
    return {
        getImage$() {
            return delegate$.pipe(
                switchMap(delegate => delegate.getImage$()),
                map(image => image),
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
    const aoi = geometryAoi(geometry)
    const dataSetType = recipe.model.sources.dataSetType
    const recipes = {
        OPTICAL: () => opticalRecipe(aoi, recipe, args),
        RADAR: () => radarRecipe(aoi, recipe, args),
        PLANET: () => planetRecipe(aoi, recipe, args)
    }
    const mosaicRecipe = recipes[dataSetType]()
    return imageFactory(mosaicRecipe, args)
}

const opticalRecipe = (aoi, recipe, {visualizationType, mosaicType}) => {
    const {monitoringEnd, monitoringStart, calibrationStart} = toDates(recipe)
    return {
        type: 'MOSAIC',
        model: {
            aoi,
            dates: {
                targetDate: visualizationType === 'monitoring'
                    ? monitoringEnd
                    : monitoringStart,
                seasonStart: visualizationType === 'monitoring'
                    ? monitoringStart
                    : calibrationStart,
                seasonEnd: visualizationType === 'monitoring'
                    ? monitoringEnd
                    : monitoringStart,
                yearsBefore: 0,
                yearsAfter: 0
            },
            sources: recipe.model.sources,
            sceneSelectionOptions: {
                type: 'ALL'
            },
            compositeOptions: {
                ...recipe.model.options,
                filters: [
                    {type: 'DAY_OF_YEAR', percentile: mosaicType === 'latest' ? 100 : 0}
                ],
                compose: 'MEDIAN'
            }
        }
    }
}

const radarRecipe = (aoi, recipe, {visualizationType, mosaicType}) => {
    const {monitoringEnd, monitoringStart, calibrationStart} = toDates(recipe)
    return {
        type: 'RADAR_MOSAIC',
        model: {
            aoi,
            dates: {
                targetDate: mosaicType === 'latest'
                    ? visualizationType === 'monitoring'
                        ? monitoringEnd
                        : monitoringStart
                    : undefined,
                fromDate: mosaicType === 'latest'
                    ? undefined
                    : visualizationType === 'monitoring'
                        ? monitoringStart
                        : calibrationStart,
                toDate: mosaicType === 'latest'
                    ? undefined
                    : visualizationType === 'monitoring'
                        ? monitoringEnd
                        : monitoringStart
            },
            options: {
                ...recipe.model.options
            }
        }
    }
}

const planetRecipe = (aoi, recipe, {visualizationType, mosaicType}) => {
    const {monitoringEnd, monitoringStart, calibrationStart} = toDates(recipe)
    return {
        type: 'PLANET_MOSAIC',
        model: {
            aoi,
            dates: {
                targetDate: mosaicType === 'latest'
                    ? visualizationType === 'monitoring'
                        ? monitoringEnd
                        : monitoringStart
                    : undefined,
                fromDate: visualizationType === 'monitoring'
                    ? monitoringStart
                    : calibrationStart,
                toDate: visualizationType === 'monitoring'
                    ? monitoringEnd
                    : monitoringStart
            },
            sources: {
                source: recipe.model.sources.dataSets.PLANET[0],
                assets: recipe.model.sources.assets
            },
            options: {
                ...recipe.model.options
            }
        }
    }
}

const toDates = recipe => {
    const model = recipe.model
    const monitoringEnd = model.date.monitoringEnd
    const monitoringStart = moment(monitoringEnd, DATE_FORMAT).subtract(model.date.monitoringDuration, model.date.monitoringDurationUnit).format(DATE_FORMAT)
    const calibrationStart = moment(monitoringStart, DATE_FORMAT).subtract(model.date.calibrationDuration, model.date.calibrationDurationUnit).format(DATE_FORMAT)
    return {monitoringEnd, monitoringStart, calibrationStart}
}

const toChanges = (recipe, {selection: selectedBands, baseBands} = {selection: [], baseBands: []}) => {
    const model = recipe.model
    const band = model.sources.band

    const {monitoringEnd, monitoringStart, calibrationStart} = toDates(recipe)

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

    const getObservations$ = geometry => {
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
            return ccdc$.pipe(
                switchMap(({ccdc, dateFormat}) =>
                    forkJoin({
                        segmentsImage: ccdc.getImage$(),
                        geometry: ccdc.getGeometry$()
                    }).pipe(
                        switchMap(({segmentsImage, geometry}) => getObservations$(geometry).pipe(
                            map(collection =>
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
                                }).clip(geometry))
                        ))
                    ))
            )
        },
        getBands$() {
            return of([
                'confidence',
                'difference',
                'detection_count',
                'monitoring_observation_count',
                'calibration_observation_count',
                'last_stable_date',
                'first_detection_date',
                'last_detection_date',
            ])
        },
        getGeometry$() {
            return imageFactory(model.reference).getGeometry$()
        },

        histogramMaxPixels: model.source === 'RECIPE_REF' ? 1e3 : null
    }
}

export default changeAlerts
