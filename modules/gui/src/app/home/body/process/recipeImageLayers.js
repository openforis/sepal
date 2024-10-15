import {AssetImageLayer} from './recipe/asset/assetImageLayer'
import {BaytsAlertsImageLayer} from './recipe/baytsAlerts/baytsAlertsImageLayer'
import {BaytsHistoricalImageLayer} from './recipe/baytsHistorical/baytsHistoricalImageLayer'
import {CCDCImageLayer} from './recipe/ccdc/ccdcImageLayer'
import {CCDCSliceImageLayer} from './recipe/ccdcSlice/ccdcSliceImageLayer'
import {ChangeAlertsImageLayer} from './recipe/changeAlerts/changeAlertsImageLayer'
import {ClassChangeImageLayer} from './recipe/classChange/classChangeImageLayer'
import {ClassificationImageLayer} from './recipe/classification/classificationImageLayer'
import {IndexChangeImageLayer} from './recipe/indexChange/indexChangeImageLayer'
import {MaskingImageLayer} from './recipe/masking/maskingImageLayer'
import {OpticalMosaicImageLayer} from './recipe/opticalMosaic/opticalMosaicImageLayer'
import {PhenologyImageLayer} from './recipe/phenology/phenologyImageLayer'
import {PlanetMosaicImageLayer} from './recipe/planetMosaic/planetMosaicImageLayer'
import {RadarMosaicImageLayer} from './recipe/radarMosaic/radarMosaicImageLayer'
import {RegressionImageLayer} from './recipe/regression/regressionImageLayer'
import {RemappingImageLayer} from './recipe/remapping/remappingImageLayer'
import {StackImageLayer} from './recipe/stack/stackImageLayer'
import {TimeSeriesImageLayer} from './recipe/timeSeries/timeSeriesImageLayer'
import {UnsupervisedClassificationImageLayer} from './recipe/unsupervisedClassification/unsupervisedClassificationImageLayer'
import {addRecipeImageLayer} from './recipeImageLayerRegistry'

export const registerRecipeImageLayers = () => {
    addRecipeImageLayer('MOSAIC', OpticalMosaicImageLayer)
    addRecipeImageLayer('RADAR_MOSAIC', RadarMosaicImageLayer)
    addRecipeImageLayer('PLANET_MOSAIC', PlanetMosaicImageLayer)
    addRecipeImageLayer('CLASSIFICATION', ClassificationImageLayer)
    addRecipeImageLayer('UNSUPERVISED_CLASSIFICATION', UnsupervisedClassificationImageLayer)
    addRecipeImageLayer('REGRESSION', RegressionImageLayer)
    addRecipeImageLayer('STACK', StackImageLayer)
    addRecipeImageLayer('CLASS_CHANGE', ClassChangeImageLayer)
    addRecipeImageLayer('INDEX_CHANGE', IndexChangeImageLayer)
    addRecipeImageLayer('REMAPPING', RemappingImageLayer)
    addRecipeImageLayer('CHANGE_ALERTS', ChangeAlertsImageLayer)
    addRecipeImageLayer('CCDC', CCDCImageLayer)
    addRecipeImageLayer('CCDC_SLICE', CCDCSliceImageLayer)
    addRecipeImageLayer('TIME_SERIES', TimeSeriesImageLayer)
    addRecipeImageLayer('PHENOLOGY', PhenologyImageLayer)
    addRecipeImageLayer('MASKING', MaskingImageLayer)
    addRecipeImageLayer('BAYTS_HISTORICAL', BaytsHistoricalImageLayer)
    addRecipeImageLayer('BAYTS_ALERTS', BaytsAlertsImageLayer)
    addRecipeImageLayer('ASSET_MOSAIC', AssetImageLayer)
}
