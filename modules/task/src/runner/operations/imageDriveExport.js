import {followEEExport} from '../eeExport.js'

// A user without a Google account has no Drive to export to; that export has always completed doing nothing.
export const imageDriveExport = async (params, {sepal, report, signal, sleep}) => {
    const {eeTaskId} = await sepal.startExport('task/export/image/drive', params)
    if (eeTaskId) {
        await followEEExport({eeTaskId, sepal, report, signal, sleep})
    }
}
