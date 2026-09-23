import ee from '#sepal/ee/ee'

// The bands a time scan returns. It is the list the composite selects by, so a consumer declaring these is
// declaring what this function was asked to produce rather than a copy of it.
export const TIME_SCAN_BANDS = [
    'VV_min', 'VV_max', 'VV_mean', 'VV_std', 'VV_med',
    'VH_min', 'VH_max', 'VH_mean', 'VH_std', 'VH_med',
    'ratio_VV_med_VH_med', 'VV_cv', 'VH_cv', 'NDCV', 'orbit'
]

const toDateComposite = collection => {
    const mosaic = collection.qualityMosaic('quality')
    const ratio = mosaic.select('VV').subtract(mosaic.select('VH')).rename('ratio_VV_VH')
    return mosaic.addBands(ratio)
}

const toTimeScan = collection => {
    let reduced = collection
        .select(['VV.*', 'VH.*', 'orbit'])
        .map(function (image) {
            return image.addBands(
                ee.Image(10).pow(image.select(['VV', 'VH']).divide(10)).rename(['VV_nat', 'VH_nat'])
            )
        })
        .reduce(
            ee.Reducer.minMax()
                .combine(ee.Reducer.mean(), '', true)
                .combine(ee.Reducer.stdDev(), '', true)
                .combine(ee.Reducer.median(), '', true)
                .combine(ee.Reducer.mode(), '', true)
        )
        .select(
            ['VV_min', 'VV_max', 'VV_mean', 'VV_stdDev', 'VV_median', 'VV_nat_mean', 'VH_min', 'VH_max', 'VH_mean', 'VH_stdDev', 'VH_median', 'VH_nat_mean', 'orbit_mode'],
            ['VV_min', 'VV_max', 'VV_mean', 'VV_std', 'VV_med', 'VV_nat_mean', 'VH_min', 'VH_max', 'VH_mean', 'VH_std', 'VH_med', 'VH_nat_mean', 'orbit']
        )

    reduced = reduced
        .addBands(
            reduced.select('VV_med').subtract(reduced.select('VH_med')).rename('ratio_VV_med_VH_med')
        )
        .addBands(
            reduced.select('VV_std').divide(reduced.select('VV_nat_mean')).log10().multiply(10).rename('VV_cv')
        )
        .addBands(
            reduced.select('VH_std').divide(reduced.select('VH_nat_mean')).log10().multiply(10).rename('VH_cv')
        )

    return reduced
        .addBands(
            ee.Image().expression('(i.VV_cv - i.VH_cv) / (i.VV_cv + i.VH_cv)', {i: reduced}).rename('NDCV')
        )
        .select(TIME_SCAN_BANDS)
        .float()
}

export {toDateComposite, toTimeScan}
