const {job} = require('#gee/jobs/job')

const worker$ = ({aoi, stratification, stratificationBand, probability, probabilityBand, scale, crs, batch}, {sepalUser}) => {
    const {forkJoin, map, switchMap} = require('rxjs')
    const {toGeometry$} = require('sepal/src/ee/aoi')
    const {exportToCSV$} = require('../batch/exportToCSV')
    const {parseGroups} = require('../batch/parse')
    const imageFactory = require('sepal/src/ee/imageFactory')
    const ee = require('#sepal/ee/ee')

    const description = 'probability-per-stratum'
    console.log({aoi, stratification, stratificationBand, probability, probabilityBand, scale, crs, batch})
    return forkJoin({
        eeGeometry: toGeometry$(aoi),
        eeStratification: imageFactory(stratification, {selection: [stratificationBand]}).getImage$(),
        eeProbability: imageFactory(probability, {selection: [probabilityBand]}).getImage$()
    }).pipe(
        switchMap(({eeGeometry, eeStratification, eeProbability}) => {
            const eeDictionary = reduceRegion({eeGeometry, eeStratification, eeProbability})
            return batch
                ? exportToCSV$({
                    collection: ee.FeatureCollection([ee.Feature(null, eeDictionary)]),
                    description,
                    selectors: ['groups'],
                    sepalUser
                }).pipe(
                    map(parseGroups)
                )
                : ee.getInfo$(eeDictionary, description)
        }),
        map(o => o.groups)
    )

    function reduceRegion({eeGeometry, eeStratification, eeProbability}) {
        return eeProbability.select(probabilityBand)
            .addBands(eeStratification.select(stratificationBand))
            .reduceRegion({
                reducer: ee.Reducer.mean()
                    .setOutputs(['probability'])
                    .group(1, 'stratum'),
                geometry: eeGeometry,
                scale,
                crs,
                maxPixels: 1e13,
            })
    }
}

module.exports = job({
    jobName: 'Calculate probability per stratum',
    jobPath: __filename,
    worker$
})
