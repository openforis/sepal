import ee
import math

# Volumetric model (Hoekman & Reiche 2015)
def apply(image):
    geometry = image.geometry()
    srtm = ee.Image('USGS/SRTMGL1_003').clip(geometry)

    # convert Sigma0 dB to Power
    sigma0_pow = ee.Image.constant(10).pow(image.divide(10.0))

    # Article ( numbers relate to chapters)
    # 2.1.1 Radar geometry
    theta_i = image.select('angle')
    phi_i = ee.Terrain.aspect(theta_i).reduceRegion(
        reducer=ee.Reducer.mean(),
        geometry=geometry,
        scale=100
    ).get('aspect')

    # 2.1.2 Terrain geometry
    alpha_s = ee.Terrain.slope(srtm).select('slope')
    phi_s = ee.Terrain.aspect(srtm).select('aspect')

    # 2.1.3 Model geometry
    # reduce to 3 angle
    phi_r = ee.Image.constant(phi_i).subtract(phi_s)

    # convert all to radians
    phi_rRad = phi_r.multiply(math.pi/180)
    alpha_sRad = alpha_s.multiply(math.pi/180)
    theta_iRad = theta_i.multiply(math.pi/180)
    ninetyRad = ee.Image.constant(90).multiply(math.pi/180)

    # slope steepness in range (eq. 2)
    alpha_r = (alpha_sRad.tan().multiply(phi_rRad.cos())).atan()

    # slope steepness in azimuth (eq 3)
    alpha_az = (alpha_sRad.tan().multiply(phi_rRad.sin())).atan()

    # local incidence angle (eq. 4)
    theta_lia = (alpha_az.cos().multiply((theta_iRad.subtract(alpha_r)).cos())).acos()
    theta_liaDeg = theta_lia.multiply(180/math.pi)

    # 2.2
    # Gamma_nought_flat
    gamma0 = sigma0_pow.divide(theta_iRad.cos())
    gamma0dB = ee.Image.constant(10).multiply(gamma0.log10())
    ratio_1 = gamma0dB.select('VV').subtract(gamma0dB.select('VH'))

    # Volumetric Model
    nominator = (ninetyRad.subtract(theta_iRad).add(alpha_r)).tan()
    denominator = (ninetyRad.subtract(theta_iRad)).tan()
    volModel = (nominator.divide(denominator)).abs()

    # apply model
    gamma0_Volume = gamma0.divide(volModel)
    gamma0_VolumeDB = ee.Image.constant(10).multiply(gamma0_Volume.log10())

    # we add a layover/shadow mask to the original implementation
    # layover, where slope > radar viewing angle
    alpha_rDeg = alpha_r.multiply(180/math.pi)
    layover = alpha_rDeg.lt(theta_i)

    # shadow where LIA > 90
    shadow = theta_liaDeg.lt(85)

    # calculate the ratio for RGB vis
    ratio = gamma0_VolumeDB.select('VV').subtract(gamma0_VolumeDB.select('VH'))

    output = gamma0_VolumeDB.addBands(ratio).addBands(alpha_r).addBands(phi_s).addBands(theta_iRad) \
        .addBands(layover).addBands(shadow).addBands(gamma0dB).addBands(ratio_1)

    # rename bands for output
    output = ee.Image(
        output.select(
            ['VV', 'VH', 'slope_1', 'slope_2'],
            ['VV', 'VH', 'layover', 'shadow']
        )
        .addBands(image.select('angle'))
        .set('system:time_start', image.get('system:time_start'))
        .copyProperties(image)
    )

    return output
