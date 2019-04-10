from util import *

def create(date, footprint):
    jdp = date.getFraction('year')
    seconds_in_hour = 3600
    hourGMT = ee.Number(date.getRelative('second', 'day')) \
        .divide(seconds_in_hour)

    latRad = degToRad(ee.Image.pixelLonLat().select('latitude'))
    longDeg = ee.Image.pixelLonLat().select('longitude')

    # Julian day proportion in radians
    jdpr = jdp.multiply(PI()).multiply(2)

    a = ee.List([0.000075, 0.001868, 0.032077, 0.014615, 0.040849])
    meanSolarTime = longDeg.divide(15.0).add(ee.Number(hourGMT))
    localSolarDiff1 = value(a, 0) \
        .add(value(a, 1).multiply(jdpr.cos())) \
        .subtract(value(a, 2).multiply(jdpr.sin())) \
        .subtract(value(a, 3).multiply(jdpr.multiply(2).cos())) \
        .subtract(value(a, 4).multiply(jdpr.multiply(2).sin()))

    localSolarDiff2 = localSolarDiff1.multiply(12 * 60)

    localSolarDiff = localSolarDiff2.divide(PI())
    trueSolarTime = meanSolarTime \
        .add(localSolarDiff.divide(60)) \
        .subtract(12.0)

    # Hour as an angle
    ah = trueSolarTime.multiply(degToRad(ee.Number(MAX_SATELLITE_ZENITH * 2)))
    b = ee.List([0.006918, 0.399912, 0.070257, 0.006758, 0.000907, 0.002697, 0.001480])
    delta = value(b, 0) \
        .subtract(value(b, 1).multiply(jdpr.cos())) \
        .add(value(b, 2).multiply(jdpr.sin())) \
        .subtract(value(b, 3).multiply(jdpr.multiply(2).cos())) \
        .add(value(b, 4).multiply(jdpr.multiply(2).sin())) \
        .subtract(value(b, 5).multiply(jdpr.multiply(3).cos())) \
        .add(value(b, 6).multiply(jdpr.multiply(3).sin()))
    cosSunZen = latRad.sin().multiply(delta.sin()) \
        .add(latRad.cos().multiply(ah.cos()).multiply(delta.cos()))
    sunZen = cosSunZen.acos()

    # sun azimuth from south, turning west
    sinSunAzSW = ah.sin().multiply(delta.cos()).divide(sunZen.sin())
    sinSunAzSW = sinSunAzSW.clamp(-1.0, 1.0)

    cosSunAzSW = (latRad.cos().multiply(-1).multiply(delta.sin())
                  .add(latRad.sin().multiply(delta.cos()).multiply(ah.cos()))) \
        .divide(sunZen.sin())
    sunAzSW = sinSunAzSW.asin()

    sunAzSW = where(cosSunAzSW.lte(0), sunAzSW.multiply(-1).add(PI()), sunAzSW)
    sunAzSW = where(cosSunAzSW.gt(0).And(sinSunAzSW.lte(0)), sunAzSW.add(PI().multiply(2)), sunAzSW)

    sunAz = sunAzSW.add(PI())
    # Keep within [0, 2pi] range
    sunAz = where(sunAz.gt(PI().multiply(2)), sunAz.subtract(PI().multiply(2)), sunAz)

    footprint_polygon = ee.Geometry.Polygon(footprint)
    sunAz = sunAz.clip(footprint_polygon)
    sunAz = sunAz.rename(['sunAz'])
    sunZen = sunZen.clip(footprint_polygon).rename(['sunZen'])

    return (sunAz, sunZen)
