import {isOpticalDataSet} from '~/app/home/body/process/recipe/opticalMosaic/sources'
import {isRadarDataSet} from '~/app/home/body/process/recipe/radarMosaic/sources'

// What pre-processing the chosen data sets take: orbits for radar, cloud masking for Landsat and Sentinel-2. Planet is
// cloud masked by its own fixed settings (lib/js/ee/src/dias/diCollection.js).
export const preprocessing = dataSetIds => ({
    orbits: dataSetIds.some(isRadarDataSet),
    cloudMasking: dataSetIds.some(isOpticalDataSet)
})
