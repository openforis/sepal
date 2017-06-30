import ee

import sun_angles
import view_angles
from util import *


def apply(image):
    date = ee.Date(ee.Number(image.get('system:time_start')))
    footprint = determine_footprint(image)
    (sunAz, sunZen) = sun_angles.create(date, footprint)
    (viewAz, viewZen) = view_angles.create(footprint)
    (kvol, kvol0) = _kvol(sunAz, sunZen, viewAz, viewZen)
    return _apply(image, kvol.multiply(PI()), kvol0.multiply(PI()))


def _apply(image, kvol, kvol0):
    blue = _correct_band(image, 'blue', kvol, kvol0, f_iso=0.0774, f_geo=0.0079, f_vol=0.0372)
    green = _correct_band(image, 'green', kvol, kvol0, f_iso=0.1306, f_geo=0.0178, f_vol=0.0580)
    red = _correct_band(image, 'red', kvol, kvol0, f_iso=0.1690, f_geo=0.0227, f_vol=0.0574)
    nir = _correct_band(image, 'nir', kvol, kvol0, f_iso=0.3093, f_geo=0.0330, f_vol=0.1535)
    swir1 = _correct_band(image, 'swir1', kvol, kvol0, f_iso=0.3430, f_geo=0.0453, f_vol=0.1154)
    swir2 = _correct_band(image, 'swir2', kvol, kvol0, f_iso=0.2658, f_geo=0.0387, f_vol=0.0639)
    return replace_bands(image, [blue, green, red, nir, swir1, swir2])


def _correct_band(image, band_name, kvol, kvol0, f_iso, f_geo, f_vol):
    """fiso + fvol * kvol + fgeo * kgeo"""
    iso = ee.Image(f_iso)
    geo = ee.Image(f_geo)
    vol = ee.Image(f_vol)
    pred = vol.multiply(kvol).add(geo.multiply(kvol)).add(iso).rename(['pred'])
    pred0 = vol.multiply(kvol0).add(geo.multiply(kvol0)).add(iso).rename(['pred0'])
    cfac = pred0.divide(pred).rename(['cfac'])
    corr = image.select(band_name).multiply(cfac).rename([band_name])
    return corr


def _kvol(sunAz, sunZen, viewAz, viewZen):
    """Calculate kvol kernel.
    From Lucht et al. 2000
    Phase angle = cos(solar zenith) cos(view zenith) + sin(solar zenith) sin(view zenith) cos(relative azimuth)"""
    relative_azimuth = sunAz.subtract(viewAz).rename(['relAz'])
    pa1 = viewZen.cos() \
        .multiply(sunZen.cos())
    pa2 = viewZen.sin() \
        .multiply(sunZen.sin()) \
        .multiply(relative_azimuth.cos())
    phase_angle1 = pa1.add(pa2)
    phase_angle = phase_angle1.acos()
    p1 = ee.Image(PI().divide(2)).subtract(phase_angle)
    p2 = p1.multiply(phase_angle1)
    p3 = p2.add(phase_angle.sin())
    p4 = sunZen.cos().add(viewZen.cos())
    p5 = ee.Image(PI().divide(4))

    kvol = p3.divide(p4).subtract(p5).rename(['kvol'])

    viewZen0 = ee.Image(0)
    pa10 = viewZen0.cos() \
        .multiply(sunZen.cos())
    pa20 = viewZen0.sin() \
        .multiply(sunZen.sin()) \
        .multiply(relative_azimuth.cos())
    phase_angle10 = pa10.add(pa20)
    phase_angle0 = phase_angle10.acos()
    p10 = ee.Image(PI().divide(2)).subtract(phase_angle0)
    p20 = p10.multiply(phase_angle10)
    p30 = p20.add(phase_angle0.sin())
    p40 = sunZen.cos().add(viewZen0.cos())
    p50 = ee.Image(PI().divide(4))

    kvol0 = p30.divide(p40).subtract(p50).rename(['kvol0'])

    return (kvol, kvol0)
