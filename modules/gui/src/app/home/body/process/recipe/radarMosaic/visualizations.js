import {POINT_IN_TIME, radarMosaicConfiguration, TIME_SCAN} from '#sepal/recipe/type/radarMosaic'
import {normalize} from '~/app/home/map/visParams/visParams'
import {msg} from '~/translate'

// The presets of each configuration: its band combinations and, for a point in time, its date metadata.
export const getPreSetVisualizations = recipe =>
    configurationVisualizations(radarMosaicConfiguration(recipe.model))

export const visualizationOptions = recipe =>
    configurationOptions(radarMosaicConfiguration(recipe.model))

// A point-in-time composite another recipe draws around a date of its own - BAYTS' first and last radar
// observations - and the templates CCDC takes for its radar measures.
export const pointInTimeVisualizations = () =>
    configurationVisualizations(POINT_IN_TIME)

export const pointInTimeOptions = () =>
    configurationOptions(POINT_IN_TIME)

const configurationVisualizations = configuration =>
    configuration === TIME_SCAN
        ? visualizations.TIME_SCAN
        : [...visualizations.POINT_IN_TIME, ...visualizations.METADATA]

const configurationOptions = configuration => {
    const visParamsToOption = visParams => ({
        value: visParams.bands.join(','),
        label: visParams.bands.join(', '),
        visParams
    })
    const bandCombinationOptions = {
        label: msg('process.mosaic.bands.combinations'),
        options: visualizations[configuration].map(visParamsToOption),
    }
    const metadataOptions = {
        label: msg('process.mosaic.bands.metadata'),
        options: visualizations.METADATA.map(visParamsToOption)
    }
    return configuration === TIME_SCAN
        ? [bandCombinationOptions]
        : [bandCombinationOptions, metadataOptions]
}

export const visualizations = {
    POINT_IN_TIME: [
        normalize({
            type: 'rgb',
            bands: ['VV', 'VH', 'ratio_VV_VH'],
            min: [-20, -25, 3],
            max: [0, -5, 14]
        })
    ],
    TIME_SCAN: [
        normalize({
            type: 'rgb',
            bands: ['VV_max', 'VH_min', 'NDCV'],
            min: [-17, -25, -1],
            max: [10, 2, 1]
        }),
        normalize({
            type: 'rgb',
            bands: ['VV_med', 'VH_med', 'VV_std'],
            min: [-20, -25, 0],
            max: [0, -5, 5]
        }),
        normalize({
            type: 'rgb',
            bands: ['VV_med', 'VH_med', 'ratio_VV_med_VH_med'],
            min: [-20, -25, 3],
            max: [0, -5, 14]
        }),
        normalize({
            type: 'rgb',
            bands: ['VV_max', 'VV_min', 'VV_std'],
            min: [-17, -25, 0],
            max: [10, 2, 5]
        }),
        normalize({
            type: 'rgb',
            bands: ['VV_min', 'VH_min', 'VV_std'],
            min: [-25, -34, 0],
            max: [0, -5, 5]
        }),
        normalize({
            type: 'hsv',
            bands: ['VV_phase', 'VV_amp', 'VV_res'],
            min: [-3.14, 0.5, 0.35],
            max: [3.14, 5, 5],
            inverted: [false, false, true]
        }),
        normalize({
            type: 'hsv',
            bands: ['VH_phase', 'VH_amp', 'VH_res'],
            min: [-3.14, 0.5, 0.35],
            max: [3.14, 5, 5],
            inverted: [false, false, true]
        }),
    ],
    METADATA: [
        normalize({
            type: 'continuous',
            bands: ['dayOfYear'],
            min: [0],
            max: [366],
            palette: ['00FFFF', '000099']
        }),
        normalize({
            type: 'continuous',
            bands: ['daysFromTarget'],
            min: [0],
            max: [183],
            palette: ['00FF00', 'FF0000']
        })
    ]
}
