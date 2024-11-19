const ee = require('#sepal/ee')
const {compose} = require('../functional')

const prepareSentinel2Collection = ({collection, filter, tileOverlap, includedCloudMasking, sentinel2CloudScorePlusBand}) => {
    
    const includeCloudProbability = collection => {
        if (includedCloudMasking.includes('sentinel2CloudProbability')) {
            const clouds = ee.ImageCollection('COPERNICUS/S2_CLOUD_PROBABILITY')
                .filter(filter)
            return collection.linkCollection(clouds, ['probability'])
        } else {
            return collection
        }
    }
    
    const includeCloudScore = collection => {
        if (includedCloudMasking.includes('sentinel2CloudScorePlus')) {
            const csPlus = ee.ImageCollection('GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED')
                .filter(filter)
            return collection.linkCollection(csPlus, [sentinel2CloudScorePlusBand])
        } else {
            return collection
        }
    }

    const clipCollection = collection => {
        if (['QUICK_REMOVE', 'REMOVE'].includes(tileOverlap)) {
            const tiles = ee.FeatureCollection('users/wiell/SepalResources/sentinel2TilesNoOverlapBuffered')
            return ee.ImageCollection(
                ee.Join.saveFirst('tile').apply({
                    primary: collection,
                    secondary: tiles,
                    condition:
                            ee.Filter.equals({leftField: 'MGRS_TILE', rightField: 'name'})
                })
            ).map(image => {
                const tile = ee.Feature(image.get('tile'))
                return image.clip(tile.geometry())
            })
        } else {
            return collection
        }
    }
    
    return compose(
        collection,
        includeCloudProbability,
        includeCloudScore,
        clipCollection,
    )
}
module.exports = {prepareSentinel2Collection}
