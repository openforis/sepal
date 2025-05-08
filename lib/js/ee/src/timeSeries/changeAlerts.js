const {forkJoin, of, map, shareReplay, switchMap} = require('rxjs')
const ee = require('#sepal/ee/ee')
const imageFactory = require('#sepal/ee/imageFactory')
const {getCollection$} = require('#sepal/ee/timeSeries/collection')
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
                                    dateFormat: recipe.model.reference.dateFormat,
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

function analyzeChanges(args) {
    var segmentsImage = args.segmentsImage
    var dateFormat = args.dateFormat
    var collection = args.collection
    var monitoringStart = args.monitoringStart
    var band = args.band
    var minConfidence = args.minConfidence || 5
    var numberOfObservations = args.numberOfObservations || 3
    var minNumberOfChanges = args.minNumberOfChanges || 3
    var mustBeStableBeforeChange = args.mustBeStableBeforeChange === undefined ? true : args.mustBeStableBeforeChange
    var mustStayChanged = args.mustStayChanged === undefined ? true : args.mustStayChanged
    var mustBeConfirmedInMonitoring = args.mustBeConfirmedInMonitoring === undefined ? true : args.mustBeConfirmedInMonitoring
    
    if (!segmentsImage)
        throw Error('A segmentsImage argument is required')
    if (!collection)
        throw Error('A collection argument is required')
    if (!monitoringStart)
        throw Error('A monitoringStart argument is required')
    if (!band)
        throw Error('A band argument is required')
    
    var changesAndMasked = toArrayPerBand(collection
        .sort('system:time_start')
        .map(function(image) {
            var date = image.date()
            var dateYearAgo = image.date().advance(-1, 'year')
            var slice = sliceSegments(segmentsImage, dateYearAgo, dateFormat)
                .select([band, band + '_rmse'])
                // .setDefaultProjection(ee.Projection('EPSG:4326').atScale(image.select(band).projection().nominalScale()))
                // .resample()
          
            var fractionalYear = toFractionalYear(date)
            var difference = slice.select(band).subtract(
                image
                    .select(band)
                    // .setDefaultProjection(ee.Projection('EPSG:4326').atScale(image.select(band).projection().nominalScale()))
                    // .resample()
            ).float()
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
    )
    
    var changes1d = maskEmptyArray(changesAndMasked
        .arrayMask(changesAndMasked.select('change').neq(-1))
    )
    
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
        maskEmptyArray(changes1d
            .select(0)
            .arrayMask(changes1d.select('date').gte(toFractionalYear(monitoringStart))))
            .arrayReduce(ee.Reducer.count(), [0]),
        'monitoring_observation_count'
    ).unmask(0).uint16()
      
    var calibrationObservationCount = arrayFirst(
        maskEmptyArray(changes1d
            .select(0)
            .arrayMask(changes1d.select('date').lt(toFractionalYear(monitoringStart))))
            .arrayReduce(ee.Reducer.count(), [0]),
        'calibration_observation_count'
    ).unmask(0).uint16()
      
    var stableCount = changes2d
        .select('change')
        .not()
        .arrayReduce(ee.Reducer.sum(), [1])
        .arraySlice(1, -1)
        .uint16()
            
    var firstStable1d = maskEmptyArray(changes2d
        .arrayMask(stableCount.gte(minNumberOfChanges)))
        .arraySlice(0, 0, 1) // First row
        .arrayProject([1]) // 2d to 1d
        
    var firstStableDate = arrayFirst(
        maskEmptyArray(firstStable1d
            .select('date')
            .arrayMask(firstStable1d.select('change').not())), // Mask out any eventual changes
        'first_stable_date'
    ).float()
    
    var lastStable1d = maskEmptyArray(changes2d
        .arrayMask(stableCount.gte(minNumberOfChanges)))
        .arraySlice(0, -1) // Last row
        .arrayProject([1]) // 2d to 1d
    
    var lastStableDate = arrayLast(
        maskEmptyArray(lastStable1d
            .select('date')
            .arrayMask(lastStable1d.select('change').not())), // Mask out any eventual changes
        'last_stable_date'
    ).float()
      
    var changeCount = changes2d
        .select('change')
        .arrayReduce(ee.Reducer.sum(), [1])
        .arraySlice(1, -1)
        .uint16()
      
    var changeCountMask = changeCount.gte(minNumberOfChanges)
    var changeDateMask = changes2d
        .select('date')
        .gt(mustBeStableBeforeChange ? firstStableDate : -1)
        .arraySlice(1, -1) // Last column in changes2d is after lastStableDate
    var changes = maskEmptyArray(changes2d.arrayMask(
        changeCountMask
            .and(changeDateMask)
    ))
    changes = changes
        .updateMask(changes.select(0).arrayLength(0))
    var firstChange1d = changes
        .arraySlice(0, 0, 1) // First row
        .arrayProject([1]) // 2d to 1d
  
    var firstDetectionDate = arrayFirst(
        maskEmptyArray(firstChange1d
            .select('date')
            .arrayMask(firstChange1d.select('change'))), // Mask out any eventual stable observations
        'first_detection_date'
    ).float()
  
    var confirmationDate = arrayLast(
        maskEmptyArray(firstChange1d
            .select('date')
            .arrayMask(firstChange1d.select('change'))), // Mask out any eventual stable observations
        'confirmation_date'
    ).float()
      
    var first = maskEmptyArray(changes2d // If first confirmation date altogether is different from first actual confirmation
        .arrayMask(changeCountMask))
        .arraySlice(0, 0, 1) // First row
        .arrayProject([1]) // 2d to 1d
    // A change in the calibration period
    var changeInCalibration = arrayLast(
        maskEmptyArray(first
            .select('date')
            .arrayMask(first.select('change'))) // Mask out any eventual stable observations
            .neq(confirmationDate),
        'changeInCalibration'
    )
      
    var lastChange1d = changes
        .arraySlice(0, -1) // Last row
        .arrayProject([1]) // 2d to 1d
  
    var lastDetectionDate = arrayLast(
        maskEmptyArray(lastChange1d
            .select('date')
            .arrayMask(lastChange1d.select('change'))), // Mask out any eventual stable observations
        'last_detection_date'
    ).float()
    
    var changeMask = changes1d.select('date').gte(firstDetectionDate).and(
        changes1d.select('date').lte(lastDetectionDate)
    )
    
    var detectionCount = arrayFirst(
        maskEmptyArray(changes1d
            .select('date')
            .arrayMask(changeMask))
            .arrayReduce(ee.Reducer.count(), [0]),
        'detection_count'
    ).unmask(0).uint16()
        
    var mean = arrayFirst(
        maskEmptyArray(changes1d
            .select(['confidence', 'difference'])
            .arrayMask(changeMask))
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
                .or(mustBeConfirmedInMonitoring ? 0 : 1)
                .and(changeInCalibration.not().or(mustBeConfirmedInMonitoring ? 0 : 1))
                .and(lastStableDate.lt(lastDetectionDate).or(mustStayChanged ? 0 : 1))
        )
    return lastStableDate
        .addBands(changeBands)
        .addBands(monitoringObservationCount)
        .addBands(calibrationObservationCount)
        .unmask(0)
        .updateMask(segmentsImage.select(0).mask())
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

function toArrayPerBand(collection) {
    var bandNames = collection.first().bandNames()
    return ee.Image(
        bandNames.iterate(
            function (bandName, acc) {
                bandName = ee.String(bandName)
                return ee.Image(acc).addBands(
                    collection
                        .select(bandName)
                        .toArray()
                        .arrayProject([0])
                        .rename(bandName)
                )
            },
            ee.Image([])
        )
    )
}

function sliceSegments(segments, date, dateFormat) {
    var J_DAYS = 0
    var FRACTIONAL_YEARS = 1
    var UNIX_TIME_MILLIS = 2
        
    var t = toT(date)
    var segment = closestSegment(segments, t)
    var slice = evaluateCoefs(segment, t)
    return segment.addBands(slice)
    
    function closestSegment(segments, t) {
        var beforeSegment = selectSegment(segments, t, 'BEFORE')
        var afterSegment = selectSegment(segments, t, 'AFTER')
        var beforeSegmentWeight = ee.Image(t)
            .subtract(beforeSegment.select('tEnd'))
        var afterSegmentWeight = afterSegment.select('tStart')
            .subtract(t)
        return beforeSegment
            .where(
                beforeSegmentWeight.gt(afterSegmentWeight),
                afterSegment
            )
            .unmask(beforeSegment)
            .unmask(afterSegment)
    }
    
    function selectSegment(segments, t, strategy) {
        var segmentMask1d = ee.Image()
            .expression(
                maskExpression(strategy), {
                    s: segments,
                    t: t
                })
            .rename('afterMask1d')
        
        var segmentMask2d = segmentMask1d.arrayRepeat(1, 1)
      
        var coefsFilter = ee.Filter.stringEndsWith('item', '_coefs')
        var bandNames2d = segments.bandNames().filter(coefsFilter)
        var bandNames1d = segments.bandNames().filter(coefsFilter.not())
        var segment1d = maskEmptyArray(
            segments.select(bandNames1d).arrayMask(segmentMask1d)
        ).arrayGet([0])
        var segments2d = maskEmptyArray(
            segments.select(bandNames2d)
                .arrayMask(segmentMask2d)
        )
        var segment2d = segments2d
            .arraySlice(0, segmentIndex(), segmentIndex().add(1))
            .arrayProject([1])
      
        return segment1d.addBands(segment2d)
    
        function segmentIndex() {
            switch(strategy) {
            case 'BEFORE': return segments2d.arrayLength(0).subtract(1)
            case 'AFTER': return ee.Number(0)
            default: throw Error('Invalid segmentation selection strategy. Expected BEFORE or AFTER, got ' + strategy)
            }
        }
      
        function maskExpression() {
            switch(strategy) {
            case 'BEFORE': return 's.tStart <= t'
            case 'AFTER': return 's.tEnd >= t'
            default: throw Error('Invalid segmentation selection strategy. Expected BEFORE or AFTER, got ' + strategy)
            }
        }
    }
  
    function evaluateCoefs(segment, t) {
        var coefs = segment.select('.*_coefs')
        var params = sequence(0, 7)
            .reduce(
                function (acc, i) {
                    acc['c' + i] = getCoef(i)
                    return acc
                },
                {t: t, w: omega()}
            )
              
        return ee.Image()
            .expression(
                'c0 + c1*t + '
            + 'c2*cos(w*t) + c3*sin(w*t) + '
            + 'c4*cos(2*w*t) + c5*sin(2*w*t) + '
            + 'c6*cos(3*w*t) + c7*sin(3*w*t)',
                params
            )
            .regexpRename('(.*)_coefs', '$1')
      
        function getCoef(i) {
            return maskEmptyArray(
                coefs.arraySlice(0, i, i + 1)
            ).arrayGet([0])
        }
    }
    
    function toT(date) {
        date = ee.Date(date)
        switch (dateFormat) {
        case J_DAYS:
            var epochDay = 719529
            return date.millis().divide(1000).divide(3600).divide(24).add(epochDay)
        case FRACTIONAL_YEARS:
            return date.get('year').add(date.getFraction('year'))
        case UNIX_TIME_MILLIS:
            return date.millis()
        default:
            throw Error('Only dateFormat 0 (jdate), 1 (fractional years), and 2 (unix seconds) is supported')
        }
    }
       
    function omega() {
        switch (dateFormat) {
        case 0: // jdate
            return 2.0 * Math.PI / 365.25
        case 1: // fractional years
            return 2.0 * Math.PI
        case 2: // unix seconds
            return 2.0 * Math.PI / (60 * 60 * 24 * 365.25)
        default:
            throw Error('Only dateFormat 0 (jdate), 1 (fractional years), and 2 (unix seconds) is supported')
        }
    }
    function sequence(start, end) {
        return Array.apply(start, Array(end + 1)).map(function(_, i) { return i + start })
    }
}
  
function maskEmptyArray(arrayImage) {
    return arrayImage
        .updateMask(arrayImage.arrayLength(0).gt(0))
}

module.exports = changeAlerts
