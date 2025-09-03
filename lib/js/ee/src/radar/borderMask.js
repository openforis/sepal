const ee = require('#sepal/ee/ee')

function maskBorder({mask, minAngle, maxAngle}) {
    return image => {
        const angle = image.select('angle')
        const sideMask = mask.includes('SIDES')
            ? angle.gt(minAngle).and(angle.lt(maxAngle))
            : ee.Image(1)
        const firstLastMask = mask.includes('FIRST_LAST')
            ? createSceneStartEndMask({
                image,
                footprintBuffer: 1000,
                borderBuffer: 800,
                startEndBuffer: 30000 // Buffer at start and end of scene to limit masking to
            })
            : ee.Image(1)
        return image
            .updateMask(
                sideMask.and(firstLastMask)
            )
    }

    function createSceneStartEndMask(args) {
        var image = args.image
        var footprintBuffer = args.footprintBuffer
        var borderBuffer = args.borderBuffer
        var startEndBuffer = args.startEndBuffer
    
        var geometry = image.geometry()
        var coordinates = ee.Array(ee.List(geometry.coordinates().get(0)))
        var size = coordinates.length().get([0])
        var max = coordinates.reduce(ee.Reducer.max(), [0])
        var min = coordinates.reduce(ee.Reducer.min(), [0])
        var xMax = ee.Geometry.Point(coordinates.mask(
            max.slice(1, 0, 1).repeat(0, size).eq(coordinates.slice(1, 0, 1))
        ).slice(0, 0, 1).project([1]).toList())
        var xMin = ee.Geometry.Point(coordinates.mask(
            min.slice(1, 0, 1).repeat(0, size).eq(coordinates.slice(1, 0, 1))
        ).slice(0, 0, 1).project([1]).toList())
        var yMax = ee.Geometry.Point(coordinates.mask(
            max.slice(1, 1).repeat(0, size).eq(coordinates.slice(1, 1))
        ).slice(0, 0, 1).project([1]).toList())
        var yMin = ee.Geometry.Point(coordinates.mask(
            min.slice(1, 1).repeat(0, size).eq(coordinates.slice(1, 1))
        ).slice(0, 0, 1).project([1]).toList())
        var totalSlices = image.getNumber('totalSlices')
        var features = ee.FeatureCollection([
            ee.Feature(ee.Feature(ee.Geometry.LineString([xMax, yMax]), {sliceNumber: 1, orbit: 'DESCENDING'})),
            ee.Feature(ee.Feature(ee.Geometry.LineString([xMin, yMin]), {sliceNumber: totalSlices, orbit: 'DESCENDING'})),
            ee.Feature(ee.Feature(ee.Geometry.LineString([xMax, yMin]), {sliceNumber: 1, orbit: 'ASCENDING'})),
            ee.Feature(ee.Feature(ee.Geometry.LineString([xMin, yMax]), {sliceNumber: totalSlices, orbit: 'ASCENDING'})),
        ])
            .filter(ee.Filter.and(
                ee.Filter.eq('sliceNumber', image.getNumber('sliceNumber')),
                ee.Filter.eq('orbit', image.getString('orbitProperties_pass'))
            ))
        var buffered = features.geometry().buffer(startEndBuffer)
        var coords = ee.List(geometry.coordinates().get(0))
        var segments = ee.FeatureCollection(coords.zip(coords.slice(1).cat(coords.slice(0, 1)))
            .map(function (segment) {
                return ee.Feature(ee.Geometry.LineString(ee.List(segment)))
            })
        )
        // Select segments on the footprint contained within buffered
        var filteredSegments = segments.filter(ee.Filter.isContained('.geo', buffered))
    
        var notBorder = image.select('VV').mask().not()
            .fastDistanceTransform().sqrt().multiply(ee.Image.pixelArea().sqrt())
            .gt(borderBuffer)
            .or(filteredSegments.distance(startEndBuffer).not().unmask(1))
    
        return filteredSegments.distance(footprintBuffer).not().unmask(1)
            .and(notBorder)
    }
}

module.exports = {maskBorder}
