const ee = require('#sepal/ee')
const _ = require('lodash')

const addTasseledCap = (image, selectedBands) => {
    const opticalBands = ['blue', 'green', 'red', 'nir', 'swir1', 'swir2']
    const tasseledCapBands = ['brightness', 'greenness', 'wetness', 'fourth', 'fifth', 'sixth']
    const tasseledCapBandsSelected = _.intersection(selectedBands, tasseledCapBands).length > 0
    if (!selectedBands.length || tasseledCapBandsSelected) {
        const coefs = ee.Array([
            [0.3037, 0.2793, 0.4743, 0.5585, 0.5082, 0.1863],
            [-0.2848, -0.2435, -0.5436, 0.7243, 0.0840, -0.1800],
            [0.1509, 0.1973, 0.3279, 0.3406, -0.7112, -0.4572],
            [-0.8242, 0.0849, 0.4392, -0.0580, 0.2012, -0.2768],
            [-0.3280, 0.0549, 0.1075, 0.1855, -0.4357, 0.8085],
            [0.1084, -0.9022, 0.4120, 0.0573, -0.0251, 0.0238]
        ])
        const arrayImage = image.select(opticalBands).divide(10000).toArray().toArray(1)
        return image.addBandsReplace(
            ee.Image(coefs)
                .matrixMultiply(arrayImage)
                .arrayProject([0])
                .arrayFlatten([tasseledCapBands])
                .multiply(10000)
                .int16()
        )
    } else {
        return image
    }

}

module.exports = addTasseledCap
