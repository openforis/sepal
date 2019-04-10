import ee
import math

UPPER_LEFT = 0
LOWER_LEFT = 1
LOWER_RIGHT = 2
UPPER_RIGHT = 3
PI = lambda: ee.Number(math.pi)
MAX_SATELLITE_ZENITH = 7.5

def line_from_coords(coordinates, fromIndex, toIndex):
    return ee.Geometry.LineString(ee.List([
        coordinates.get(fromIndex),
        coordinates.get(toIndex)]))


def line(start, end):
    return ee.Geometry.LineString(ee.List([start, end]))


def degToRad(deg):
    return deg.multiply(PI().divide(180))


def value(list, index):
    return ee.Number(list.get(index))


def radToDeg(rad):
    return rad.multiply(180).divide(PI())


def where(condition, trueValue, falseValue):
    trueMasked = trueValue.mask(condition)
    falseMasked = falseValue.mask(invertMask(condition))
    return trueMasked.unmask(falseMasked)


def invertMask(mask):
    return mask.multiply(-1).add(1)


def x(point):
    return ee.Number(ee.List(point).get(0))


def y(point):
    return ee.Number(ee.List(point).get(1))


def determine_footprint(image):
    footprint = ee.Geometry(image.get('system:footprint'))
    bounds = ee.List(footprint.bounds().coordinates().get(0))
    coords = footprint.coordinates()

    xs = coords.map(lambda item: x(item))
    ys = coords.map(lambda item: y(item))

    def findCorner(targetValue, values):
        diff = values.map(lambda value: ee.Number(value).subtract(targetValue).abs())
        minValue = diff.reduce(ee.Reducer.min())
        idx = diff.indexOf(minValue)
        return coords.get(idx)

    lowerLeft = findCorner(x(bounds.get(0)), xs)
    lowerRight = findCorner(y(bounds.get(1)), ys)
    upperRight = findCorner(x(bounds.get(2)), xs)
    upperLeft = findCorner(y(bounds.get(3)), ys)

    return ee.List([upperLeft, lowerLeft, lowerRight, upperRight, upperLeft])


def replace_bands(image, bands):
    result = image
    for band in bands:
        result = result.addBands(band, overwrite=True)
    return result
