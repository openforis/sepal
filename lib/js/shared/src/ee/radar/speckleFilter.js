const ee = require('#sepal/ee')
const {applySpatialSpeckleFilter} = require('./spatialSpeckleFilters')

function applySpeckleFilter({
    spatialSpeckleFilterOptions,
    multitemporalSpeckleFilter,
    speckleStatsCollection,
    bandNames
}) {
    return image => {
        return image
            .addBands(filter(image.select(bandNames)), null, true)

        function filter(image) {
            if (!speckleStatsCollection) {
                return applySpatialSpeckleFilter({image, bandNames, ...spatialSpeckleFilterOptions})
            }
            var speckleStats = speckleStatsCollection
                .filter(ee.Filter.eq('orbitProperties_pass', image.get('orbitProperties_pass')))
                .filter(ee.Filter.eq('relativeOrbitNumber_start', image.get('relativeOrbitNumber_start')))
                .first()
                .select(bandNames)
            switch (multitemporalSpeckleFilter) {
            case 'QUEGAN':
                return applyQuegan(image, speckleStats)
            case 'RABASAR':
                return applyRabasar(image, speckleStats)
            default:
                throw Error('Unsupported multitemporalSpeckleFilter: ', multitemporalSpeckleFilter)
            }
        }
    }

    function applyQuegan(image, speckleRatio) {
        return applySpatialSpeckleFilter({image, bandNames, ...spatialSpeckleFilterOptions})
            .multiply(speckleRatio.rename(bandNames))
            
    }
    
    function applyRabasar(image, superImage) {
        var speckleRatio = image.select(bandNames).divide(superImage)
        var filteredSpeckleRatio = applySpatialSpeckleFilter({image: speckleRatio, bandNames, ...spatialSpeckleFilterOptions, retainStrongScatterers: false})
        return superImage.multiply(filteredSpeckleRatio)
    }
    
}

module.exports = {applySpeckleFilter}
