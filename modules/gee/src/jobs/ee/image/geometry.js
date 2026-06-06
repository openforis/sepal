import {switchMap} from 'rxjs'
import {fileURLToPath} from 'url'

import {job} from '#gee/jobs/job'
import ee from '#sepal/ee/ee'
import ImageFactory from '#sepal/ee/imageFactory'

const __filename = fileURLToPath(import.meta.url)

const worker$ = ({
    requestArgs: {recipe, color = '#FFFFFF50', fillColor = '#FFFFFF08'}
}) => {

    const {getGeometry$} = ImageFactory(recipe)
    return getGeometry$().pipe(
        switchMap(geometry => {
            const table = ee.FeatureCollection([ee.Feature(geometry)])
            return ee.getMap$(table.style({color, fillColor}), null, 'create geometry map')
        })
    )
}

export default job({
    jobName: 'Geometry',
    jobPath: __filename,
    worker$
})
