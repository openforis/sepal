import {map} from 'rxjs'
import {fileURLToPath} from 'url'

import {job} from '#gee/jobs/job'
import ee from '#sepal/ee/ee'

const __filename = fileURLToPath(import.meta.url)

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
    jobPath: __filename,
    worker$
})
