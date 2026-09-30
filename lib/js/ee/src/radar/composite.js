import ee from '#sepal/ee/ee'
import {TIME_SCAN_STATISTICS} from '#sepal/recipe/type/radarMosaic'

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
        // Selecting by the declared statistics keeps the declaration and the image the same thing: a name nothing above
        // produces fails here rather than reaching a consumer.
        .select(TIME_SCAN_STATISTICS)
        .float()
}

export {toDateComposite, toTimeScan}
