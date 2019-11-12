const log = require('@sepal/log')
const job = require('@sepal/job')
const eeAuth = require('@sepal/ee/auth')

const worker$ = ({aoi, source}) => {
    const ee = require('@google/earthengine')
    const {toGeometry} = require('@sepal/ee/aoi')
    const {getInfo$} = require('@sepal/ee/utils')
    const {map, tap} = require('rxjs/operators')

    log.debug('Scene Areas:', {aoi, source})

    const geometry = toGeometry(aoi)
    const table = {
        LANDSAT: {
            id: 'users/wiell/SepalResources/landsatSceneAreas',
            idColumn: 'name',
            coordinates: sceneArea => sceneArea[0].coordinates[0]
        },
        SENTINEL_2: {
            id: 'users/wiell/SepalResources/sentinel2SceneAreas',
            idColumn: 'name',
            coordinates: sceneArea => sceneArea[0].geometries[1].coordinates[0]
        }
    }[source]
    return getInfo$(
        ee.FeatureCollection(table.id)
            .filterBounds(geometry)
            .reduceColumns(ee.Reducer.toList(2), ['.geo', table.idColumn])
            .get('list')
    ).pipe(
        map(sceneAreas =>
            sceneAreas.map(sceneArea => ({
                id: sceneArea[1],
                polygon: table.coordinates(sceneArea).map(lngLat => lngLat.reverse())
            }))
        )
    )
}


module.exports = job({
    jobName: 'Scene Areas',
    jobPath: __filename,
    before: [eeAuth],
    worker$
})
