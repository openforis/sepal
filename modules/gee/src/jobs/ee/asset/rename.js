import {job} from '#gee/jobs/job'
import ee from '#sepal/ee/ee'
import _ from 'lodash'
import {fileURLToPath} from 'url'

const __filename = fileURLToPath(import.meta.url)

const worker$ = ({
    requestArgs: {sourceId, destinationId}
}) => {
    return ee.renameAsset$(sourceId, destinationId)
}

export default job({
    jobName: 'EE rename asset',
    jobPath: __filename,
    worker$
})
