const typeFloat = {precision: 'float'}
const typeInt = {precision: 'int'}

export const getAvailableBands = (recipe, select = ['dataSetBands', 'indexes', 'metadata']) => {
    const type = (recipe.model.dates || {}).fromDate
        ? 'TIME_SCAN'
        : 'POINT_IN_TIME'
    const bandsByGroup = {
        dataSetBands: bands[type],
        metadata: type === 'POINT_IN_TIME'
            ? bands.METADATA
            : {}
    }
    const availableBands = {}
    select
        .map(bandType => bandsByGroup[bandType] || {})
        .forEach(groupBands => Object.keys(groupBands).forEach(band => availableBands[band] = groupBands[band]))
    return availableBands
}

export const getGroupedBandOptions = (recipe, select = ['dataSetBands', 'indexes', 'metadata']) => {
    const availableBands = getAvailableBands(recipe, select)
    return bandGroups
        .map(bands => bands.filter(band => availableBands[band]))
        .filter(bands => bands.length)
        .map(bands => bands.map(band => ({value: band, label: band, ...availableBands[band]})))
}

const bandGroups = [
    ['VV', 'VH', 'ratio_VV_VH'],
    ['VV_min', 'VV_mean', 'VV_med', 'VV_max', 'VV_std', 'VV_cv'],
    ['VH_min', 'VH_mean', 'VH_med', 'VH_max', 'VH_std', 'VH_cv'],
    ['VV_const', 'VV_t', 'VV_phase', 'VV_amp', 'VV_res'],
    ['VH_const', 'VH_t', 'VH_phase', 'VH_amp', 'VH_res'],
    ['orbit', 'orbit', 'dayOfYear', 'daysFromTarget']
]

const bands = {
    POINT_IN_TIME: {
        VV: {dataType: typeFloat},
        VH: {dataType: typeFloat},
        ratio_VV_VH: {dataType: typeFloat},
        orbit: {dataType: typeInt},
    },
    TIME_SCAN: {
        VV_min: {dataType: typeFloat},
        VV_mean: {dataType: typeFloat},
        VV_med: {dataType: typeFloat},
        VV_max: {dataType: typeFloat},
        VV_std: {dataType: typeFloat},
        VV_cv: {dataType: typeFloat},
        VV_fit: {dataType: typeFloat},
        VV_res: {dataType: typeFloat},
        VV_t: {dataType: typeFloat},
        VV_phase: {dataType: typeFloat},
        VV_amp: {dataType: typeFloat},
        VH_min: {dataType: typeFloat},
        VH_mean: {dataType: typeFloat},
        VH_med: {dataType: typeFloat},
        VH_max: {dataType: typeFloat},
        VH_std: {dataType: typeFloat},
        VH_fit: {dataType: typeFloat},
        VH_res: {dataType: typeFloat},
        VH_t: {dataType: typeFloat},
        VH_phase: {dataType: typeFloat},
        VH_amp: {dataType: typeFloat},
        VH_cv: {dataType: typeFloat},
        ratio_VV_med_VH_med: {dataType: typeFloat},
        NDCV: {dataType: typeFloat},
        orbit: {dataType: typeInt},
    },
    METADATA: {
        dayOfYear: {dataType: {precision: 'int', min: 0, max: 366}},
        daysFromTarget: {dataType: {precision: 'int', min: 0, max: 183}}
    }
}
