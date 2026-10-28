// Read-only live EE verification: two in-memory recipe inputs over a public DEM, with different extents and masks.
// Exercises production Band Math, both full and selected outputs. No recipes, assets or export tasks are written.
// docker exec -w /usr/local/src/sepal/modules/gee gee node verify/bandMathGeometry.mjs
import assert from 'node:assert/strict'

import {firstValueFrom, of, timeout} from 'rxjs'

import {googleProjectId, serviceAccountCredentials} from '#gee/config'
import ee from '#sepal/ee/ee'
import ImageFactory from '#sepal/ee/imageFactory'
import {RecipeScope, withRecipeScope} from '#sepal/ee/recipeScope'

import {identical, pixelComparison} from './pixelComparison.mjs'

const callbackPromise = fn => new Promise((resolve, reject) =>
    fn((result, error) => error ? reject(new Error(error)) : resolve(result)))
const read = value => firstValueFrom(ee.getInfo$(value, 'Band Math geometry verification').pipe(timeout(120000)))
const input = (id, bounds, operator, value) => ({id, type: 'ASSET_MOSAIC', model: {
    assetDetails: {type: 'Image', assetId: 'USGS/SRTMGL1_003'},
    aoi: {type: 'POLYGON', path: [
        [bounds[0], bounds[1]], [bounds[0], bounds[3]], [bounds[2], bounds[3]], [bounds[2], bounds[1]]
    ]},
    mask: {constraintsEntries: [{booleanOperator: 'and', constraints: [{band: 'elevation', operator, value}]}]}
}})
const first = input('first', [-119.60, 37.70, -119.56, 37.74], '<', 2000)
const second = input('second', [-119.62, 37.68, -119.54, 37.76], '>', 1400)
const recipe = {id: 'geometry-check', type: 'BAND_MATH', model: {
    inputImagery: {images: [first, second].map((input, i) => ({
        type: 'RECIPE_REF', id: input.id, imageId: input.id, name: `i${i + 1}`, includedBands: [{name: 'elevation'}]
    }))},
    calculations: {calculations: [
        {imageId: 'expression', name: 'c1', type: 'EXPRESSION', expression: 'i2.elevation * 2', dataType: 'float', includedBands: [{name: 'double'}]},
        {imageId: 'reducer', name: 'c2', type: 'FUNCTION', reducer: 'mean', dataType: 'auto', includedBands: [{name: 'mean'}],
            usedBands: [{imageId: 'first', name: 'elevation'}, {imageId: 'second', name: 'elevation'}]}
    ]},
    outputBands: {outputImages: [
        {imageId: 'first', outputBands: [{name: 'elevation', outputName: 'first_dem'}]},
        {imageId: 'second', outputBands: [{name: 'elevation', outputName: 'second_dem'}]},
        {imageId: 'expression', outputBands: [{name: 'double', outputName: 'doubled'}]},
        {imageId: 'reducer', outputBands: [{name: 'mean', outputName: 'average'}]}
    ]}
}}

const main = async () => {
    await callbackPromise(callback => ee.data.authenticateViaPrivateKey(serviceAccountCredentials,
        () => callback(true), error => callback(null, error)))
    await callbackPromise(callback => ee.initialize(null, null, () => callback(true), error => callback(null, error), null, googleProjectId))
    ee.setMaxRetries(0)
    // EE evaluates only the chosen If branch: an unbounded region must not be passed to clip at execution.
    const constant = ee.Image(1)
    const unbounded = constant.geometry()
    const unrestricted = ee.Image(ee.Algorithms.If(unbounded.isUnbounded(), constant, constant.clip(unbounded)))
    assert.deepEqual(await read(unrestricted.reduceRegion({reducer: ee.Reducer.first(), geometry: ee.Geometry.Point([0, 0]), scale: 1000})), {constant: 1})
    await assert.rejects(() => read(constant.clip(ee.Geometry.MultiPolygon([])).reduceRegion({
        reducer: ee.Reducer.first(), geometry: ee.Geometry.Point([0, 0]), scale: 1000
    })), /geometry for image clipping must not be empty/)
    console.info('PASS EE edge cases: unbounded boundary imposes no clip; empty geometry is refused')
    const scope = new RecipeScope(id => of({first, second}[id]))
    await withRecipeScope(scope, async () => {
        const factory = ImageFactory(recipe)
        const boundary = await firstValueFrom(factory.getGeometry$())
        const a = await firstValueFrom(ImageFactory(first).getImage$())
        const b = await firstValueFrom(ImageFactory(second).getImage$())
        const extent = b.geometry()
        const reference = ee.Image.cat([
            a.rename('first_dem'), b.rename('second_dem'), b.multiply(2).float().rename('doubled'),
            ee.Image.cat([a, b]).reduce(ee.Reducer.mean()).rename('average')
        ])
        const names = ['first_dem', 'second_dem', 'doubled', 'average']
        const projection = await read(a.projection())
        const grid = {crs: projection.crs, crsTransform: projection.transform, maxPixels: 1000000}
        // Compare interior pixels on the native grid. EE may give boundary-straddling cells fractional
        // coverage, so compare those separately with an explicitly clipped reference.
        const coverage = ee.Image(1).setDefaultProjection(a.projection()).clip(boundary).mask().unmask(0, false)
        const sameBoundary = await read(boundary.symmetricDifference(a.geometry(), 1).area(1))
        assert.equal(sameBoundary, 0, 'reported boundary is the first input geometry')
        let failures = 0
        for (const selection of [[], ...names.map(name => [name])]) {
            const image = await firstValueFrom(ImageFactory(recipe, {selection}).getImage$())
            const expected = reference.select(selection.length ? selection : names)
            const inside = {geometry: boundary, ...grid}
            const result = await read(ee.Dictionary({
                bands: image.bandNames(), referenceBands: expected.bandNames(),
                maskDifferences: image.mask().unmask(0, false).neq(expected.mask().unmask(0, false)).updateMask(coverage.eq(1))
                    .reduceRegion({...inside, reducer: ee.Reducer.sum()}),
                clipMaskDifferences: image.mask().unmask(0, false).neq(expected.clip(boundary).mask().unmask(0, false))
                    .reduceRegion({geometry: extent, ...grid, reducer: ee.Reducer.sum()}),
                maxAbsoluteDifference: image.subtract(expected).abs().reduceRegion({...inside, reducer: ee.Reducer.max()}),
                jointlyValid: image.mask().and(expected.mask()).reduceRegion({...inside, reducer: ee.Reducer.sum()}),
                outsideValid: image.mask().unmask(0, false).and(coverage.not())
                    .reduceRegion({geometry: extent, ...grid, reducer: ee.Reducer.sum()}),
                referenceOutsideValid: expected.mask().unmask(0, false).and(coverage.not())
                    .reduceRegion({geometry: extent, ...grid, reducer: ee.Reducer.sum()}),
                insideMasked: expected.mask().unmask(0, false).not().reduceRegion({...inside, reducer: ee.Reducer.sum()}),
                projections: image.bandNames().map(name => image.select([name]).projection()),
                referenceProjections: expected.bandNames().map(name => expected.select([name]).projection())
            }))
            // The fixture must actually exercise pixels outside the first extent and existing masked pixels.
            for (const name of result.bands.filter(name => name !== 'first_dem')) {
                assert(result.referenceOutsideValid[name] > 0, `${name} must have source pixels outside the boundary`)
            }
            for (const name of result.bands.filter(name => name !== 'average')) {
                assert(result.insideMasked[name] > 0, `${name} must exercise an existing mask inside the boundary`)
            }
            const comparison = pixelComparison(result)
            const passed = identical(comparison)
                && Object.values(result.outsideValid).every(count => count === 0)
                && Object.values(result.clipMaskDifferences).every(count => count === 0)
                && JSON.stringify(result.projections) === JSON.stringify(result.referenceProjections)
            if (!passed) failures++
            console.info(JSON.stringify({passed, selection, reportedBoundaryMatchesFirst: sameBoundary === 0, comparison,
                outsideValid: result.outsideValid, clipMaskDifferences: result.clipMaskDifferences, referenceOutsideValid: result.referenceOutsideValid,
                insideMasked: result.insideMasked, projectionsUnchanged: JSON.stringify(result.projections) === JSON.stringify(result.referenceProjections)}))
        }
        assert.equal(failures, 0, `${failures} geometry checks failed`)
    }).finally(() => scope.close())
}
main().then(() => process.exit(0)).catch(error => {
    console.error(error.message)
    process.exit(1)
})
