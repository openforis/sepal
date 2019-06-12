import classification from './classification/classification'
import opticalMosaic from './mosaic/mosaic'
import radarMosaic from './radarMosaic/radarMosaic'
import timeSeries from './timeSeries/timeSeries'

export const listRecipeTypes = () => ([
    opticalMosaic(), radarMosaic(), classification(), timeSeries()
])

export const getRecipeType = id => listRecipeTypes().find(recipeType => recipeType.id === id)
