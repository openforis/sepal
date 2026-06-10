import {map} from 'rxjs'

import {job} from '#gee/jobs/job'
import ee from '#sepal/ee/ee'
import {fileName} from '#sepal/path'

const worker$ = ({
    requestArgs: {sceneId}
}) => {

    return ee.getInfo$(
        ee.Image(sceneId).get('L1_LANDSAT_PRODUCT_ID')
    ).pipe(
        map(landsatProductId => ({landsatProductId}))
    )
}

export default job({
    jobName: 'Landsat Product ID',
    jobPath: fileName(import.meta.url),
    worker$
})
