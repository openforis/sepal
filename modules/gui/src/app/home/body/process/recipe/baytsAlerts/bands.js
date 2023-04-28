import {getAvailableBands as radarBands} from 'app/home/body/process/recipe/radarMosaic/bands'

const typeFloat = {precision: 'float'}
const typeInt = {precision: 'int'}

// TODO: Implement...

export const getAvailableBands = (recipe, visualizationType) => {
    return !visualizationType || visualizationType === 'alerts'
        ? alertsBands()
        : radarBands(recipe)
}

export const alertsBands = () => {
    return {
        PNF: {dataType: typeFloat},
        pChange: {dataType: typeFloat},
        flag: {dataType: typeInt},
        flag_orbit: {dataType: typeInt},
        first_detection_date: {dataType: typeFloat},
        confirmation_date: {dataType: typeFloat},
    }
}
        
export const getGroupedBandOptions = () => {
    const toOption = band => ({value: band, label: band})
    return [
        ['PNF', 'pChange', 'flag', 'flag_orbit'].map(toOption),
        ['first_detection_date', 'confirmation_date'].map(toOption)
    ]
}
