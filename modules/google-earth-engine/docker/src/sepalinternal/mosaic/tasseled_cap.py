import ee

optical_bands = ['blue', 'green', 'red', 'nir', 'swir1', 'swir2']
tasseled_cap_bands = ['brightness', 'greenness', 'wetness', 'fourth', 'fifth', 'sixth']


def tasseled_cap(image):
    coefficients = ee.Array([
        [0.3037, 0.2793, 0.4743, 0.5585, 0.5082, 0.1863],
        [-0.2848, -0.2435, -0.5436, 0.7243, 0.0840, -0.1800],
        [0.1509, 0.1973, 0.3279, 0.3406, -0.7112, -0.4572],
        [-0.8242, 0.0849, 0.4392, -0.0580, 0.2012, -0.2768],
        [-0.3280, 0.0549, 0.1075, 0.1855, -0.4357, 0.8085],
        [0.1084, -0.9022, 0.4120, 0.0573, -0.0251, 0.0238]
    ])

    arrayImage1D = image.select(optical_bands).divide(10000).toArray()
    arrayImage2D = arrayImage1D.toArray(1)

    return image.addBands(
        ee.Image(coefficients)
            .matrixMultiply(arrayImage2D)
            .arrayProject([0])
            .arrayFlatten([tasseled_cap_bands])
            .multiply(10000)
            .int16()
    )
