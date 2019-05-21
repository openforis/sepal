from sepal.ee.image import evaluate


def to_ndvi(image):
    """
    Calculates the Normalized Difference Vegetation Index (NDVI) for the provided image.

    Required bands: ['red', 'nir']

    Args:
        image: Image to calculate NDVI for

    Returns:
        If image contains required bands, single band image named 'ndvi', otherwise an image without bands.
    """
    return evaluate(
        image=image,
        required_bands=['red', 'nir'],
        expression='(nir - red) / (nir + red)',
        name='ndvi'
    )


def to_ndmi(image):
    """
    Calculates the Normalized Difference Moisture Index (NDMI) for the provided image.

    Required bands: ['nir', 'swir1']

    Args:
        image: Image to calculate NDMI for

    Returns:
        If image contains required bands, single band image named 'ndmi', otherwise an image without bands.
    """
    return evaluate(
        image=image,
        required_bands=['nir', 'swir1'],
        expression='(nir - swir1) / (nir + swir1)',
        name='ndmi'
    )


def to_ndwi(image):
    """
    Calculates the Normalized Difference Water Index (NDWI) for the provided image.

    Required bands: ['green', 'nir']

    Args:
        image: Image to calculate NDWI for

    Returns:
        If image contains required bands, single band image named 'ndwi', otherwise an image without bands.
    """
    return evaluate(
        image=image,
        required_bands=['green', 'nir'],
        expression='(green - nir) / (green + nir)',
        name='ndwi'
    )


def to_mndwi(image):
    """
    Calculates the Modified Normalized Difference Water Index (MNDWI) for the provided image.

    Required bands: ['green', 'swir1']

    Args:
        image: Image to calculate MNDWI for

    Returns:
        If image contains required bands, single band image named 'mndwi', otherwise an image without bands.
    """
    return evaluate(
        image=image,
        required_bands=['green', 'swir1'],
        expression='(green - swir1) / (green + swir1)',
        name='mndwi'
    )


def to_evi(image, L=1, C1=6, C2=7.5, G=2.5):
    """
    Calculates the Enhanced Vegetation Index (EVI) for the provided image.

    Required bands: ['blue', 'red', 'nir']

    Args:
        image: Image to calculate EVI for

        L: (optional) Canopy background adjustment

        C1: (optional) Aerosol resistance term 1

        C2: (optional) Aerosol resistance term 2

        G: (optional) Gain factor

    Returns:
        If image contains required bands, single band image named 'evi', otherwise an image without bands.
    """
    return evaluate(
        image=image,
        required_bands=['blue', 'red', 'nir'],
        expression='{G} * ((nir - red) / (nir + {C1} * red - {C2} * blue + {L}))'.format(L=L, C1=C1, C2=C2, G=G),
        name='evi'
    )


def to_evi2(image):
    """
    Calculates the Enhanced Vegetation Index 2 (EVI2) for the provided image.

    Required bands: ['red', 'nir']

    Args:
        image: Image to calculate EVI2 for

    Returns:
        If image contains required bands, single band image named 'evi2', otherwise an image without bands.
    """
    return evaluate(
        image=image,
        required_bands=['blue', 'red', 'nir'],
        expression='2.5 * (nir - red) / (nir + 2.4 * red + 1)',
        name='evi2'
    )


def to_savi(image, L=0.5):
    """
    Calculates the Soil-adjusted Vegetation Index (SAVI) for the provided image.

    Required bands: ['red', 'nir']

    Args:
        image: Image to calculate SAVI for

        L: (optional) Soil brightness correction factor

    Returns:
        If image contains required bands, single band image named 'savi', otherwise an image without bands.
    """
    return evaluate(
        image=image,
        required_bands=['red', 'nir'],
        expression='(nir - red) * (1 + {L})/(nir + red + {L})'.format(L=L),
        name='savi'
    )


def to_nbr(image):
    """
    Calculates the Normalized Burn Ratio (NBR) for the provided image.

    Required bands: ['nir', 'swir2']

    Args:
        image: Image to calculate NBR for

    Returns:
        If image contains required bands, single band image named 'NBR', otherwise an image without bands.
    """
    return evaluate(
        image=image,
        required_bands=['nir', 'swir2'],
        expression='(nir - swir2) / (nir + swir2)',
        name='nbr'
    )


def to_ui(image):
    """
    Calculates the Urban Index (UI) for the provided image.

    Required bands: ['nir', 'swir2']

    Args:
        image: Image to calculate UI for

    Returns:
        If image contains required bands, single band image named 'ui', otherwise an image without bands.
    """
    return evaluate(
        image=image,
        required_bands=['nir', 'swir2'],
        expression='(swir2 - nir) / (swir2 + nir)',
        name='ui'
    )


def to_ndbi(image):
    """
    Calculates the Normalized Difference Built-up Index (NDBI) for the provided image.

    Required bands: ['nir', 'swir1']

    Args:
        image: Image to calculate NDBI for

    Returns:
        If image contains required bands, single band image named 'ndbi', otherwise an image without bands.
    """
    return evaluate(
        image=image,
        required_bands=['nir', 'swir1'],
        expression='(swir1 - nir) / (swir1 + nir)',
        name='ndbi'
    )


def to_ibi(image, high_plant_cover=False, L=0.5):
    """
    Calculates the Index-based Built-up Index (IBI) for the provided image.

    Required bands: ['green', 'red', 'nir', 'swir1']

    Args:
        image: Image to calculate IBI for

        high_plant_cover: Set to True if plant cover is over 30%. It will then use NDVI instead of SAVI in
            the calculation

        L: (optional) Soil brightness correction factor. Will have no effect when high plant cover.


    Returns:
        If image contains required bands, single band image named 'savi', otherwise an image without bands.
    """
    ndbi = to_ndbi(image)
    mndwi = to_mndwi(image)
    if high_plant_cover:
        ndvi = to_ndvi(image)
        return evaluate(
            ndbi.addBands(ndvi).addBands(mndwi),
            ['ndbi', 'ndvi', 'mndwi'],
            '(ndbi - (ndvi + mndwi) / 2) / (ndbi + (ndvi + mndwi) / 2)',
            'ibi'
        )
    else:
        savi = to_savi(image, L)
        return evaluate(
            ndbi.addBands(savi).addBands(mndwi),
            ['ndbi', 'savi', 'mndwi'],
            '(ndbi - (savi + mndwi) / 2) / (ndbi + (savi + mndwi) / 2)',
            'ibi'
        )


def to_ndi(image):
    """
    Calculates the New Built-up Index (NBI) for the provided image.

    Required bands: ['red', 'nir', 'swir1']

    Args:
        image: Image to calculate NBI for

    Returns:
        If image contains required bands, single band image named 'nbi', otherwise an image without bands.
    """
    return evaluate(
        image=image,
        required_bands=['red', 'nir', 'swir1'],
        expression='red * swir1 / nir',
        name='nbi'
    )


def to_ebbi(image):
    """
    Calculates the Enhanced Built-up and Bareness Index (EBBI) for the provided image.

    Required bands: ['nir', 'swir1', 'thermal']

    Args:
        image: Image to calculate EBBI for

    Returns:
        If image contains required bands, single band image named 'ebbi', otherwise an image without bands.
    """
    return evaluate(
        image=image,
        required_bands=['nir', 'swir1', 'swir2'],
        expression='(swir1 - nir) / 10 * sqrt(swir1 + thermal)',
        name='ebbi'
    )


def to_bui(image):
    """
    Calculates the Built-up Index (BUI) for the provided image.

    Required bands: ['red', 'swir1', 'swir2']

    Args:
        image: Image to calculate BUI for

    Returns:
        If image contains required bands, single band image named 'bui', otherwise an image without bands.
    """
    return evaluate(
        image=image,
        required_bands=['red', 'swir1', 'swir2'],
        expression='(red - swir1) / (red + swir) + (swir2 - swir1) / (swir2 + swir1)',
        name='bui'
    )
