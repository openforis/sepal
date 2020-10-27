const maskShadows = () =>
    collection => {
        const medianShadowScore = collection.select('shadowScore').median()
        // Outlier if it's significantly darker than the median
        const shadowScoreThreshold = medianShadowScore.multiply(0.7)
        return collection.map(
            image => image.updateMask(
                image.select('shadowScore').gt(shadowScoreThreshold)
            )
        )
    }

module.exports = maskShadows
