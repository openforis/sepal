const typeFloat = {precision: 'float'}
const typeInt = {precision: 'int'}

export const getAvailableBands = (_recipe, select = ['BASE']) => {
    const availableBands = {}
    select
        .map(bandType => bandsByGroup[bandType] || {})
        .forEach(groupBands => Object.keys(groupBands).forEach(band => availableBands[band] = groupBands[band]))
    return availableBands
}

export const getGroupedBandOptions = (recipe, select = ['BASE']) => {
    const availableBands = getAvailableBands(recipe, select)
    return bandGroups
        .map(bands => bands.filter(band => availableBands[band]))
        .filter(bands => bands.length)
        .map(bands => bands.map(band => ({value: band, label: band, ...availableBands[band]})))
}

const bandGroups = [
    ['background', 'amplitude', 'median'],
    ['dayOfYear_1', 'days_1', 'median_1', 'slope_1', 'offset_1'],
    ['dayOfYear_2', 'days_2', 'median_2', 'slope_2', 'offset_2'],
    ['dayOfYear_3', 'days_3', 'median_3', 'slope_3', 'offset_3'],
    ['dayOfYear_4', 'days_4', 'median_4', 'slope_4', 'offset_4'],
]

const bandsByGroup = {
    BASE: {
        background: {dataType: typeInt},
        amplitude: {dataType: typeInt},
        median: {dataType: typeInt},
        dayOfYear_1: {dataType: typeInt},
        days_1: {dataType: typeInt},
        median_1: {dataType: typeInt},
        slope_1: {dataType: typeFloat},
        offset_1: {dataType: typeFloat},
        dayOfYear_2: {dataType: typeInt},
        days_2: {dataType: typeInt},
        median_2: {dataType: typeInt},
        slope_2: {dataType: typeInt},
        offset_2: {dataType: typeFloat},
        dayOfYear_3: {dataType: typeInt},
        days_3: {dataType: typeInt},
        median_3: {dataType: typeInt},
        slope_3: {dataType: typeInt},
        offset_3: {dataType: typeFloat},
        dayOfYear_4: {dataType: typeInt},
        days_4: {dataType: typeInt},
        median_4: {dataType: typeInt},
        slope_4: {dataType: typeInt},
        offset_4: {dataType: typeFloat},
    }
}
