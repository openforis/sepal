const ee = require('#sepal/ee/ee')
const {toId, toColor} = require('./featureProperties')

module.exports = {stratifiedRandomSample}

function stratifiedRandomSample(args) {
    var allocation = args.allocation
    var stratification = args.stratification.select([0], ['stratum'])
    var region = args.region
    var scale = ee.Number(args.scale)
    var minDistance = args.minDistance ? ee.Number(args.minDistance) : 0
    var crs = args.crs || 'EPSG:3410'
    var crsTransform = args.crsTransform || undefined
    var seed = ee.Number(args.seed || 1)
    
    var projection = crs
        ? ee.Projection(crs, crsTransform)
        : null
    var samples = minDistance
        ? minDistanceSample()
        : noMinDistanceSample()
    return samples

    function noMinDistanceSample() {
        console.log('random noMinDistanceSample')
        var classValues = allocation.map(function (allocation) {
            return allocation.stratum
        })
        var classPoints = allocation.map(function (allocation) {
            return allocation.sampleSize
        })
        var allocationCollection = ee.FeatureCollection(allocation
            .map(function (stratum) {
                return ee.Feature(null, stratum)
            })
        )
        return stratification
            .select([0], ['stratum'])
            .int()
            .stratifiedSample({
                numPoints: 0,
                classBand: 'stratum',
                region: region,
                scale: scale,
                projection: projection,
                seed: seed,
                classValues: classValues,
                classPoints: classPoints,
                geometries: true
            })
            .map(function (sample) {
                return sample
                    .select(['stratum'])
                    .set('id', toId({sample}))
                    .set('color', toColor({sample, allocationCollection}))
            })
    }
    
    function minDistanceSample() {
        console.log('random minDistanceSample')
        return ee.FeatureCollection(
            allocation.map(sampleStratum)
        ).flatten()

        function sampleStratum(stratum) {
            var distance = ee.Number(8 * stratum.area)
                .divide(Math.sqrt(3) * stratum.sampleSize)
                .sqrt()
                .multiply(0.75) // Make sure we get enough samples
                .max(minDistance)
            var grid = hexGrid(
                randomOffset(
                    projection.atScale(distance),
                    seed
                ),
                distance
            )
            var stratumMask = stratification.eq(stratum.stratum)
            var reduceScale = ee.Number(10).divide(distance)
                .max(1 / 16)
            return stratification
                .updateMask(
                    stratumMask.and(createSamplesImage(grid, seed, stratumMask))
                )
                .reduceToVectors({
                    reducer: ee.Reducer.countEvery(),
                    geometry: region,
                    labelProperty: 'stratum',
                    crs: grid.projection().scale(reduceScale, reduceScale),
                    geometryType: 'centroid',
                    maxPixels: 1e13,
                })
                .select('stratum')
                .filterBounds(region)
                .map(function (sample) {
                    return sample
                        .set('id', toId({sample}))
                        .set('color', stratum.color)
                })
                .randomColumn()
                .sort('random')
                .limit(stratum.sampleSize)
                .select(['id', 'stratum', 'color'])
        }
      
        function hexGrid(proj) {
            var diameter = 1 // Use nominal scale of projection
            var size = ee.Number(diameter).divide(Math.sqrt(3)) // Distance from center to vertex
          
            var coords = ee.Image.pixelCoordinates(proj)
            var vals = {
            // Switch x and y here to get flat top instead of pointy top hexagons.
                x: coords.select('x'),
                u: coords.select('x').divide(diameter),  // term 1
                v: coords.select('y').divide(size),      // term 2
                r: ee.Number(diameter).divide(2),
            }
            var i = ee.Image().expression('floor((floor(u - v) + floor(x / r))/3)', vals)
            var j = ee.Image().expression('floor((floor(u + v) + floor(v - u))/3)', vals)
          
            var cells = i.long().leftShift(32).add(j.long()).rename('hexgrid')
          
            var mask = i.mod(2).and(j.mod(2)) // Introduces gap - reduces count by 4x
            return cells.updateMask(mask)
        }
        
        function createSamplesImage(cells, seed, mask) {
            var random = ee.Image.random(seed).multiply(1e6).int()
                .multiply(mask) // Make sure we pick points in the mask
            var maximum = cells.addBands(random).reduceConnectedComponents(ee.Reducer.max())
            return random.eq(maximum).selfMask().rename('sample')
        }
        
        // Translates a projection by a random amount between 0 and 1 in projection units.
        function randomOffset(projection, seed) {
            var values = ee.FeatureCollection([ee.Feature(null, null)])
                .randomColumn('x', seed)
                .randomColumn('y', seed)
                .first()
            return projection.translate(values.get('x'), values.get('y'))
        }
    }

}
