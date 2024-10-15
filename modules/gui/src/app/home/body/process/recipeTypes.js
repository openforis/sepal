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
import regression from './recipe/regression/regression'
import remapping from './recipe/remapping/remapping'
import stack from './recipe/stack/stack'
import timeSeries from './recipe/timeSeries/timeSeries'
import unsupervisedClassification from './recipe/unsupervisedClassification/unsupervisedClassification'
import {addRecipeType} from './recipeTypeRegistry'

export const registerRecipeTypes = () => {
    addRecipeType(opticalMosaic())
    addRecipeType(radarMosaic())
    addRecipeType(planetMosaic())
    addRecipeType(classification())
    addRecipeType(unsupervisedClassification())
    addRecipeType(regression())
    addRecipeType(stack())
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
