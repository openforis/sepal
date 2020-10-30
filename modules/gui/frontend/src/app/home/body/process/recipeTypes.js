import ccdc from './recipe/ccdc/ccdc'
import ccdcSlice from './recipe/ccdcSlice/ccdcSlice'
import classification from './recipe/classification/classification'
import opticalMosaic from './recipe/mosaic/mosaic'
import radarMosaic from './recipe/radarMosaic/radarMosaic'
import timeSeries from './recipe/timeSeries/timeSeries'

export const listRecipeTypes = () => ([
    opticalMosaic(), radarMosaic(), classification(), timeSeries(), ccdc(), ccdcSlice()
])

export const getRecipeType = id => listRecipeTypes().find(recipeType => recipeType.id === id)
