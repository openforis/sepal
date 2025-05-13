const {job} = require('#gee/jobs/job')

const worker$ = ({aoi, source}) => {
    const ee = require('#sepal/ee/ee')
    const {toGeometry} = require('#sepal/ee/aoi')
    const {map} = require('rxjs')

    const geometry = toGeometry(aoi)
    const table = {
        LANDSAT: {
            id: 'users/wiell/SepalResources/landsatSceneAreas',
            idColumn: 'name'
        },
        SENTINEL_2: {
            id: 'users/wiell/SepalResources/sentinel2SceneAreas',
            idColumn: 'name'
        }
    }[source]
    return ee.getInfo$(
        ee.FeatureCollection(table.id)
            .filterBounds(geometry)
            .reduceColumns(ee.Reducer.toList(2), ['.geo', table.idColumn])
            .get('list'),
        'scene areas'
    ).pipe(
        map(sceneAreas =>
            sceneAreas.map(sceneArea => ({
                id: sceneArea[1],
                polygon: sceneArea[0].coordinates[0].map(lngLat => lngLat.reverse())
            }))
        )
    )
}

module.exports = job({
    jobName: 'Scene Areas',
    jobPath: __filename,
    worker$
})
