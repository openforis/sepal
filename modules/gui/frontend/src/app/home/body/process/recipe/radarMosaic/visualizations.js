import {normalize} from 'app/home/map/visParams/visParams'

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
            max: [366]
        }),
        normalize({
            type: 'continuous',
            bands: ['daysFromTarget'],
            min: [0],
            max: [183]
        })
    ]
}
