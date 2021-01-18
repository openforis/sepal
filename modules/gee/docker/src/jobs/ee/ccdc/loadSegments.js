const {job} = require('root/jobs/job')

const worker$ = ({recipe, latLng, bands}) => {
    const {toGeometry} = require('sepal/ee/aoi')
    const {of} = require('rx')
    const {map, switchMap} = require('rx/operators')
    const ccdc = require('sepal/ee/timeSeries/ccdc')
    const imageFactory = require('sepal/ee/imageFactory')
    const _ = require('lodash')
    const ee = require('ee')

    const aoi = {type: 'POINT', ...latLng}
    const geometry = toGeometry(aoi)

    const segmentsForPixel$ = segments$ =>
        segments$.pipe(
            switchMap(segments =>
                ee.getInfo$(
                    segments.reduceRegion({
                        reducer: ee.Reducer.first(),
                        geometry,
                        scale: 10
                    }),
                    `Get CCDC segments for pixel (${latLng})`
                )
            ),
            map(segments => _.mapValues(segments, value => value || []))
        )

    const assetSegments$ = () =>
        of(new ee.Image(recipe.id))

    const recipeRef$ = () => imageFactory(recipe, {selection: bands}).getRecipe$()

    const recipeSegments$ = () =>
        of(ccdc(
            _.merge(recipe, {model: {aoi: {type: 'POINT', ...latLng}}}),
            {selection: bands}
        ))

    const segments$ = recipe.type === 'ASSET'
        ? assetSegments$()
        : (recipe.type === 'RECIPE_REF'
            ? recipeRef$()
            : recipeSegments$()
        ).pipe(
            switchMap(ccdc => ccdc.getImage$())
        )
    return segmentsForPixel$(segments$)
}

module.exports = job({
    jobName: 'LoadCCDCSegments',
    jobPath: __filename,
    worker$
})
