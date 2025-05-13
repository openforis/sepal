const ee = require('#sepal/ee/ee')

const applyPercentileFilter = (bandName, percentile) =>
    collection => {
        if (percentile > 0) {
            const threshold = collection.select(bandName)
                .reduce(ee.Reducer.percentile([percentile]))
            return collection.map(image =>
                image.updateMask(
                    image.select(bandName).gte(threshold)
                )
            )
        } else {
            return collection
        }
    }

module.exports = applyPercentileFilter
