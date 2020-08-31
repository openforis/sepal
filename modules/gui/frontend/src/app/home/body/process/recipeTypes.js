import classification from './classification/classification'
import ccdc from './ccdc/ccdc'
import opticalMosaic from './mosaic/mosaic'
import radarMosaic from './radarMosaic/radarMosaic'
import timeSeries from './timeSeries/timeSeries'

export const listRecipeTypes = () => ([
    opticalMosaic(), radarMosaic(), classification(), timeSeries(), ccdc()
])

export const getRecipeType = id => listRecipeTypes().find(recipeType => recipeType.id === id)
