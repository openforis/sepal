import {map} from 'rxjs'
import {fileURLToPath} from 'url'

import {job} from '#gee/jobs/job'
import {toGeometry} from '#sepal/ee/aoi'
import ee from '#sepal/ee/ee'

const __filename = fileURLToPath(import.meta.url)

const worker$ = ({
    requestArgs: {aoi, source}
}) => {

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

export default job({
    jobName: 'Scene Areas',
    jobPath: __filename,
    worker$
})
