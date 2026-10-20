// Read-only EE probe of Remapping's used/unused missing selections, with asset and recipe inputs.
// Recipes stay in memory; no assets, tasks or saved recipes are created.
// docker exec -w /usr/local/src/sepal/modules/gee gee node verify/remappingSourceBands.mjs
import assert from 'node:assert/strict'

import {firstValueFrom, of, timeout} from 'rxjs'

import {googleProjectId, serviceAccountCredentials} from '#gee/config'
import ee from '#sepal/ee/ee'
import ImageFactory from '#sepal/ee/imageFactory'
import {RecipeScope, withRecipeScope} from '#sepal/ee/recipeScope'

const ASSET = 'USGS/SRTMGL1_003'
const MISSING = 'not_a_band'
const remapping = (id, type, source, used, included) => ({id, type: 'REMAPPING', model: {
    inputImagery: {images: [{imageId: 'input', type, id: source, includedBands: included.map(band => ({band}))}]},
    legend: {entries: [{value: 1, constraints: [{image: 'input', band: used, operator: '>', value: -1000}]}]}
}})
const assetRecipe = {id: 'asset-recipe', type: 'ASSET_MOSAIC', model: {
    assetDetails: {type: 'Image', assetId: ASSET}, aoi: {type: 'ASSET_BOUNDS'}
}}
const stack = {id: 'stack', type: 'STACK', model: {
    inputImagery: {images: [{imageId: 'dem', type: 'ASSET', id: ASSET}]},
    bandNames: {bandNames: [{imageId: 'dem', bands: [{originalName: 'elevation', outputName: 'elevation'}]}]}
}}
const broken = remapping('broken', 'ASSET', ASSET, MISSING, ['elevation', MISSING])
const cases = [
    ['used missing asset band', broken, false],
    ['second Remapping over broken source', remapping('downstream', 'RECIPE_REF', broken.id, 'class', ['class']), false],
    ['unused missing asset band', remapping('unused-asset', 'ASSET', ASSET, 'elevation', ['elevation', MISSING]), true],
    ['unused missing Asset recipe band', remapping('unused-recipe', 'RECIPE_REF', assetRecipe.id, 'elevation', ['elevation', MISSING]), false],
    ['unused missing Stack band', remapping('unused-stack', 'RECIPE_REF', stack.id, 'elevation', ['elevation', MISSING]), true]
]
const callbackPromise = fn => new Promise((resolve, reject) =>
    fn((result, error) => error ? reject(new Error(error)) : resolve(result)))
const read = value => firstValueFrom(ee.getInfo$(value, 'Remapping source-band probe').pipe(timeout(60000)))

async function main() {
    await callbackPromise(callback => ee.data.authenticateViaPrivateKey(serviceAccountCredentials,
        () => callback(true), error => callback(null, error)))
    await callbackPromise(callback => ee.initialize(null, null, () => callback(true), error => callback(null, error), null, googleProjectId))
    ee.setMaxRetries(0)
    const records = Object.fromEntries([assetRecipe, stack, broken].map(recipe => [recipe.id, recipe]))
    const scope = new RecipeScope(id => of(records[id]))
    try {
        await withRecipeScope(scope, async () => {
            for (const [label, recipe, executes] of cases) {
                const sample = async () => {
                    const image = await firstValueFrom(ImageFactory(recipe).getImage$())
                    return read(image.reduceRegion({reducer: ee.Reducer.first(), geometry: ee.Geometry.Point([-60.3, -2.8]), scale: 30}))
                }
                if (executes) {
                    assert.deepEqual(await sample(), {class: 1})
                } else {
                    await assert.rejects(sample, /not_a_band.*did not match any bands|did not match any bands.*not_a_band/)
                }
                console.info(`PASS ${label}: ${executes ? 'sampled class=1' : 'EE rejects the missing band'}`)
            }
        })
    } finally {
        scope.close()
    }
}

main().then(() => process.exit(0)).catch(error => {
    console.error(error)
    process.exit(1)
})
