import {visualizationOptions as assetOptions} from './recipe/asset/visualizations'
import {visualizationOptions as bandMathOptions} from './recipe/bandMath/visualizations'
import {visualizationOptions as baytsAlertsOptions} from './recipe/baytsAlerts/visualizations'
import {visualizationOptions as baytsHistoricalOptions} from './recipe/baytsHistorical/visualizations'
import {visualizationOptions as changeAlertsOptions} from './recipe/changeAlerts/visualizations'
import {visualizationOptions as opticalMosaicOptions} from './recipe/opticalMosaic/visualizations'
import {visualizationOptions as phenologyOptions} from './recipe/phenology/visualizations'
import {visualizationOptions as planetMosaicOptions} from './recipe/planetMosaic/visualizations'
import {visualizationOptions as radarMosaicOptions} from './recipe/radarMosaic/visualizations'
import {visualizationOptions as stackOptions} from './recipe/stack/visualizations'
import {addRecipeVisualizationOptions} from './recipeVisualizationsRegistry'

export const registerRecipeVisualizations = () => {
    addRecipeVisualizationOptions('MOSAIC', opticalMosaicOptions)
    addRecipeVisualizationOptions('RADAR_MOSAIC', radarMosaicOptions)
    addRecipeVisualizationOptions('PLANET_MOSAIC', planetMosaicOptions)
    addRecipeVisualizationOptions('PHENOLOGY', phenologyOptions)
    addRecipeVisualizationOptions('BAND_MATH', bandMathOptions)
    addRecipeVisualizationOptions('STACK', stackOptions)
    addRecipeVisualizationOptions('CHANGE_ALERTS', changeAlertsOptions)
    addRecipeVisualizationOptions('BAYTS_ALERTS', baytsAlertsOptions)
    addRecipeVisualizationOptions('BAYTS_HISTORICAL', baytsHistoricalOptions)
    addRecipeVisualizationOptions('ASSET_MOSAIC', assetOptions)
}
