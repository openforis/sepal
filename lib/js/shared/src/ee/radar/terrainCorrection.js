const ee = require('sepal/ee')

// Implementation by Andreas Vollrath (ESA), inspired by Johannes Reiche (Wageningen)
var terrainCorrection = function(image, options) {
    // set defaults if undefined
    options = options || {}
    var model = options.model || 'volume'
    var elevation = options.elevation || ee.Image('USGS/SRTMGL1_003')
    var buffer = options.buffer || 50

    // we need a 90 degree in radians image for a couple of calculations
    var ninetyRad = ee.Image.constant(90).multiply(Math.PI / 180)

    // Volumetric Model Hoekman 1990
    function _volume_model(theta_iRad, alpha_rRad) {
        var nominator = (ninetyRad.subtract(theta_iRad).add(alpha_rRad)).tan()
        var denominator = (ninetyRad.subtract(theta_iRad)).tan()
        return nominator.divide(denominator)
    }

    // surface model Ulander et al. 1996
    function _surface_model(theta_iRad, alpha_rRad, alpha_azRad) {

        var nominator = (ninetyRad.subtract(theta_iRad)).cos()
        var denominator = alpha_azRad.cos()
            .multiply((ninetyRad.subtract(theta_iRad).add(alpha_rRad)).cos())
        return nominator.divide(denominator)
    }

    // buffer function (thanks Noel)
    function _erode(img, distance) {

        var d = (img.not().unmask(1)
            .fastDistanceTransform(30).sqrt()
            .multiply(ee.Image.pixelArea().sqrt()))

        return img.updateMask(d.gt(distance))
    }

    // calculate masks
    function _masking(alpha_rRad, theta_iRad, proj, buffer) {

        // layover, where slope > radar viewing angle
        var layover = alpha_rRad.lt(theta_iRad).rename('layover')

        // shadow
        var shadow = alpha_rRad.gt(ee.Image.constant(-1).multiply(ninetyRad.subtract(theta_iRad))).rename('shadow')

        // combine layover and shadow
        var mask = layover.and(shadow)

        // add buffer to final mask
        if (buffer > 0)
            mask = _erode(mask, buffer)

        return mask.rename('no_data_mask')
    }

    function _correct(image) {
        
        // get image geometry and projection
        var geom = image.geometry()
        var proj = image.select(1).projection()

        var heading = (ee.Terrain.aspect(
            image.select('angle')
        ).reduceRegion(
            ee.Reducer.mean(),
            image.geometry(),
            1000
        ))

        // in case of null values for heading replace with 0
        heading = ee.Dictionary(heading).combine({
            aspect: 0
        }, false).get('aspect')
        
        heading = ee.Algorithms.If(
            ee.Number(heading).gt(180),
            ee.Number(heading).subtract(360),
            ee.Number(heading)
        )
        
        // the numbering follows the article chapters
        // 2.1.1 Radar geometry
        var theta_iRad = image.select('angle').multiply(Math.PI / 180).clip(geom)
        var phi_iRad = ee.Image.constant(heading).multiply(Math.PI / 180)

        // 2.1.2 Terrain geometry
        //slope 
        var alpha_sRad = ee.Terrain.slope(elevation).select('slope').multiply(Math.PI / 180)
        
        // aspect (-180 to 180)
        var aspect = ee.Terrain.aspect(elevation).select('aspect').clip(geom)
        
        // we need to subtract 360 degree from all values above 180 degree
        var aspect_minus = aspect
          .updateMask(aspect.gt(180))
          .subtract(360)

        // we fill the aspect layer with the subtracted values from aspect_minus
        var phi_sRad = aspect
          .updateMask(aspect.lte(180))
          .unmask() 
          .add(aspect_minus.unmask()) //add the minus values
          .multiply(-1)   // make aspect uphill
          .multiply(Math.PI / 180) // make it rad
        
        // 2.1.3 Model geometry
        //reduce to 3 angle
        var phi_rRad = phi_iRad.subtract(phi_sRad)

        // slope steepness in range (eq. 2)
        var alpha_rRad = (alpha_sRad.tan().multiply(phi_rRad.cos())).atan()

        // slope steepness in azimuth (eq 3)
        var alpha_azRad = (alpha_sRad.tan().multiply(phi_rRad.sin())).atan()

        // 2.2
        // Gamma_nought
        var gamma0 = image.divide(theta_iRad.cos())

        // models
        if (model == 'volume')
            var corrModel = _volume_model(theta_iRad, alpha_rRad)

        if (model == 'surface')
            var corrModel = _surface_model(theta_iRad, alpha_rRad, alpha_azRad)

        if (model == 'direct')
            var corrModel = _direct_model(theta_iRad, alpha_rRad, alpha_azRad)

        // apply model for Gamm0_f
        var gamma0_flat = gamma0.select(['VV', 'VH']).multiply(corrModel)

        // get Layover/Shadow mask
        var mask = _masking(alpha_rRad, theta_iRad, proj, buffer)

        // return gamma_flat plus mask
        return gamma0_flat
            .addBands(image.select('angle'))
            .updateMask(mask)
            .copyProperties(image)
            .set('system:time_start', image.get('system:time_start'))

    }

    // run and return correction
    return ee.Image(_correct(image))

}

module.exports = {terrainCorrection}
