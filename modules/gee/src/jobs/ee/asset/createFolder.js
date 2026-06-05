import {job} from '#gee/jobs/job'
import ee from '#sepal/ee/ee'
import _ from 'lodash'
import {fileURLToPath} from 'url'

const __filename = fileURLToPath(import.meta.url)

const worker$ = ({
    requestArgs: {id}
}) => {
    return ee.createFolder$(id)
}

export default job({
    jobName: 'EE create folder',
    jobPath: __filename,
    worker$
})
