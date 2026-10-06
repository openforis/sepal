import {followEEExport, shareIfPublic} from '../eeExport.js'
import {collectionExport} from './collectionExport.js'

export const ccdcAssetExport = async (params, {sepal, report, signal, sleep}) => {
    if (params.image?.assetType === 'ImageCollection') {
        return collectionExport('ccdc', params, {sepal, report, signal, sleep})
    }
    const {eeTaskId, assetId} = await sepal.startExport('task/export/ccdc/asset', params)
    await followEEExport({eeTaskId, sepal, report, signal, sleep})
    await shareIfPublic({params, assetId, sepal, report, signal})
}
