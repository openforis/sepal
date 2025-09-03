const ee = require('#sepal/ee/ee')

const x = point => ee.Number(ee.List(point).get(0))
const y = point => ee.Number(ee.List(point).get(1))
const pointBetween = (pointA, pointB) => ee.Geometry.LineString([pointA, pointB]).centroid().coordinates()
const slopeBetween = (pointA, pointB) => ((y(pointA)).subtract(y(pointB))).divide((x(pointA)).subtract(x(pointB)))
const toLine = (pointA, pointB) => ee.Geometry.LineString([pointA, pointB])

module.exports = {
    x, y, pointBetween, slopeBetween, toLine
}
