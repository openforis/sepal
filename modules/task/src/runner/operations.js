import {ccdcAssetExport} from './operations/ccdcAssetExport.js'
import {imageAssetExport} from './operations/imageAssetExport.js'
import {imageDriveExport} from './operations/imageDriveExport.js'
import {imageSepalExport} from './operations/imageSepalExport.js'

export const operations = {
    'image.GEE': imageAssetExport,
    'ccdc.GEE': ccdcAssetExport,
    'image.DRIVE': imageDriveExport,
    'image.SEPAL': imageSepalExport
}
