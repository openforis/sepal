import {getAvailableBands as opticalBands} from 'app/home/body/process/recipe/opticalMosaic/bands'
import {getAvailableBands as planetBands} from 'app/home/body/process/recipe/planetMosaic/bands'
import {getAvailableBands as radarBands} from 'app/home/body/process/recipe/radarMosaic/bands'

const typeFloat = {precision: 'float'}

export const getAvailableBands = (recipe, visualizationType) =>
    visualizationType === 'changes'
        ? changesBands()
        : mosaicBands(recipe)

const changesBands = () => {
    return {
        confidence: {dataType: typeFloat},
        difference: {dataType: typeFloat},
        detection_count: {dataType: typeFloat},
        monitoring_observation_count: {dataType: typeFloat},
        calibration_observation_count: {dataType: typeFloat},
        last_stable_date: {dataType: typeFloat},
        first_detection_date: {dataType: typeFloat},
        confirmation_date: {dataType: typeFloat},
        last_detection_date: {dataType: typeFloat}
    }
}
        
const mosaicBands = recipe => {
    const dataSetType = recipe.model.sources.dataSetType
    switch(dataSetType) {
    case 'OPTICAL': return opticalBands({
        model: {
            sources: recipe.model.sources.dataSets
        },
        compositeOptions: recipe.model.options
    })
    case 'RADAR': return radarBands(recipe)
    case 'PLANET': return planetBands()
    default: return {}
    }
}
