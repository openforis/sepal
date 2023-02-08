const ee = require('#sepal/ee')

const tile = (featureCollection, sizeInDegrees) => {
    const tileGeometry = geometry => {
        const coords = ee.List(geometry.bounds().coordinates().get(0))
        const minPoint = ee.List(coords.get(0))
        const maxPoint = ee.List(coords.get(2))

        const sequence = direction => {
            const start = minPoint.get(direction)
            const stop = ee.Number(maxPoint.get(direction))
            return ee.List.sequence(start, stop, sizeInDegrees)
        }

        const getTile = (x, y) =>
            ee.Feature(ee.Geometry.Rectangle([
                [ee.Number(x), ee.Number(y)],
                [
                    ee.Number(x).add(sizeInDegrees).min(maxPoint.get(0)),
                    ee.Number(y).add(sizeInDegrees).min(maxPoint.get(1))
                ]
            ]).intersection(geometry, 30))

        const tiles = sequence(0)
            .map(x =>
                sequence(1)
                    .map(y => getTile(x, y))
            ).flatten()
        return ee.FeatureCollection(tiles).filterBounds(geometry)
    }

    const tileFeatureCollection = featureCollection => {
        const mergeTile = (feature, tiles) =>
            ee.FeatureCollection(tiles)
                .merge(
                    tileGeometry(
                        ee.Feature(feature).geometry()
                    )
                )
        return ee.FeatureCollection(
            featureCollection.iterate(mergeTile, ee.FeatureCollection([]))
        )
    }

    return tileFeatureCollection(featureCollection)
}

module.exports = tile
