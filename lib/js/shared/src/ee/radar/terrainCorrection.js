const ee = require('#sepal/ee')

// Implementation by Andreas Vollrath (ESA), inspired by Johannes Reiche (Wageningen)
const terrainCorrection = function (image, options, bandNames, projection) {
    // set defaults if undefined
    options = options || {}
    const model = options.model || 'volume'
    const collection = ee.ImageCollection('COPERNICUS/DEM/GLO30')
        .filterBounds(image.geometry())
        .select(['DEM'], ['elevation'])
        .map(function (image) {
            return image.resample()
        })
    const elevation = collection
        .mosaic()
        .setDefaultProjection(projection)
        
    const buffer = options.buffer || 0

    // we need a 90 degree in radians image for a couple of calculations
    const ninetyRad = ee.Image.constant(90).multiply(Math.PI / 180)

    // function to get the look direction of the satellite
    function get_look_direction(image) {
        // Get the coords as a transposed array
        const coords = ee.Array(image.geometry().coordinates().get(0)).transpose()
        const crdLons = ee.List(coords.toList().get(0))
        const crdLats = ee.List(coords.toList().get(1))
        const minLon = crdLons.sort().get(0)
        const minLat = crdLats.sort().get(0)

        const azimuth = ee.Number(crdLons.get(crdLats.indexOf(minLat))).subtract(minLon)
            .atan2(ee.Number(crdLats.get(crdLons.indexOf(minLon))).subtract(minLat))

        const look_direction = ee.Algorithms.If(
            ee.String(image.get('orbitProperties_pass')).compareTo('ASCENDING').eq(0),
            azimuth.subtract(Math.PI),
            azimuth.add(Math.PI / 2)
        )

        return ee.Number(look_direction)
    }

    // Volumetric Model Hoekman 1990
    function _volume_model(theta_iRad, alpha_rRad) {
        const nominator = (ninetyRad.subtract(theta_iRad).add(alpha_rRad)).tan()
        const denominator = (ninetyRad.subtract(theta_iRad)).tan()
        return nominator.divide(denominator)
    }

    // surface model Ulander et al. 1996
    function _surface_model(theta_iRad, alpha_rRad, alpha_azRad) {

        const nominator = (ninetyRad.subtract(theta_iRad)).cos()
        const denominator = alpha_azRad.cos()
            .multiply((ninetyRad.subtract(theta_iRad).add(alpha_rRad)).cos())
        return nominator.divide(denominator)
    }

    // buffer function (thanks Noel)
    function _erode(img, distance) {

        const d = (img.not().unmask(1)
            .fastDistanceTransform(30).sqrt()
            .multiply(ee.Image.pixelArea().sqrt()))

        return img.updateMask(d.gt(distance))
    }

    // calculate masks
    function _masking(alpha_rRad, theta_iRad, buffer) {

        // layover, where slope > radar viewing angle
        const layover = alpha_rRad.lt(theta_iRad).rename('layover')

        // shadow
        const shadow = alpha_rRad.gt(ee.Image.constant(-1).multiply(ninetyRad.subtract(theta_iRad))).rename('shadow')

        // combine layover and shadow
        let mask = layover.and(shadow)

        // add buffer to final mask
        if (buffer > 0)
            mask = _erode(mask, buffer)

        return mask.rename('no_data_mask')
    }

    function _correct(image) {
        // get image geometry and projection

        // the numbering follows the article chapters
        // 2.1.1 Radar geometry
        const theta_iRad = image.select('angle').multiply(Math.PI / 180)
        const phi_iRad = ee.Image.constant(get_look_direction(image))

        // 2.1.2 Terrain geometry
        const alpha_sRad = ee.Terrain.slope(elevation).select('slope').multiply(Math.PI / 180)
        const aspect = ee.Terrain.aspect(elevation).select('aspect')

        // we need to subtract 360 degree from all values above 180 degree
        const aspect_minus = aspect
            .updateMask(aspect.gt(180))
            .subtract(360)

        // we fill the aspect layer with the subtracted values
        const phi_sRad = aspect
            .updateMask(aspect.lte(180))
            .unmask()
            .add(aspect_minus.unmask()) //add the minus values
            .multiply(Math.PI / 180) // make it rad

        // 2.1.3 Model geometry
        //reduce to 3 angle
        const phi_rRad = phi_iRad.subtract(phi_sRad)

        // slope steepness in range (eq. 2)
        const alpha_rRad = (alpha_sRad.tan().multiply(phi_rRad.cos())).atan()

        // slope steepness in azimuth (eq 3)
        const alpha_azRad = (alpha_sRad.tan().multiply(phi_rRad.sin())).atan()

        // 2.2
        // Gamma_nought
        const gamma0 = image.divide(theta_iRad.cos())

        // models
        const corrModel = model === 'volume'
            ? _volume_model(theta_iRad, alpha_rRad)
            : model === 'surface'
                ? _surface_model(theta_iRad, alpha_rRad, alpha_azRad)
                : null

        // apply model for Gamm0_f
        const gamma0_flat = gamma0.select(bandNames).divide(corrModel)

        // get Layover/Shadow mask
        const mask = _masking(alpha_rRad, theta_iRad, buffer)

        // return gamma_flat plus mask
        return image
            .addBands(gamma0_flat, null, true)
            .updateMask(mask)
    }

    // run and return correction
    return image
        .addBands(
            ee.Image(_correct(image)), null, true
        )
}

module.exports = {terrainCorrection}
