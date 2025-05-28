const ee = require('#sepal/ee/ee')
const {toId, toColor} = require('./featureProperties')

module.exports = {stratifiedSystematicSample, filterSamples}
    
function stratifiedSystematicSample(args) {
    var allocation = args.allocation
    var region = args.region
    var stratification = args.stratification.clip(region)
    var scale = ee.Number(args.scale)
    var minDistance = ee.Number(args.minDistance || scale.multiply(2))
        .max(scale.multiply(2)) // At least 2xscale as min distance

    var samplesImage = createSamplesImage()
    return samplesImageToCollection(samplesImage)
    
    function samplesImageToCollection(samplesImage) {
        return samplesImage
            .reduceToVectors({
                reducer: ee.Reducer.first(),
                geometry: region,
                scale: scale,
                geometryType: 'centroid',
                labelProperty: 'sample',
                maxPixels: 1e13
            })
    }
    
    function createSamplesImage() {
        return ee.ImageCollection(allocation
            .map(function (stratum) {
                var targetDiameter = ee.Number(
                    // To reduce chance of not finding enough samples in stratum,
                    // only 50% of the expected diameter is used in calclation
                    0.5 * Math.sqrt(
                        8 * stratum.area / (3 * Math.sqrt(3) * stratum.sampleSize)
                    )
                )
                var minExponent = minDistance.log().divide(ee.Number(2).log()).ceil()
                var exponent = targetDiameter.log().divide(ee.Number(2).log()).floor()
                    .max(minExponent)
                var diameter = ee.Number(2).pow(exponent)
                var stratumMask = stratification.eq(stratum.stratum)
                var stratumSamplesImage = createHexSamplesImage({
                    diameter: diameter,
                    scale: scale
                })
          
                return stratumSamplesImage
                    .addBands(stratification)
                    .updateMask(stratumMask)
            })
        ).mosaic()
    }
    
    function createHexSamplesImage(args) {
        var diameter = args.diameter
        var scale = args.scale
        var proj = args.proj || ee.Projection('EPSG:3410')
      
        var nominalScale = proj.nominalScale()
        var distance = ee.Number(diameter).divide(nominalScale)
        var dx = distance.multiply(Math.sqrt(3))
        var dy = distance.multiply(1.5)
      
        var coords = ee.Image.pixelCoordinates(proj)
        var i = coords.select('x').divide(dx).floor().int32().rename('i')
        var j = coords.select('y').divide(dy).floor().int32().rename('j')
      
        var xOffset = j.mod(2).multiply(dx.divide(2))
        var xPos = coords.select('x').subtract(xOffset)
        var yPos = coords.select('y')
            
        var xMinDistance = xPos.mod(dx).abs()
        var yMinDistance = yPos.mod(dy).abs()
      
        // 1.42 is sqrt(2) rounded a bit up.
        // It ensures that for worst case scenario, where the centroid falls exactly between 4 pixels.
        // we cover the majority of the pixels. This will potentially shift the centroid
        // slightly, but it's a relatively small shift.
        var minDistanceFromCentroid = ee.Number(1.42).multiply(ee.Number(scale)).divide(nominalScale)
        var sample = xMinDistance.lt(minDistanceFromCentroid)
            .and(yMinDistance.lt(minDistanceFromCentroid))
            .rename('sample')
        var level = ee.Image(ee.List.sequence(0, 4)
            .iterate(
                function (n, acc) {
                    n = ee.Number(n).byte()
                    var m = ee.Number(2).pow(n.subtract(1))
                    var included = include(i, j, m)
                    return ee.Image(acc)
                        .addBands(
                            included.multiply(n)
                                .add(
                                    j.mod(ee.Number(2).pow(n.add(1))).abs().eq(0)
                                        .multiply(0.5)
                                )
                        )
                },
                ee.Image([])
            )
        ).reduce(ee.Reducer.max()).rename('level')
        return sample
            .addBands(level)
            .updateMask(sample)
    }
      
    function include(i, j, n) {
        return mod(i, 2).and(mod(j, 4))
            .or(mod(i.subtract(n), 2).and(mod(j, 4).not()))
            .and(mod(j, 2))
            .or(n.eq(0))
            .byte()
          
        function mod(value, k) {
            return value.mod(n.multiply(k)).abs().eq(0)
        }
    }
}

function filterSamples(args) {
    var region = args.region
    var samples = args.samples.filterBounds(region)
    var allocation = args.allocation
    var strategy = args.strategy || 'OVER'
    var seed = args.seed

    var allocationCollection = ee.FeatureCollection(allocation
        .map(function (stratum) {
            return ee.Feature(null, stratum)
        })
    )
    
    var counts = toFeatureCollection(
        samples
            .reduceColumns(
                ee.Reducer.count().group(1, 'level').group(2, 'stratum'),
                ['stratum', 'level', 'stratum'])
            .get('groups')
    )
    return ee.FeatureCollection(allocation
        .map(function (stratum) {
            var stratumGroup = counts
                .filter(ee.Filter.eq('stratum', stratum.stratum))
                .first()
            var stratumCounts = toFeatureCollection(
                ee.Algorithms.If(
                    stratumGroup,
                    stratumGroup.get('groups'),
                    []
                )
            )
            var diffs = stratumCounts
                .map(function (feature) {
                    var count = stratumCounts
                        .filter(ee.Filter.gte('level', feature.getNumber('level')))
                        .reduceColumns(ee.Reducer.sum(), ['count'])
                        .values().getNumber(0)
                    var diff = strategy === 'CLOSEST'
                        ? count.subtract(stratum.sampleSize).abs()
                        : count.subtract(stratum.sampleSize)
                    return feature.set('diff', diff)
                })
            var level = diffs
                .filter(ee.Filter.gte('diff', 0))
                .reduceColumns(
                    ee.Reducer.min(2).setOutputs(['diff', 'level']),
                    ['diff', 'level']
                )
                .getNumber('level')
            var filtered = samples
                .filter(ee.Filter.eq('stratum', stratum.stratum))
                .filter(ee.Filter.gte('level', level))

            return (strategy === 'EXACT'
                ? filtered
                    .randomColumn('random', seed)
                    .limit(stratum.sampleSize)
                : filtered
            ).select(['id', 'stratum', 'color'])
        })
    ).flatten().map(setProperties)
    
    function setProperties(sample) {
        return sample
            .set('id', toId({sample}))
            .set('color', toColor({sample, allocationCollection}))
            .set('level', null)
            .set('sample', null)
    }
}

function toFeatureCollection(dictList) {
    return ee.FeatureCollection(
        ee.List(dictList).map(function (dict) {
            return ee.Feature(null, dict)
        })
    )
}
  
