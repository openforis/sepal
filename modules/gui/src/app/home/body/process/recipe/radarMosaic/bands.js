import {IMAGE_OUTPUT} from '#sepal/recipe/output/product'
import {
    POINT_IN_TIME,
    radarMosaicBands,
    radarMosaicConfiguration,
    TIME_SCAN
} from '#sepal/recipe/type/radarMosaic'

const typeFloat = {precision: 'float'}
const typeInt = {precision: 'int'}

const BAND_TYPES = {
    orbit: typeInt,
    dayOfYear: {precision: 'int', min: 0, max: 366},
    daysFromTarget: {precision: 'int', min: 0, max: 183}
}

// How a radar band is shown; which bands exist is the declaration's to say.
export const radarBandPresentation = name =>
    ({dataType: BAND_TYPES[name] || typeFloat})

// A table of the given declared bands, presented, for a product that shows a radar mosaic and is not yet declared.
export const radarBandTable = bands =>
    Object.fromEntries(bands.map(({name}) => [name, radarBandPresentation(name)]))

export const bandPresentation = (recipe, {name} = {}) =>
    name === IMAGE_OUTPUT ? radarBandTable(radarMosaicBands(recipe.model)) : {}

// The groups Retrieve offers each configuration's bands in.
const BAND_GROUPS = {
    [POINT_IN_TIME]: [
        ['VV', 'VH', 'ratio_VV_VH'],
        ['orbit', 'dayOfYear', 'daysFromTarget']
    ],
    [TIME_SCAN]: [
        ['VV_min', 'VV_mean', 'VV_med', 'VV_max', 'VV_std', 'VV_cv'],
        ['VH_min', 'VH_mean', 'VH_med', 'VH_max', 'VH_std', 'VH_cv'],
        ['ratio_VV_med_VH_med', 'NDCV'],
        ['VV_const', 'VV_t', 'VV_phase', 'VV_amp', 'VV_res'],
        ['VH_const', 'VH_t', 'VH_phase', 'VH_amp', 'VH_res'],
        ['orbit']
    ]
}

export const groupedBandPresentation = recipe =>
    BAND_GROUPS[radarMosaicConfiguration(recipe.model)]
        .map(group => group.map(band => ({value: band, label: band, ...radarBandPresentation(band)})))
