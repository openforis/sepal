import {followEEExport, shareIfPublic} from '../eeExport.js'

export const ccdcAssetExport = async (params, {sepal, report, signal, sleep}) => {
    const {eeTaskId, assetId} = await sepal.startExport('task/export/ccdc/asset', params)
    await followEEExport({eeTaskId, sepal, report, signal, sleep})
    await shareIfPublic({params, assetId, sepal, report, signal})
}
