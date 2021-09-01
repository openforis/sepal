const int10000 = {precision: 'int', min: -10000, max: 10000}

export const getAvailableBands = () => ({
    blue: {dataType: int10000},
    green: {dataType: int10000},
    red: {dataType: int10000},
    nir: {dataType: int10000},
    ndvi: {dataType: int10000},
})

export const getGroupedBandOptions = (recipe, select = ['dataSetBands', 'indexes', 'metadata']) => {
    const availableBands = getAvailableBands(recipe, select)
    const toOption = band => ({value: band, label: band, ...availableBands[band]})
    return bandGroups
        .map(bands => bands.filter(band => availableBands[band]))
        .filter(bands => bands.length)
        .map(bands => ({options: bands.map(toOption)}))
}

const bandGroups = [
    ['blue', 'green', 'red', 'nir'],
    ['ndvi']
]
