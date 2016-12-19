import ee


def apply(image, mosaic_def):
    """Use time-coincident NBAR MODIS to correct reflectance of Landsat for
    sun-target-sensor effects.

    :param image: The image to correct.
    :type image: ee.Image

    :param mosaic_def: The mosaic definition.
    :type mosaic_def: sepal.landsat.landsatmosaic.LandsatMosaic

    :return: The ee.Image with correction applied.
    """
    modis_median = _create_modis_median(mosaic_def.from_date, mosaic_def.to_date, mosaic_def.aoi.geometry())
    lsat_tmp = image.select(['B3', 'B4', 'B5', 'B7'])
    nbar = modis_median.select('Nadir_Reflectance_Band1').rename(['red']) \
        .addBands(modis_median.select('Nadir_Reflectance_Band2').rename(['nir'])) \
        .addBands(modis_median.select('Nadir_Reflectance_Band6').rename(['swir1'])) \
        .addBands(modis_median.select('Nadir_Reflectance_Band7').rename(['swir2']))
    nbar_float = nbar.toFloat()
    nbar_fmean = nbar_float.focal_mean(radius=2500, units="meters")
    lsat_fmean = lsat_tmp.focal_mean(radius=2500, units="meters")

    lsat_nbar = lsat_tmp.expression(
        'TOA / A * B * 0.0001', {
            'TOA': lsat_tmp,
            'A': lsat_fmean,
            'B': nbar_fmean
        })

    # Transformer les TOA corriges en DN avec une equation specifique (pour reduire la taille)
    red_byte = lsat_nbar.select('B3').multiply(508).add(1).byte()
    nir_byte = lsat_nbar.select('B4').multiply(254).add(1).byte()
    sw1_byte = lsat_nbar.select('B5').multiply(363).add(1).byte()
    sw2_byte = lsat_nbar.select('B7').multiply(423).add(1).byte()

    return image \
        .addBands(red_byte.rename(['B3_brdf'])) \
        .addBands(nir_byte.rename(['B4_brdf'])) \
        .addBands(sw1_byte.rename(['B5_brdf'])) \
        .addBands(sw2_byte.rename(['B7_brdf']))


def _create_modis_median(from_date, to_date, aoi):
    modis_coll = ee.ImageCollection('MODIS/MCD43A4').filterDate(from_date, to_date).filterBounds(aoi).map(
        lambda image: _modis_mask_clouds(image))
    modis_median = modis_coll.median()
    return modis_median


def _modis_mask_clouds(image):
    return image.updateMask(image.select(['Nadir_Reflectance_Band2']).gt(0))
