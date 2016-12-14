import ee


def apply(image, image_day_of_year):
    """Applies TOA correction to image on provided bands based on specified day of year.

    :param image: The image to apply TOA correction on.
    :type image: ee.Image

    :param image_day_of_year: The image's day of year.
    :type image_day_of_year: ee.Number

    :param bands: The bands to apply the correction to.
    :type bands: iterable

    :return: An ee.Image with the correction applied.
    """
    toa_correction = _calculate_toa_correction(image_day_of_year)
    bands_to_toa_correct = ['B1', 'B2', 'B3', 'B4', 'B5', 'B7', 'B10']
    adjusted_bands = []
    for band in bands_to_toa_correct:
        adjusted_bands.append(
            image.select(band).float().divide(toa_correction).multiply(10000)
        )
    result = image
    for adjusted in adjusted_bands:
        result = result.addBands(adjusted, overwrite=True)
    return result


def _calculate_toa_correction(day_of_year):
    """Correct TOA reflectance for sun angle per pixel.

    Following the equations from
    http://www.itacanet.org/the-sun-as-a-source-of-energy/part-3-calculating-solar-angles/
    and http://landsat.usgs.gov/Landsat8_Using_Product.php

    :param day_of_year: The day of year to calculate the correction for
    :type day_of_year: ee.Number

    :return: The correction as an ee.Number.
    """
    # Back to correcting for sun angle...
    # Setup degrees to radians conversion
    pi = ee.Number(3.14159265359)
    pipi = pi.multiply(2)
    deg2rad = pi.divide(180)
    # Calc precise day of year
    part2 = day_of_year.add(284).divide(36.25)
    # Calc declination angle
    part22 = pipi.multiply(part2)
    part222 = part22.sin()
    dec_angle = deg2rad.multiply(23.45).multiply(part222)
    # Hour angle
    hour_angle = deg2rad.multiply(-22.5)
    # Per-pixel latitude and longitude
    # latlon = ee.Image.pixelLonLat()
    lat = ee.Image.pixelLonLat().select('latitude').multiply(deg2rad)
    # Solar elevation angle
    cosh = hour_angle.cos()
    cosd = dec_angle.cos()
    coslat = lat.cos()
    sind = dec_angle.sin()
    sinlat = lat.sin()
    solar_elev1 = coslat.multiply(cosd).multiply(cosh)
    solar_elev2 = sinlat.multiply(sind)
    solar_elev = solar_elev1.add(solar_elev2)
    toa_cor2 = solar_elev.sin()
    return toa_cor2
