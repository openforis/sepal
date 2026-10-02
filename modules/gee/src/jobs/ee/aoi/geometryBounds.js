import ee from '#sepal/ee/ee'

// The bounds of a resolved area of interest as [[west, south], [east, north]], the whole world when unbounded.
export const geometryBounds$ = geometry => {
    const boundsPolygon = ee.List(geometry.bounds().coordinates().get(0))
    const bounds = ee.Algorithms.If(
        geometry.isUnbounded(),
        [[-180, -90], [180, 90]],
        [boundsPolygon.get(0), boundsPolygon.get(2)]
    )
    return ee.getInfo$(bounds, 'get bounds')
}
