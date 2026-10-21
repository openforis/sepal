import {map, switchMap} from 'rxjs'

import {job} from '#gee/jobs/job'
import {toGeometry$} from '#sepal/ee/aoi'
import {confirmedAlerts, diCollection$} from '#sepal/ee/dias/dias'
import ee from '#sepal/ee/ee'
import {fileName} from '#sepal/path'

// The DI observations of one pixel, with the alert DIAS confirms there. The collection is built over the recipe's
// AOI rather than the pixel, because each DI is standardized against the forest population of its whole scene.
const worker$ = ({
    requestArgs: {recipe, latLng}
}) =>
    toGeometry$({type: 'POINT', ...latLng}).pipe(
        switchMap(point => diCollection$(recipe).pipe(
            switchMap(({forestMask, collection}) => {
                const pixelCollection = collection.filterBounds(point)
                const atPixel = image => image.reduceRegion({
                    reducer: ee.Reducer.first(),
                    geometry: point,
                    scale: 10,
                    tileScale: 16
                })
                return ee.getInfo$(
                    ee.Dictionary({
                        observations: atPixel(pixelCollection.select(['DI', 'source', 'ydoy']).toArray()).get('array'),
                        alert: atPixel(
                            confirmedAlerts(recipe, pixelCollection)
                                .addBands(forestMask.select(0).rename('forest_mask'))
                        )
                    }),
                    `Load DIAS observations for pixel (${latLng.lat}, ${latLng.lng})`
                )
            })
        )),
        map(({observations, alert}) => ({
            observations: (observations || []).map(([di, source, ydoy]) => ({di, source, ydoy})),
            alert
        }))
    )

export default job({
    jobName: 'Load DIAS observations',
    jobPath: fileName(import.meta.url),
    worker$
})
