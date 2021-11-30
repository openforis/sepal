const int10000 = {precision: 'int', min: -10000, max: 10000}

export const getAvailableBands = () => ({
    blue: {dataType: int10000},
    green: {dataType: int10000},
    red: {dataType: int10000},
    nir: {dataType: int10000},
    ndvi: {dataType: int10000},
    ndwi: {dataType: int10000},
    evi: {dataType: int10000},
    evi2: {dataType: int10000},
    savi: {dataType: int10000},
})

export const getGroupedBandOptions = (recipe, select = ['dataSetBands', 'indexes', 'metadata']) => {
    const availableBands = getAvailableBands(recipe, select)
    return bandGroups
        .map(bands => bands.filter(band => availableBands[band]))
        .filter(bands => bands.length)
        .map(bands => bands.map(band => ({value: band, label: band, ...availableBands[band]})))
}

const bandGroups = [
    ['blue', 'green', 'red', 'nir'],
    ['ndvi', 'ndwi', 'evi', 'evi2', 'savi']
]
