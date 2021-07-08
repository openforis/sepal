const ee = require('sepal/ee')

const applyPercentileFilter = (bandName, percentile) =>
    collection => {
        const threshold = collection.select(bandName)
            .reduce(ee.Reducer.percentile([percentile]))
        return collection.map(image =>
            image.updateMask(
                image.select(bandName).gte(threshold)
            )
        )
    }

module.exports = applyPercentileFilter
