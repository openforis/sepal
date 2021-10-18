import ccdc from './recipe/ccdc/ccdc'
import ccdcSlice from './recipe/ccdcSlice/ccdcSlice'
import classChange from './recipe/classChange/classChange'
import classification from './recipe/classification/classification'
import indexChange from './recipe/indexChange/indexChange'
import opticalMosaic from './recipe/opticalMosaic/opticalMosaic'
import planetMosaic from './recipe/planetMosaic/planetMosaic'
import radarMosaic from './recipe/radarMosaic/radarMosaic'
import timeSeries from './recipe/timeSeries/timeSeries'

export const listRecipeTypes = () => ([
    opticalMosaic(), radarMosaic(), planetMosaic(), classification(), timeSeries(), ccdc(), ccdcSlice(), classChange(), indexChange()
])

export const getRecipeType = id => listRecipeTypes().find(recipeType => recipeType.id === id)
