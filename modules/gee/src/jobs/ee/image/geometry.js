import {switchMap} from 'rxjs'

import {job} from '#gee/jobs/job'
import ee from '#sepal/ee/ee'
import ImageFactory from '#sepal/ee/imageFactory'
import {fileName} from '#sepal/path'

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
    jobPath: fileName(import.meta.url),
    worker$
})
