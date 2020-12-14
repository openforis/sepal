const ee = require('ee')

// Implementation by Andreas Vollrath (ESA), inspired by Johannes Reiche (Wageningen)
const terrainCorrection = image => {
    const imgGeom = image.geometry()
    const srtm = ee.Image('USGS/SRTMGL1_003').clip(imgGeom) // 30m srtm
    const sigma0Pow = image

    // Article ( numbers relate to chapters)
    // 2.1.1 Radar geometry
    const theta_i = image.select('angle')
    const phi_i = ee.Terrain.aspect(theta_i)
        .reduceRegion(ee.Reducer.mean(), theta_i.get('system:footprint'), 1000)
        .get('aspect')

    // 2.1.2 Terrain geometry
    const alpha_s = ee.Terrain.slope(srtm).select('slope')
    const phi_s = ee.Terrain.aspect(srtm).select('aspect')

    // 2.1.3 Model geometry
    // reduce to 3 angle
    const phi_r = ee.Image.constant(phi_i).subtract(phi_s)

    // convert all to radians
    const phi_rRad = phi_r.multiply(Math.PI / 180)
    const alpha_sRad = alpha_s.multiply(Math.PI / 180)
    const theta_iRad = theta_i.multiply(Math.PI / 180)
    const ninetyRad = ee.Image.constant(90).multiply(Math.PI / 180)

    // slope steepness in range (eq. 2)
    const alpha_r = (alpha_sRad.tan().multiply(phi_rRad.cos())).atan()

    // slope steepness in azimuth (eq 3)
    const alpha_az = (alpha_sRad.tan().multiply(phi_rRad.sin())).atan()

    // local incidence angle (eq. 4)
    const theta_lia = (alpha_az.cos().multiply((theta_iRad.subtract(alpha_r)).cos())).acos()
    const theta_liaDeg = theta_lia.multiply(180 / Math.PI)
    // 2.2
    // Gamma_nought_flat
    const gamma0 = sigma0Pow.divide(theta_iRad.cos())
    const gamma0dB = ee.Image.constant(10).multiply(gamma0.log10())
    const ratio_1 = gamma0dB.select('VV').subtract(gamma0dB.select('VH'))

    // Volumetric Model
    const nominator = (ninetyRad.subtract(theta_iRad).add(alpha_r)).tan()
    const denominator = (ninetyRad.subtract(theta_iRad)).tan()
    const volModel = (nominator.divide(denominator)).abs()

    // apply model
    const gamma0_Volume = gamma0.divide(volModel)
    const gamma0_VolumeDB = ee.Image.constant(10).multiply(gamma0_Volume.log10())

    // we add a layover/shadow maskto the original implmentation
    // layover, where slope > radar viewing angle
    const alpha_rDeg = alpha_r.multiply(180 / Math.PI)
    const layover = alpha_rDeg.lt(theta_i)

    // shadow where LIA > 90
    const shadow = theta_liaDeg.lt(85)

    // calculate the ratio for RGB vis
    const ratio = gamma0_VolumeDB.select('VV').subtract(gamma0_VolumeDB.select('VH'))

    const output = gamma0_VolumeDB.addBands(ratio).addBands(alpha_r).addBands(phi_s).addBands(theta_iRad)
        .addBands(layover).addBands(shadow).addBands(gamma0dB).addBands(ratio_1)

    const corrected = image.addBands(
        output.select(['VV', 'VH', 'slope_1', 'slope_2'], ['VV', 'VH', 'layover', 'shadow']),
        null,
        true
    )
    return corrected.updateMask(
        corrected.select('layover').and(corrected.select('shadow'))
    ).excludeBands('layover', 'shadow')
}

module.exports = {terrainCorrection}
