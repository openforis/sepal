const ee = require('#sepal/ee')

const toDateComposite = collection => {
    const mosaic = collection.qualityMosaic('quality')
    const ratio = mosaic.select('VV').subtract(mosaic.select('VH')).rename('ratio_VV_VH')
    return mosaic.addBands(ratio)
}

const toTimeScan = collection => {
    let reduced = collection
        .select(['VV', 'VH'])
        .map(function (image) {
            return image.addBands(
                ee.Image(10).pow(image.divide(10)).rename(['VV_nat', 'VH_nat'])
            )
        })
        .reduce(
            ee.Reducer.minMax()
                .combine(ee.Reducer.mean(), '', true)
                .combine(ee.Reducer.stdDev(), '', true)
                .combine(ee.Reducer.median(), '', true)
        )

    reduced = reduced
        .addBands(
            reduced.select('VV_median').subtract(reduced.select('VH_median')).rename('ratio_VV_med_VH_med')
        )
        .addBands(
            reduced.select('VV_stdDev').divide(reduced.select('VV_nat_mean')).log10().multiply(10).rename('VV_cv')
        )
        .addBands(
            reduced.select('VH_stdDev').divide(reduced.select('VH_nat_mean')).log10().multiply(10).rename('VH_cv')
        )

    return reduced
        .addBands(
            ee.Image().expression('(i.VV_cv - i.VH_cv) / (i.VV_cv + i.VH_cv)', {i: reduced}).rename('NDCV')
        )
        .select([
            'VV_min', 'VV_max', 'VV_mean', 'VV_stdDev', 'VV_median', 'VH_min', 'VH_max', 'VH_mean', 'VH_stdDev', 'VH_median', 'ratio_VV_med_VH_med', 'VV_cv', 'VH_cv', 'NDCV'
        ],
        [
            'VV_min', 'VV_max', 'VV_mean', 'VV_std', 'VV_med', 'VH_min', 'VH_max', 'VH_mean', 'VH_std', 'VH_med', 'ratio_VV_med_VH_med', 'VV_cv', 'VH_cv', 'NDCV'
        ])
        .float()
}

module.exports = {toDateComposite, toTimeScan}
