const {map, of} = require('rxjs')
const _ = require('lodash')
const {getCollection$} = require('#sepal/ee/timeSeries/collection')
const {toGeometry} = require('#sepal/ee/aoi')
const ee = require('#sepal/ee/ee')

const MONTH_BANDS = [
    'january',
    'february',
    'march',
    'april',
    'may',
    'june',
    'july',
    'august',
    'september',
    'october',
    'november',
    'december',
]
const PHENOLOGY_BANDS = [
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
                map(collection => {
                    const monthlyComposites = computeMonthlyComposites(collection, band)
                    const phenology = computePhenology(collection, band)
                    return phenology
                        .addBands(monthlyComposites)
                        .select(selectedBands)
                        .clip(geometry)
                })
            )
        },
        getBands$() {
            return of([...PHENOLOGY_BANDS, ...MONTH_BANDS])
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

function computeMonthlyComposites(collection, dependentBand) {
    return ee.Image(MONTH_BANDS.map(
        function (name, i) {
            var month = ee.Number(i).add(1)
            return collection
                .select(dependentBand)
                .filter(ee.Filter.calendarRange(month, month.add(1), 'month'))
                .median()
                .rename(name)
        })
    )
}

function computePhenology(collection, dependentBand) {
    var all = collection
        .select(['dayOfYear', dependentBand])
        .toArray()
    var nodes = toNodes(all)
    
    var days = mapSegments('days', function (d1, d2) {
        return d2.subtract(d1)
            .where(
                d2.lt(d1),
                ee.Image(365).subtract(d1).add(d2)
            )
            .int16()
    })
    
    var segments = mapSegments('segment', function (d1, d2) {
        var dayOfYears = all.arraySlice(1, 0, 1)
        var mask = dayOfYears.gte(d1).and(dayOfYears.lt(d2))
            .or(d2.lt(d1).and(dayOfYears.gte(d1).or(dayOfYears.lt(d2))))
        return all.arrayMask(mask)
    })
    
    var segmentMedians = segments
        .arraySlice(1, 1)
        .arrayReduce(ee.Reducer.median(), [0])
    segmentMedians = segmentMedians
        .updateMask(segmentMedians.arrayLength(0))
        .arrayGet([0, 0])
        .int16()
        .regexpRename('.*(_\\d)', 'median$1', false)
      
    var fit = segments
        .arrayReduce(ee.Reducer.linearFit(), [0], 1)
    fit = fit.updateMask(fit.arrayLength(0))
    var slope = fit.arrayGet([0, 0])
        .regexpRename('.*(_\\d)', 'slope$1', false)
        .unmask(0)
        .float()
    var offset = fit.arrayGet([0, 1])
        .regexpRename('.*(_\\d)', 'offset$1', false)
        .unmask(0)
        .float()
  
    var background = segmentMedians
        .reduce(ee.Reducer.min())
        .int16()
        .rename('background')
    var max = segmentMedians.reduce(ee.Reducer.max())
    var amplitude = max.subtract(background)
        .int16()
        .rename('amplitude')
    var median = collection.select(dependentBand).median().rename('median')
        .int16()
  
    return background
        .addBands(amplitude)
        .addBands(median)
        .addBands(nodes)
        .addBands(days)
        .addBands(slope)
        .addBands(offset)
        .addBands(segmentMedians)
        .select(PHENOLOGY_BANDS)
        .addBands(segments)
  
    function mapSegments(prefix, algorithm) {
        var bands = nodes.bandNames()
        var pairs = bands.zip(
            bands.slice(1).cat(bands.slice(0, 1))
        )
        return ee.Image(pairs.iterate(
            function (pair, acc) {
                pair = ee.List(pair)
                acc = ee.Image(acc)
                var image = algorithm(
                    nodes.select(pair.getString(0)),
                    nodes.select(pair.getString(1))
                )
                    .rename(pair.getString(0).replace('.*(_\\d)', `${prefix}$1`))
                return acc.addBands(image)
            },
            ee.Image([])
        ))
    }
    
    function toNodes(all) {
        all = all.updateMask(all.arrayLength(0).gt(0))
        var dayOfYears = all.arraySlice(1, 0, 1)
        var initialNodes = cusum(all)
            .select('dayOfYear_.*')
            .rename(['dayOfYear_2', 'dayOfYear_4'])
        var dayOfYear_2 = initialNodes.select('dayOfYear_2')
        var dayOfYear_4 = initialNodes.select('dayOfYear_4')
      
        var mask_2_4 = dayOfYears.gte(dayOfYear_2).and(dayOfYears.lt(dayOfYear_4))
            .or(dayOfYear_4.lt(dayOfYear_2).and(dayOfYears.gte(dayOfYear_2).or(dayOfYears.lt(dayOfYear_4))))
        var segment_2_4 = all.arrayMask(mask_2_4)
      
        var dayOfYear_3 = ee.Image().expression(
            'abs(i.index_min) < abs(i.index_max) ' +
        '? i.dayOfYear_max ' +
        ': i.dayOfYear_min', {
                i: cusum(segment_2_4)
            }).rename('dayOfYear_3')
        
        var mask_4_2 = dayOfYears.gte(dayOfYear_4).and(dayOfYears.lt(dayOfYear_2))
            .or(dayOfYear_2.lt(dayOfYear_4).and(dayOfYears.gte(dayOfYear_4).or(dayOfYears.lt(dayOfYear_2))))
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

// function gapFill(args) {
//     var collection = args.collection
//     var band = args.band
//     var windowSize = args.windowSize || 30
//     var stepSize = args.stepSize || 15
  
//     var initialCollection = ee.ImageCollection(ee.List.sequence(stepSize, 365, stepSize)
//         .map(function(dayOfYear) {
//             return ee.Image(ee.Number(dayOfYear))
//                 .int16()
//                 .rename('dayOfYear')
//                 .set('dayOfYear', dayOfYear)
//         })
//     )
  
//     var joinedCollection = ee.ImageCollection(
//         ee.Join
//             .saveAll({
//                 matchesKey: 'images',
//                 ordering: 'dayOfYear',
//                 outer: true
//             })
//             .apply({
//                 primary: initialCollection,
//                 secondary: collection,
//                 condition: ee.Filter.or(
//                     ee.Filter.maxDifference({
//                         difference: windowSize / 2,
//                         leftField: 'dayOfYear',
//                         rightField: 'dayOfYear'
//                     }),
//                     ee.Filter.maxDifference({
//                         difference: windowSize / 2,
//                         leftField: 'dayOfYear',
//                         rightField: 'dayOfPrevYear'
//                     }),
//                     ee.Filter.maxDifference({
//                         difference: windowSize / 2,
//                         leftField: 'dayOfYear',
//                         rightField: 'dayOfNextYear'
//                     })
//                 )
//             })
//     )
  
//     return joinedCollection.map(fillGap)
  
//     function fillGap(image) {
//         var dayOfYear = image.getNumber('dayOfYear')
//         var bandNames = ['dayOfYear', band]
//         var median = ee.ImageCollection(ee.List(image.get('images')))
//             .select(band)
//             .median()
//         return ee.Image(dayOfYear)
//             .int16()
//             .addBands(median)
//             .rename(bandNames)
//             .set('dayOfYear', image.get('dayOfYear'))
//     }
// }

module.exports = phenology
