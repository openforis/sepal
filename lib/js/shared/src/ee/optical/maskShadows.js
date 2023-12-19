const ee = require('#sepal/ee')

const maskShadows = () =>
    collection => {
        const medianShadowScore = collection.select('shadowScore').median()
            .addBands(ee.Image().rename('shadowScore')).select('shadowScore') // Handle empty collection case (0 band median)
        // Outlier if it's significantly darker than the median
        const shadowScoreThreshold = medianShadowScore.multiply(0.7)
        return collection.map(
            image => image.updateMask(
                image.select('shadowScore').gt(shadowScoreThreshold)
            )
        )
    }

module.exports = maskShadows
