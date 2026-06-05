import {job} from '#gee/jobs/job'
import ee from '#sepal/ee/ee'
import {getRows$} from '#sepal/ee/table'
import {fileURLToPath} from 'url'

const __filename = fileURLToPath(import.meta.url)

const worker$ = ({
    requestArgs: {tableId}
}) => {
    return getRows$(ee.FeatureCollection(tableId), 'load table rows')
}

export default job({
    jobName: 'Get EE Table rows',
    jobPath: __filename,
    worker$
})
