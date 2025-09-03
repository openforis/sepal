const ee = require('#sepal/ee/ee')

const maaskPreventingHoles = snowMasking =>
    collection => {
        const maskBands = snowMasking === 'OFF'
            ? ['cloud', 'snow']
            : ['cloud']
        const hole = collection
            .select(maskBands)
            .reduce(ee.Reducer.min()) // Reduce collection
            .reduce(ee.Reducer.min()) // Reduce image bands
        return collection.map(
            image => image.updateMask(
                hole.or(
                    image.select(maskBands).not().reduce(ee.Reducer.min())
                )
            )
        )
    }

module.exports = maaskPreventingHoles
