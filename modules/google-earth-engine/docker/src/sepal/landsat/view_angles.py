import ee

from util import *

MAX_DISTANCE = 1000000

def create(footprint):
    return (azimuth(footprint), zenith(footprint))


def azimuth(footprint):
    upperCenter = line_from_coords(footprint, UPPER_LEFT, UPPER_RIGHT).centroid().coordinates()
    lowerCenter = line_from_coords(footprint, LOWER_LEFT, LOWER_RIGHT).centroid().coordinates()
    slope = ((y(lowerCenter)).subtract(y(upperCenter))).divide((x(lowerCenter)).subtract(x(upperCenter)))
    slopePerp = ee.Number(-1).divide(slope)
    azimuthLeft = ee.Image(PI.divide(2).subtract((slopePerp).atan()))
    return azimuthLeft.rename(['viewAz'])


def zenith(footprint):
    leftLine = line_from_coords(footprint, UPPER_LEFT, LOWER_LEFT)
    rightLine = line_from_coords(footprint, UPPER_RIGHT, LOWER_RIGHT)
    leftDistance = ee.FeatureCollection(leftLine).distance(MAX_DISTANCE)
    rightDistance = ee.FeatureCollection(rightLine).distance(MAX_DISTANCE)
    viewZenith = rightDistance.multiply(ee.Number(MAX_SATELLITE_ZENITH * 2)) \
        .divide(rightDistance.add(leftDistance)) \
        .subtract(ee.Number(MAX_SATELLITE_ZENITH)) \
        .clip(ee.Geometry.Polygon(footprint)) \
        .rename(['viewZen'])
    return degToRad(viewZenith)
