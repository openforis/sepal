import classification from './classification/classification'
import ccdc from './ccdc/ccdc'
import ccdcSlice from './ccdcSlice/ccdcSlice'
import opticalMosaic from './mosaic/mosaic'
import radarMosaic from './radarMosaic/radarMosaic'
import timeSeries from './timeSeries/timeSeries'

export const listRecipeTypes = () => ([
    opticalMosaic(), radarMosaic(), classification(), timeSeries(), ccdc(), ccdcSlice()
])

export const getRecipeType = id => listRecipeTypes().find(recipeType => recipeType.id === id)
