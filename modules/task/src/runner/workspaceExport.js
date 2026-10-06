import {getLogger} from '#sepal/log'

import {downloadFiles} from './download.js'
import {followEEExport} from './eeExport.js'

const log = getLogger('workspace')

export const exportToWorkspace = async ({start, downloadDir, sepal, report, signal, sleep, fetchFn}) => {
    const {eeTaskId, destination} = await start()
    try {
        await followEEExport({eeTaskId, sepal, report, signal, sleep})
        if (signal.aborted) {
            return {downloaded: false}
        }
        await downloadFiles({destination, dir: downloadDir, sepal, report, signal, sleep, fetchFn})
        return {downloaded: !signal.aborted}
    } finally {
        await cleanup(destination, sepal)
    }
}

// Best-effort: a Drive folder left behind is the user's to remove, and bucket objects expire within a day.
const cleanup = async (destination, sepal) => {
    try {
        await sepal.gee('task/download/cleanup', {destination})
    } catch (error) {
        log.warn('Export files could not be removed', error)
    }
}
