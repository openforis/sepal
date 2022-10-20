const {map, of} = require('rxjs')
const _ = require('lodash')
const {getCollection$} = require('sepal/ee/timeSeries/collection')
const {toGeometry} = require('sepal/ee/aoi')
const ee = require('sepal/ee')

const BANDS = [
    'background',
    'amplitude',
    'median',
    'dayOfYear_1',
    'days_1',
    'median_1',
    'slope_1',
    'offset_1',
    'dayOfYear_2',
    'days_2',
    'median_2',
    'slope_2',
    'offset_2',
    'dayOfYear_3',
    'days_3',
    'median_3',
    'slope_3',
    'offset_3',
    'dayOfYear_4',
    'days_4',
    'median_4',
    'slope_4',
    'offset_4'
]

const phenology = (recipe, {selection: selectedBands} = {selection: []}) => {
    const model = recipe.model
    const geometry = toGeometry(model.aoi)
    return {
        getImage$() {
            const band = model.sources.band
            return getObservations$(model, geometry).pipe(
                // map(collection => gapFill({collection, band})),
                map(collection =>
                    computePhenology(collection, band)
                        .select(selectedBands)
                        .clip(geometry)
                )
            )
        },
        getBands$() {
            return of(BANDS)
        },
        getGeometry$() {
            return of(geometry)
        }
    }
}

const getObservations$ = (model, geometry) => {
    const startDate = `${model.dates.fromYear}-01-01`
    const endDate = `${model.dates.toYear + 1}-01-01`
    const collectionRecipe = {model: {
        dates: {startDate, endDate},
        sources: model.sources,
        options: model.options
    }}
    const band = model.sources.band
    return getCollection$({
        recipe: collectionRecipe,
        geometry,
        bands: [band]
    }).pipe(
        map(collection => collection.map(image => {
            var dayOfYear = image.date().getRelative('day', 'year').add(1)
            return image
                .addBands(ee.Image(dayOfYear).int16().rename('dayOfYear'))
                .set('dayOfYear', dayOfYear)
                .set('dayOfPrevYear', dayOfYear.subtract(365))
                .set('dayOfNextYear', dayOfYear.add(365))
        })),
    )
}

function computePhenology(collection, dependentBand) {
    var nodes = toNodes(collection)

    var days_1 = days(nodes.select('dayOfYear_1'), nodes.select('dayOfYear_2')).rename('days_1')
    var days_2 = days(nodes.select('dayOfYear_2'), nodes.select('dayOfYear_3')).rename('days_2')
    var days_3 = days(nodes.select('dayOfYear_3'), nodes.select('dayOfYear_4')).rename('days_3')
    var days_4 = days(nodes.select('dayOfYear_4'), nodes.select('dayOfYear_1')).rename('days_4')
        
    var segmentedCollection = collection.map(toSegments(nodes))
    var segmentMedians = segmentedCollection
        .select('dayOfYear_\\d')
        .reduce(
            ee.Reducer.median()
        )
        .int16()
        .rename([
            'median_1',
            'median_2',
            'median_3',
            'median_4'
        ])
      
    var fit_1 = fit(segmentedCollection, 'dayOfYear_1').rename(['slope_1', 'offset_1'])
    var fit_2 = fit(segmentedCollection, 'dayOfYear_2').rename(['slope_2', 'offset_2'])
    var fit_3 = fit(segmentedCollection, 'dayOfYear_3').rename(['slope_3', 'offset_3'])
    var fit_4 = fit(segmentedCollection, 'dayOfYear_4').rename(['slope_4', 'offset_4'])
  
    var background = segmentMedians.reduce(ee.Reducer.min())
        .rename('background')
    var max = segmentMedians.reduce(ee.Reducer.max())
    var amplitude = max.subtract(background)
        .int16()
        .rename('amplitude')
    var median = collection.select(dependentBand)
        .median()
        .int16()
        .rename('median')
  
    return background
        .addBands(amplitude)
        .addBands(median)
        .addBands(nodes)
        .addBands(segmentMedians)
        .addBands(days_1)
        .addBands(days_2)
        .addBands(days_3)
        .addBands(days_4)
        .addBands(fit_1)
        .addBands(fit_2)
        .addBands(fit_3)
        .addBands(fit_4)
        .select(BANDS)

    function days(d1, d2) {
        return d2.subtract(d1)
            .where(
                d2.lt(d1),
                ee.Image(365).subtract(d1).add(d2)
            )
    }
        
    function toNodes() {
        var all = collection
            .select(['dayOfYear', dependentBand])
            .toArray()
        all = all.updateMask(all.arrayLength(0).gt(0))
        var dayOfYears = all.arraySlice(1, 0, 1)
        var initialNodes = cusum(all)
            .select('dayOfYear_.*')
            .rename(['dayOfYear_2', 'dayOfYear_4'])
        var dayOfYear_2 = initialNodes.select('dayOfYear_2')
        var dayOfYear_4 = initialNodes.select('dayOfYear_4')
      
        var mask_2_4 = dayOfYears.gte(dayOfYear_2).and(dayOfYears.lt(dayOfYear_4))
            .or(dayOfYear_4.lt(dayOfYear_2).and(dayOfYears.gt(dayOfYear_2).or(dayOfYears.lt(dayOfYear_4))))
        var segment_2_4 = all.arrayMask(mask_2_4)
      
        var dayOfYear_3 = ee.Image().expression(
            'abs(i.index_min) < abs(i.index_max) ' +
        '? i.dayOfYear_max ' +
        ': i.dayOfYear_min', {
                i: cusum(segment_2_4)
            }).rename('dayOfYear_3')
  
        var mask_4_2 = dayOfYears.gte(dayOfYear_4).and(dayOfYears.lt(dayOfYear_2))
            .or(dayOfYear_2.lt(dayOfYear_4).and(dayOfYears.gt(dayOfYear_4).or(dayOfYears.lt(dayOfYear_2))))
        var segment_4_2 = all.arrayMask(mask_4_2)
  
        var dayOfYear_1 = ee.Image().expression(
            'abs(i.index_min) < abs(i.index_max) ' +
        '? i.dayOfYear_max ' +
        ': i.dayOfYear_min', {
                i: cusum(segment_4_2)
            }).rename('dayOfYear_1')
          
        return dayOfYear_1
            .addBands(dayOfYear_2)
            .addBands(dayOfYear_3)
            .addBands(dayOfYear_4)
    }
  
    function fit(collection, dependent) {
        return collection
            .select(['dayOfYear', dependent])
            .reduce(ee.Reducer.linearFit())
            .unmask(0)
            .float()
    }
  
    function toSegments(nodes) {
        return function(image) {
            var bandNames = nodes.bandNames()
            var nodePairs = bandNames.zip(
                bandNames.slice(1).add(bandNames.get(0))
            )
            var segments = ee.ImageCollection(nodePairs.map(function(nodePair) {
                nodePair = ee.List(nodePair)
                var start = nodes.select(nodePair.getString(0))
                var end = nodes.select(nodePair.getString(1))
                return maskSegment(image, start, end)
                    .rename(nodePair.getString(0))
            })).toBands().regexpRename('\\d*_(.*)', '$1')
  
            return segments
                .addBands(image.select('dayOfYear'))
                .set('dayOfYear', image.get('dayOfYear'))
        }
  
        function maskSegment(image, start, end) {
            var dayOfYear = image.select('dayOfYear')
            var adjustedDayOfYear = dayOfYear.add(end.lt(start).and(dayOfYear.lt(start)).multiply(365))
            var adjustedEnd = end.add(end.lt(start).multiply(365))
            var mask = adjustedDayOfYear.gte(start)
                .and(adjustedDayOfYear.lt(adjustedEnd))
            return image.select(dependentBand)
                .updateMask(mask)
                .set('dayOfYear', image.get('dayOfYear'))
        }
    }
  
    function cusum(array) {
        array = array.updateMask(array.arrayLength(0).gt(0))
        var dayOfYears = array.arraySlice(1, 0, 1)
        var observations = array.arraySlice(1, 1)
        var mean = observations
            .arrayReduce(ee.Reducer.mean(), [0])
            .arrayGet([0, 0])
        var cusum = observations
            .subtract(mean)
            .arrayAccum(0, ee.Reducer.sum())
        var minMax = cusum
            .arrayCat(dayOfYears, 1)
            .arraySlice(0, 1, -1)
            .arrayReduce({
                reducer: ee.Reducer.min(2)
                    .combine(ee.Reducer.max(2), null, true),
                axes: [0],
                fieldAxis: 1
            })
            .int16()
        return minMax
            .arrayProject([1])
            .arrayFlatten([[
                'index_min',
                'dayOfYear_min',
                'index_max',
                'dayOfYear_max'
            ]])
    }
}

function gapFill(args) {
    var collection = args.collection
    var band = args.band
    var windowSize = args.windowSize || 30
    var stepSize = args.stepSize || 15
  
    var initialCollection = ee.ImageCollection(ee.List.sequence(stepSize, 365, stepSize)
        .map(function(dayOfYear) {
            return ee.Image(ee.Number(dayOfYear))
                .int16()
                .rename('dayOfYear')
                .set('dayOfYear', dayOfYear)
        })
    )
  
    var joinedCollection = ee.ImageCollection(
        ee.Join
            .saveAll({
                matchesKey: 'images',
                ordering: 'dayOfYear',
                outer: true
            })
            .apply({
                primary: initialCollection,
                secondary: collection,
                condition: ee.Filter.or(
                    ee.Filter.maxDifference({
                        difference: windowSize / 2,
                        leftField: 'dayOfYear',
                        rightField: 'dayOfYear'
                    }),
                    ee.Filter.maxDifference({
                        difference: windowSize / 2,
                        leftField: 'dayOfYear',
                        rightField: 'dayOfPrevYear'
                    }),
                    ee.Filter.maxDifference({
                        difference: windowSize / 2,
                        leftField: 'dayOfYear',
                        rightField: 'dayOfNextYear'
                    })
                )
            })
    )
  
    return joinedCollection.map(fillGap)
  
    function fillGap(image) {
        var dayOfYear = image.getNumber('dayOfYear')
        var bandNames = ['dayOfYear', band]
        var median = ee.ImageCollection(ee.List(image.get('images')))
            .select(band)
            .median()
        return ee.Image(dayOfYear)
            .int16()
            .addBands(median)
            .rename(bandNames)
            .set('dayOfYear', image.get('dayOfYear'))
    }
}

module.exports = phenology
