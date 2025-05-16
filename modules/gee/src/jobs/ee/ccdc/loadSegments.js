const {job} = require('#gee/jobs/job')

const worker$ = ({
    requestArgs: {recipe, latLng, bands}
}) => {
    const {toGeometry$} = require('#sepal/ee/aoi')
    const {of, map, switchMap} = require('rxjs')
    const ccdc = require('#sepal/ee/timeSeries/ccdc')
    const imageFactory = require('#sepal/ee/imageFactory')
    const _ = require('lodash')
    const ee = require('#sepal/ee/ee')

    const aoi = {type: 'POINT', ...latLng}

    const segmentsForPixel$ = segments$ =>
        segments$.pipe(
            switchMap(segments =>
                toGeometry$(aoi).pipe(
                    switchMap(geometry =>
                        ee.getInfo$(
                            segments.reduceRegion({
                                reducer: ee.Reducer.first(),
                                geometry,
                                scale: 10,
                                tileScale: 16
                            }),
                            `Get CCDC segments for pixel (${latLng})`
                        )
        
                    )
                )
            ),
            map(segments => _.mapValues(segments, value => value || []))
        )

    const assetSegments$ = () =>
        imageFactory({
            type: 'ASSET',
            id: recipe.id
        }).getImage$()

    const recipeRef$ = () => imageFactory(recipe, {selection: recipe.targetType === 'ASSET_MOSAIC' ? [] : bands}).getRecipe$()

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
