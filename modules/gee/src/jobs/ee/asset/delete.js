import _ from 'lodash'
import {defer} from 'rxjs'

import {job} from '#gee/jobs/job'
import ee from '#sepal/ee/ee'
import {isServiceAccount} from '#sepal/ee/eeContext'
import {fileName} from '#sepal/path'

const worker$ = ({
    requestArgs: {id}
}) => defer(() => {
    if (isServiceAccount()) {
        throw new Error('Cannot delete an asset using service account.')
    }
    return ee.deleteAssetRecursive$(id)
})

export default job({
    jobName: 'EE delete asset',
    jobPath: fileName(import.meta.url),
    worker$
})
