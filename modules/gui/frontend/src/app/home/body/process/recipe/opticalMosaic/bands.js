import {getDataSetBands} from './sources'
import {getIndexes} from './indexes'
import {msg} from 'translate'
import {selectFrom} from 'stateUtils'

export const getAvailableBands = (recipe, select = ['dataSetBands', 'indexes', 'metadata']) => {
    const compose = selectFrom(recipe, 'model.compositeOptions.compose')
    const bandsByType = {
        dataSetBands: getDataSetBands(recipe),
        indexes: getIndexes(recipe),
        metadata: compose === 'MEDIAN'
            ? []
            : metadataBands
    }
    const bands = {}
    const allBands = getBands()
    select.map(bandType => bandsByType[bandType])
        .flat()
        .forEach(band => bands[band] = allBands[band])
    return bands
}

export const getGroupedBandOptions = (recipe, select = ['dataSetBands', 'indexes', 'metadata']) => {
    const availableBands = getAvailableBands(recipe, select)
    const toOption = band => ({value: band, label: band, ...availableBands[band]})
    return bandGroups
        .map(bands => bands.filter(band => availableBands[band]))
        .filter(bands => bands.length)
        .map(bands => ({options: bands.map(toOption)}))
}

const int10000 = {precision: 'int', min: -10000, max: 10000}
const intFullRange = {precision: 'int', min: -32768, max: 32767}

const getBands = () => ({
    blue: {
        dataType: intFullRange,
        tooltip: msg('bands.blue'),
    },
    green: {
        dataType: intFullRange,
        tooltip: msg('bands.green'),
    },
    red: {
        dataType: intFullRange,
        tooltip: msg('bands.red'),
    },
    nir: {
        dataType: intFullRange,
        tooltip: msg('bands.nir'),
    },
    swir1: {
        dataType: intFullRange,
        tooltip: msg('bands.swir1'),
    },
    thermal: {
        dataType: intFullRange,
        tooltip: msg('bands.thermal'),
    },
    swir2: {
        dataType: intFullRange,
        tooltip: msg('bands.swir2'),
    },
    qa: {
        dataType: intFullRange,
    },
    thermal2: {
        dataType: intFullRange,
        tooltip: msg('bands.thermal2'),
    },
    pan: {
        dataType: intFullRange,
        tooltip: msg('bands.pan'),
    },
    aerosol: {
        dataType: intFullRange,
        tooltip: msg('bands.aerosol'),
    },
    cirrus: {
        dataType: intFullRange,
        tooltip: msg('bands.cirrus'),
    },
    redEdge1: {
        dataType: intFullRange,
        tooltip: msg('bands.redEdge1'),
    },
    redEdge2: {
        dataType: intFullRange,
        tooltip: msg('bands.redEdge2'),
    },
    redEdge3: {
        dataType: intFullRange,
        tooltip: msg('bands.redEdge3'),
    },
    redEdge4: {
        dataType: intFullRange,
        tooltip: msg('bands.redEdge4'),
    },
    waterVapor: {
        dataType: intFullRange,
        tooltip: msg('bands.waterVapor'),
    },
    brightness: {
        dataType: intFullRange,
        tooltip: msg('bands.brightness'),
    },
    greenness: {
        dataType: intFullRange,
        tooltip: msg('bands.greenness'),
    },
    wetness: {
        dataType: intFullRange,
        tooltip: msg('bands.wetness'),
    },
    fourth: {
        dataType: intFullRange,
        tooltip: msg('bands.fourth'),
    },
    fifth: {
        dataType: intFullRange,
        tooltip: msg('bands.fifth'),
    },
    sixth: {
        dataType: intFullRange,
        tooltip: msg('bands.sixth'),
    },
    ndvi: {
        dataType: int10000,
        tooltip: '(nir - red) / (nir + red)'
    },
    ndmi: {
        dataType: int10000,
        tooltip: '(nir - swir1) / (nir + swir1)',
    },
    ndwi: {
        dataType: int10000,
        tooltip: '(green - nir) / (green + nir)',
    },
    mndwi: {
        dataType: int10000,
        tooltip: '(green - swir1) / (green + swir1)',
    },
    ndfi: {
        dataType: intFullRange,
        tooltip: 'Normalized Difference Fraction Index',
    },
    evi: {
        dataType: intFullRange,
        tooltip: '2.5 * (nir - red) / (nir + 6 * red - 7.5 * blue + 1)',
    },
    evi2: {
        dataType: intFullRange,
        tooltip: '2.5 * (nir - red) / (nir + 2.4 * red + 1)',
    },
    savi: {
        dataType: intFullRange,
        tooltip: '(1.5 * (nir - red) / (nir + red + 0.5)',
    },
    nbr: {
        dataType: int10000,
        tooltip: '(nir - swir2) / (nir + swir2)',
    },
    ui: {
        dataType: int10000,
        tooltip: '(swir2 - nir) / (swir2 + nir)',
    },
    ndbi: {
        dataType: int10000,
        tooltip: '(swir1 - nir) / (swir1 + nir)',
    },
    ibi: {
        dataType: intFullRange,
        tooltip: '(ndbi - (savi + mndwi) / 2) / (ndbi + (savi + mndwi) / 2)',
    },
    nbi: {
        dataType: intFullRange,
        tooltip: 'red * swir1 / nir',
    },
    ebbi: {
        dataType: intFullRange,
        tooltip: '(swir1 - nir) / (10 * sqrt(swir1 + thermal))',
    },
    bui: {
        dataType: intFullRange,
        tooltip: '(red - swir1) / (red + swir1) + (swir2 - swir1) / (swir2 + swir1)',
    },
    dayOfYear: {
        dataType: {precision: 'int', min: 0, max: 366},
        tooltip: msg('bands.dayOfYear'),
    },
    daysFromTarget: {
        dataType: {precision: 'int', min: 0, max: 183},
        tooltip: msg('bands.daysFromTarget'),
    },
})

const bandGroups = [
    ['blue', 'green', 'red', 'nir', 'swir1', 'swir2'],
    ['redEdge1', 'redEdge2', 'redEdge3', 'redEdge4'],
    ['aerosol', 'waterVapor', 'pan', 'cirrus', 'thermal', 'thermal2'],
    ['brightness', 'greenness', 'wetness'],
    ['fourth', 'fifth', 'sixth'],
    ['ndvi', 'ndmi', 'ndwi', 'mndwi', 'ndfi', 'evi', 'evi2', 'savi', 'nbr', 'ui', 'ndbi', 'ibi', 'nbi', 'ebbi', 'bui'],
    ['dayOfYear', 'daysFromTarget']
]

const metadataBands = ['dayOfYear', 'daysFromTarget']
