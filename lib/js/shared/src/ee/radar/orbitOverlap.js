const ee = require('#sepal/ee')

function handleOrbitOverlap({orbitNumbers, orbits}) {
    return collection => {
        if (orbitNumbers === 'ALL') {
            return collection
        } else if (orbitNumbers === 'DOMINANT' || orbits.length === 1) {
            const dominantOrbit = collection
                .select('orbit')
                .reduce(ee.Reducer.mode())
            return collection
                .map(image => {
                    return image.updateMask(
                        image.select('orbit').eq(dominantOrbit)
                    )
                })
        } else {
            const ascendingDominantOrbit = collection
                .filter(ee.Filter(ee.Filter.eq('orbitProperties_pass', 'ASCENDING')))
                .select('orbit')
                .reduce(ee.Reducer.mode())
            const descendingDominantOrbit = collection
                .filter(ee.Filter(ee.Filter.eq('orbitProperties_pass', 'DESCENDING')))
                .select('orbit')
                .reduce(ee.Reducer.mode())
            return collection
                .map(image => {
                    return image.updateMask(
                        image.select('orbit').eq(ascendingDominantOrbit).unmask(0)
                            .or(image.select('orbit').eq(descendingDominantOrbit).unmask(0))
                    )
                })
        }
    }
}

module.exports = {handleOrbitOverlap}
