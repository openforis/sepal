import ccdc from './recipe/ccdc/ccdc'
import ccdcSlice from './recipe/ccdcSlice/ccdcSlice'
import classification from './recipe/classification/classification'
import opticalMosaic from './recipe/opticalMosaic/opticalMosaic'
import planetMosaic from './recipe/planetMosaic/planetMosaic'
import radarMosaic from './recipe/radarMosaic/radarMosaic'
import timeSeries from './recipe/timeSeries/timeSeries'

export const listRecipeTypes = () => ([
    opticalMosaic(), radarMosaic(), planetMosaic(), classification(), timeSeries(), ccdc(), ccdcSlice()
])

export const getRecipeType = id => listRecipeTypes().find(recipeType => recipeType.id === id)
