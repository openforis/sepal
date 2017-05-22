import ee

from util import *


def create(sunAz, sunZen, viewAz, viewZen):
    """Calculate kvol kernel.
    From Lucht et al. 2000
    Phase angle = cos(solar zenith) cos(view zenith) + sin(solar zenith) sin(view zenith) cos(relative azimuth)"""
    relative_azimuth = sunAz.subtract(viewAz).rename('relAz')
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

    kvol = p3.divide(p4).subtract(p5).rename('kvol')

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
