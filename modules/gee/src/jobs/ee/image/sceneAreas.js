import {map, switchMap} from 'rxjs'

import {job} from '#gee/jobs/job'
import {toGeometry$} from '#sepal/ee/aoi'
import ee from '#sepal/ee/ee'
import {fileName} from '#sepal/path'

const worker$ = ({
    requestArgs: {aoi, source}
}) => {

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
    return toGeometry$(aoi).pipe(
        switchMap(geometry =>
            ee.getInfo$(
                ee.FeatureCollection(table.id)
                    .filterBounds(geometry)
                    .reduceColumns(ee.Reducer.toList(2), ['.geo', table.idColumn])
                    .get('list'),
                'scene areas'
            )
        ),
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
    jobPath: fileName(import.meta.url),
    worker$
})
