const ee = require('#sepal/ee')

const maskClouds = () =>
    collection => {
        const onlyClouds = collection.select('cloud').reduce(ee.Reducer.min())
        return collection.map(
            image => image.updateMask(
                onlyClouds.or(image.select('cloud').not())
            )
        )
    }

module.exports = maskClouds
