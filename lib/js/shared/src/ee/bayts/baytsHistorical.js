const {map, of, zip} = require('rxjs')
const {toGeometry} = require('#sepal/ee/aoi')
const ee = require('#sepal/ee')
const imageFactory = require('#sepal/ee/imageFactory')

const baytsHistorical = recipe => {
    const model = recipe.model
    const geometry = toGeometry(model.aoi)
    const baseBands = ['VV_mean', 'VV_std', 'VV_speckle', 'VH_mean', 'VH_std', 'VH_speckle', 'dominant_orbit']
    const orbits = model.options.orbits
    const orbitBandPostfixes = {
        ASCENDING: 'asc',
        DESCENDING: 'desc',
    }
    return {
        getImage$() {
            return zip(...orbits.map(orbitPass => {
                const singleOrbitRecipe = {
                    ...recipe,
                    type: 'RADAR_MOSAIC',
                    options: {
                        ...recipe.model.options,
                        orbits: [orbitPass]
                    }
                }
                return imageFactory(singleOrbitRecipe, {selection: ['VV_mean', 'VV_std', 'VH_mean', 'VH_std', 'dominant_orbit']}).getImage$().pipe(
                    map(image => {
                        const speckleStats = determineSpeckleStats(image, orbitPass, recipe.model.options)
                        return image
                            .addBands(speckleStats)
                            .regexpRename('(.*)', `$1_${orbitBandPostfixes[orbitPass]}`, false)
                    })
                )
            })
            ).pipe(
                map(images => ee.Image.cat(...images))
            )
        },
        getBands$() {
            return of(
                orbits.map(orbit => baseBands.map(band => `${band}_${orbitBandPostfixes[orbit]}`)).flat()
            )
        },
        getGeometry$() {
            return of(geometry)
        }
    }
}
  
const determineSpeckleStats = (image, orbitPass, {spatialSpeckleFilter, multitemporalSpeckleFilter}) => {
    const applyMultitemporalSpeckleFilter = multitemporalSpeckleFilter && multitemporalSpeckleFilter !== 'NONE'
        && spatialSpeckleFilter && spatialSpeckleFilter !== 'NONE'
    const stats = applyMultitemporalSpeckleFilter
        ? ee.ImageCollection(image.get('speckleStatsCollection'))
            .filter(ee.Filter.eq('orbitProperties_pass', orbitPass))
            .map(function (speckleStats) {
                return speckleStats
                    .updateMask(
                        image.select('dominant_orbit').eq(speckleStats.getNumber('relativeOrbitNumber_start'))
                    )
            })
            .mosaic()
            .regexpRename('(.*)', '$1_speckle', false)
        : ee.Image(['VV', 'VH'].map(function (bandName) {
            return ee.Image(1).rename(bandName).regexpRename('(.*)', '$1_speckle', false).clip(image.geometry())
        }))
    return stats.float()
}

module.exports = baytsHistorical
