import {followEEExport, shareIfPublic} from '../eeExport.js'

export const imageAssetExport = async (params, {sepal, report, signal, sleep}) => {
    const {eeTaskId, assetId} = await sepal.startExport('task/export/image/asset', params)
    await followEEExport({eeTaskId, sepal, report, signal, sleep})
    await shareIfPublic({params, assetId, sepal, report, signal})
}
