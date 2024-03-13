import {addRecipeType} from './recipeTypeRegistry'
import asset from './recipe/asset/asset'
import baytsAlerts from './recipe/baytsAlerts/baytsAlerts'
import baytsHistorical from './recipe/baytsHistorical/baytsHistorical'
import ccdc from './recipe/ccdc/ccdc'
import ccdcSlice from './recipe/ccdcSlice/ccdcSlice'
import changeAlerts from './recipe/changeAlerts/changeAlerts'
import classChange from './recipe/classChange/classChange'
import classification from './recipe/classification/classification'
import indexChange from './recipe/indexChange/indexChange'
import masking from './recipe/masking/masking'
import opticalMosaic from './recipe/opticalMosaic/opticalMosaic'
import phenology from './recipe/phenology/phenology'
import planetMosaic from './recipe/planetMosaic/planetMosaic'
import radarMosaic from './recipe/radarMosaic/radarMosaic'
import remapping from './recipe/remapping/remapping'
import timeSeries from './recipe/timeSeries/timeSeries'

export const registerRecipeTypes = () => {
    addRecipeType(opticalMosaic())
    addRecipeType(radarMosaic())
    addRecipeType(planetMosaic())
    addRecipeType(classification())
    addRecipeType(timeSeries())
    addRecipeType(ccdc())
    addRecipeType(ccdcSlice())
    addRecipeType(classChange())
    addRecipeType(indexChange())
    addRecipeType(remapping())
    addRecipeType(changeAlerts())
    addRecipeType(baytsHistorical())
    addRecipeType(baytsAlerts())
    addRecipeType(phenology())
    addRecipeType(masking())
    addRecipeType(asset())
}
