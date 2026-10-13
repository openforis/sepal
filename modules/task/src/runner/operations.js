import {ccdcAssetExport} from './operations/ccdcAssetExport.js'
import {imageAssetExport} from './operations/imageAssetExport.js'
import {imageDataExport} from './operations/imageDataExport.js'
import {imageDriveExport} from './operations/imageDriveExport.js'
import {imageSepalExport} from './operations/imageSepalExport.js'
import {samplingDesignExport} from './operations/samplingDesignExport.js'
import {timeSeriesExport} from './operations/timeSeriesExport.js'

export const operations = {
    'image.GEE': imageAssetExport,
    'ccdc.GEE': ccdcAssetExport,
    'image.DRIVE': imageDriveExport,
    'image.DATA': imageDataExport,
    'image.SEPAL': imageSepalExport,
    'samplingDesign.GEE': samplingDesignExport('ASSET'),
    'samplingDesign.SEPAL': samplingDesignExport('SEPAL'),
    'timeseries.download': timeSeriesExport
}
