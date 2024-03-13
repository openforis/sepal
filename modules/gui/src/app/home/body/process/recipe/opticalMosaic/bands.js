import {getDataSetBands} from './sources'
import {getIndexes} from './indexes'
import {msg} from '~/translate'
import {selectFrom} from '~/stateUtils'

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
    return bandGroups
        .map(bands => bands.filter(band => availableBands[band]))
        .filter(bands => bands.length)
        .map(bands => bands.map(band => ({value: band, label: band, ...availableBands[band]})))
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
        tooltip: msg('bands.ndvi')
    },
    ndmi: {
        dataType: int10000,
        tooltip: msg('bands.ndmi'),
    },
    ndwi: {
        dataType: int10000,
        tooltip: msg('bands.ndwi'),
    },
    mndwi: {
        dataType: int10000,
        tooltip: msg('bands.mndwi'),
    },
    ndfi: {
        dataType: intFullRange,
        tooltip: msg('bands.ndfi'),
    },
    evi: {
        dataType: intFullRange,
        tooltip: msg('bands.evi'),
    },
    evi2: {
        dataType: intFullRange,
        tooltip: msg('bands.evi2'),
    },
    savi: {
        dataType: intFullRange,
        tooltip: msg('bands.savi'),
    },
    nbr: {
        dataType: int10000,
        tooltip: msg('bands.nbr'),
    },
    mvi: {
        dataType: intFullRange,
        tooltip: msg('bands.mvi'),
    },
    ui: {
        dataType: int10000,
        tooltip: msg('bands.ui'),
    },
    ndbi: {
        dataType: int10000,
        tooltip: msg('bands.ndbi'),
    },
    ibi: {
        dataType: intFullRange,
        tooltip: msg('bands.ibi'),
    },
    nbi: {
        dataType: intFullRange,
        tooltip: msg('bands.nbi'),
    },
    ebbi: {
        dataType: intFullRange,
        tooltip: msg('bands.ebbi'),
    },
    bui: {
        dataType: intFullRange,
        tooltip: msg('bands.bui'),
    },
    kndvi: {
        dataType: int10000,
        tooltip: msg('bands.kndvi'),
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
    ['brightness', 'greenness', 'wetness', 'fourth', 'fifth', 'sixth'],
    ['ndvi', 'ndmi', 'ndwi', 'mndwi', 'ndfi', 'evi', 'evi2', 'savi', 'nbr', 'mvi', 'ui', 'ndbi', 'ibi', 'nbi', 'ebbi', 'bui', 'kndvi'],
    ['dayOfYear', 'daysFromTarget']
]

const metadataBands = ['dayOfYear', 'daysFromTarget']
