import {ccdcAssetExport} from './operations/ccdcAssetExport.js'
import {eeObjectExport} from './operations/eeObjectExport.js'
import {imageAssetExport} from './operations/imageAssetExport.js'
import {imageDriveExport} from './operations/imageDriveExport.js'
import {imageSepalExport} from './operations/imageSepalExport.js'
import {samplingDesignExport} from './operations/samplingDesignExport.js'
import {timeSeriesExport} from './operations/timeSeriesExport.js'

export const operations = {
    'ee.export': eeObjectExport,
    'image.GEE': imageAssetExport,
    'ccdc.GEE': ccdcAssetExport,
    'image.DRIVE': imageDriveExport,
    'image.SEPAL': imageSepalExport,
    'samplingDesign.GEE': samplingDesignExport('ASSET'),
    'samplingDesign.SEPAL': samplingDesignExport('SEPAL'),
    'timeseries.download': timeSeriesExport
}
