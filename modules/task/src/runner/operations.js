import {ccdcAssetExport} from './operations/ccdcAssetExport.js'
import {imageAssetExport} from './operations/imageAssetExport.js'
import {imageDriveExport} from './operations/imageDriveExport.js'

export const operations = {
    'image.GEE': imageAssetExport,
    'ccdc.GEE': ccdcAssetExport,
    'image.DRIVE': imageDriveExport
}
