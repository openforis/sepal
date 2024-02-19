import {getAvailableBands as radarBands} from 'app/home/body/process/recipe/radarMosaic/bands'

const typeFloat = {precision: 'float'}
const typeInt = {precision: 'int'}

export const getAvailableBands = (recipe, visualizationType) => {
    return !visualizationType || visualizationType === 'alerts'
        ? alertsBands()
        : radarBands(recipe)
}

export const alertsBands = () => {
    return {
        non_forest_probability: {dataType: typeFloat},
        change_probability: {dataType: typeFloat},
        flag: {dataType: typeInt},
        flag_orbit: {dataType: typeInt},
        first_detection_date: {dataType: typeFloat},
        confirmation_date: {dataType: typeFloat},
        VV: {dataType: typeFloat},
        VH: {dataType: typeFloat},
        ratio_VV_VH: {dataType: typeFloat},
    }
}
        
export const getGroupedBandOptions = () => {
    const toOption = band => ({value: band, label: band})
    return [
        ['non_forest_probability', 'change_probability', 'flag', 'flag_orbit'].map(toOption),
        ['first_detection_date', 'confirmation_date'].map(toOption)
    ]
}
