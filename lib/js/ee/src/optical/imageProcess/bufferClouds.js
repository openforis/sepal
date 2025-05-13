const ee = require('#sepal/ee/ee')

const bufferClouds = meters =>
    image => {
        const cloud = image.select('cloud')
        const minCloudDistance = 50

        // Clouds with radius < minCloudDistance will not have any inner pixels, and will not get buffered
        const innerPixel = cloud.not()
            .fastDistanceTransform(256, 'pixels').sqrt()
            .multiply(ee.Image.pixelArea().sqrt())
            .gt(minCloudDistance)
            .and(cloud)

        const distanceToInnerPixel = innerPixel
            .fastDistanceTransform(256, 'pixels').sqrt()
            .multiply(ee.Image.pixelArea().sqrt())

        const bufferedClouds = distanceToInnerPixel
            .lt(ee.Number(meters).add(minCloudDistance))
            .or(cloud)
            .rename('cloud')

        return image.addBands(bufferedClouds, null, true)
    }

module.exports = bufferClouds
