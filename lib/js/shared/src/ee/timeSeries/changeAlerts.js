const {forkJoin, of, map, shareReplay, switchMap} = require('rxjs')
const ee = require('sepal/ee')
const imageFactory = require('sepal/ee/imageFactory')
const {getCollection$} = require('sepal/ee/timeSeries/collection')
const temporalSegmentation = require('./temporalSegmentation')
const moment = require('moment')
const _ = require('lodash')

const DATE_FORMAT = 'YYYY-MM-DD'

const changeAlerts = (recipe, {...args} = {}) => {
    const ccdcArgs = {selection: [recipe.model.sources.band]}
    const aoi$ = imageFactory(recipe.model.reference, ccdcArgs).getGeometry$()
    const {visualizationType} = args
    const delegate$ = aoi$.pipe(
        map(aoi => visualizationType && visualizationType !== 'changes'
            ? toMosaic(aoi, recipe, args)
            : toChanges(recipe, args)
        ),
        shareReplay()
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

const toMosaic = (aoi, recipe, args) => {
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
    const ccdcArgs = {selection: [band]}

    const {monitoringEnd, monitoringStart, calibrationStart} = toDates(recipe)

    const selectedBands$ = selectedBands && selectedBands.length
        ? of(selectedBands)
        : imageFactory(model.reference, ccdcArgs).getBands$()

    const bands$ = selectedBands$.pipe(
        map(selectedBands => ({selectedBands, baseBands}))
    )
    const ccdc$ = bands$.pipe(
        map(({selectedBands, baseBands}) =>
            ({
                selectedBands,
                baseBands,
                ccdc: imageFactory(model.reference, ccdcArgs)
            }))
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
                switchMap(({ccdc}) =>
                    forkJoin({
                        segmentsImage: ccdc.getImage$(),
                        geometry: ccdc.getGeometry$()
                    }).pipe(
                        switchMap(({segmentsImage, geometry}) => getObservations$(geometry).pipe(
                            map(collection =>
                                analyzeChanges({
                                    segmentsImage,
                                    collection,
                                    monitoringStart,
                                    band,
                                    minConfidence: recipe.model.changeAlertsOptions.minConfidence,
                                    minNumberOfChanges: recipe.model.changeAlertsOptions.minNumberOfChanges,
                                    numberOfObservations: recipe.model.changeAlertsOptions.numberOfObservations,
                                    aggressive: false
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

function analyzeChanges(args) {
    var segmentsImage = args.segmentsImage
    var collection = args.collection
    var monitoringStart = args.monitoringStart
    var band = args.band
    var minConfidence = args.minConfidence || 5
    var numberOfObservations = args.numberOfObservations || 3
    var minNumberOfChanges = args.minNumberOfChanges || 3
    var aggressive = args.aggressive
    
    if (!segmentsImage)
        throw Error('A segmentsImage argument is required')
    if (!collection)
        throw Error('A collection argument is required')
    if (!monitoringStart)
        throw Error('A monitoringStart argument is required')
    if (!band)
        throw Error('A band argument is required')
  
    var segments = temporalSegmentation.Segments(segmentsImage, 1)
    
    var changesAndMasked = collection
        .sort('system:time_start')
        .map(function(image) {
            var date = image.date()
        
            var dateYearAgo = image.date().advance(-1, 'year')
            var segment = segments.findByDate(dateYearAgo, 'closest')
            var slice = segment.slice({strategy: 'closest'})
                .addBands(segment.toImage(`${band}_rmse`))
          
            var fractionalYear = toFractionalYear(date)
            var difference = slice.select(band).subtract(image.select(band)).float()
            var confidence = difference.abs().divide(slice.select(`${band}_rmse`)).float()
            var change = confidence
                .gt(minConfidence)
                .rename('change')
            return change
                .addBands(
                    difference.rename('difference')
                )
                .addBands(
                    confidence.rename('confidence')
                )
                .addBands(
                    ee.Image(fractionalYear).rename('date').float()
                )
                .unmask(-1)
        })
        .toArrayPerBand(0)
    
    var changes1d = changesAndMasked
        .arrayMask(changesAndMasked.select('change').neq(-1))
    
    var changes2d = ee.ImageCollection(
        ee.List.sequence(0, ee.Number(numberOfObservations).subtract(1))
            .map(function (offset) {
                offset = ee.Number(offset)
                var start = ee.Image(offset).int8()
                var end = start.subtract(numberOfObservations).add(1)
                    .where( // End for last offset is 0, make sure it's the last index
                        offset.add(1).eq(numberOfObservations),
                        changes1d.select('change').arrayLength(0)
                    )
                return changes1d.arraySlice(0, start, end)
            })
    ).toArrayPerBand(1)

    var monitoringObservationCount = arrayFirst(
        changes1d
            .select(0)
            .arrayMask(changes1d.select('date').gte(toFractionalYear(monitoringStart)))
            .arrayReduce(ee.Reducer.count(), [0]),
        'monitoring_observation_count'
    ).unmask(0).uint16()
      
    var calibrationObservationCount = arrayFirst(
        changes1d
            .select(0)
            .arrayMask(changes1d.select('date').lt(toFractionalYear(monitoringStart)))
            .arrayReduce(ee.Reducer.count(), [0]),
        'calibration_observation_count'
    ).unmask(0).uint16()
      
    var stableCount = changes2d
        .select('change')
        .not()
        .arrayAccum(1, ee.Reducer.sum())
        .arraySlice(1, -1)
        .uint16()
      
    var lastStable1d = changes2d
        .arrayMask(stableCount.gte(minNumberOfChanges))
        .arraySlice(0, -1) // Last row
        .arrayProject([1]) // 2d to 1d
    
    var lastStableDate = arrayLast(
        lastStable1d
            .select('date')
            .arrayMask(lastStable1d.select('change').not()), // Mask out any eventual changes
        'last_stable_date'
    ).float()
      
    var changeCount = changes2d
        .select('change')
        .arrayAccum(1, ee.Reducer.sum())
        .arraySlice(1, -1)
        .uint16()
      
    var changeCountMask = changeCount.gte(minNumberOfChanges)
    var changeDateMask = changes2d
        .select('date')
        .gt(aggressive ? -1 : lastStableDate)
        .arraySlice(1, -1) // Last column in changes2d is after lastStableDate
    
    var changes = changes2d.arrayMask(
        changeCountMask
            .and(changeDateMask)
    )
    changes = changes
        .updateMask(changes.select(0).arrayLength(0))
    var firstChange1d = changes
        .arraySlice(0, 0, 1) // First row
        .arrayProject([1]) // 2d to 1d
  
    var firstDetectionDate = arrayFirst(
        firstChange1d
            .select('date')
            .arrayMask(firstChange1d.select('change')), // Mask out any eventual stable observations
        'first_detection_date'
    ).float()
  
    var confirmationDate = arrayLast(
        firstChange1d
            .select('date')
            .arrayMask(firstChange1d.select('change')), // Mask out any eventual stable observations
        'confirmation_date'
    ).float()
      
    var first = changes2d // If first confirmation date altogether is different from first actual confirmation
        .arrayMask(changeCountMask)
        .arraySlice(0, 0, 1) // First row
        .arrayProject([1]) // 2d to 1d
    var unstable = arrayLast(
        first
            .select('date')
            .arrayMask(first.select('change')) // Mask out any eventual stable observations
            .neq(confirmationDate),
        'unstable'
    )
      
    var lastChange1d = changes
        .arraySlice(0, -1) // Last row
        .arrayProject([1]) // 2d to 1d
  
    var lastDetectionDate = arrayLast(
        lastChange1d
            .select('date')
            .arrayMask(lastChange1d.select('change')), // Mask out any eventual stable observations
        'last_detection_date'
    ).float()
      
    var changeMask = changes1d.select('date').gte(firstDetectionDate).and(
        changes1d.select('date').lte(lastDetectionDate)
    ).or(aggressive ? 1 : 0)
    
    var detectionCount = arrayFirst(
        changes1d
            .select('date')
            .arrayMask(changeMask)
            .arrayReduce(ee.Reducer.count(), [0]),
        'detection_count'
    ).unmask(0).uint16()
        
    var mean = arrayFirst(
        changes1d
            .select(['confidence', 'difference'])
            .arrayMask(changeMask)
            .arrayReduce(ee.Reducer.mean(), [0]),
        ['confidence', 'difference']
    ).float()
      
    var changeBands = firstDetectionDate
        .addBands(confirmationDate)
        .addBands(lastDetectionDate)
        .addBands(mean)
        .addBands(detectionCount)
        .updateMask(
            confirmationDate.gte(toFractionalYear(monitoringStart))
                .and(unstable.not())
                .or(aggressive ? 1 : 0)
        )
    var filteredChangeBands = changeBands
        .unmask(0)
    const result = lastStableDate
        .addBands(filteredChangeBands)
        .addBands(monitoringObservationCount)
        .addBands(calibrationObservationCount)
        .updateMask(segmentsImage.select(0).mask())
    return result
}

function arrayFirst(image, name) {
    return image
        .updateMask(image.select(0).arrayLength(0))
        .arrayGet([0])
        .rename(name)
    
}

function arrayLast(image, name) {
    return image
        .updateMask(image.select(0).arrayLength(0))
        .arrayGet([-1])
        .rename(name)
}

function toFractionalYear(date) {
    date = ee.Date(date)
    return date.get('year').add(date.getFraction('year'))
}

module.exports = changeAlerts
