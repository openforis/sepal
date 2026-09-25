import assert from 'node:assert/strict'
import {beforeEach, describe, it, mock} from 'node:test'

import {firstValueFrom, of, throwError} from 'rxjs'

// Which source bands Class Change reads, and in which precedence Index Change's legend rules are applied, through
// the REAL imageFactory, asset, Class Change and Index Change code. Only Earth Engine is substituted, and only what
// these questions need is modelled: an input image refuses a band it does not hold, and a constant image keeps the
// value it was made from, so the collection a mosaic is built from can be read back. Everything else answers
// anything, so this says nothing about pixel values.

const ASSETS = {
    'users/x/from': ['class', 'probability_1', 'probability_2'],
    'users/x/to': ['landcover', 'probability_1', 'probability_2'],
    'users/x/before': ['ndvi'],
    'users/x/after': ['ndvi']
}

// RxJS takes a value with then() for a promise and one with schedule() for a scheduler; no Earth Engine object is.
const NOT_EARTH_ENGINE = ['then', 'schedule']
const isEarthEngineKey = key => typeof key !== 'symbol' && !NOT_EARTH_ENGINE.includes(key)

let selected = []
let mosaics = []
const constantValues = new WeakMap()
const collectionValues = new WeakMap()

const opaque = () => new Proxy(function () {}, {
    get: (_target, key) => isEarthEngineKey(key) ? () => opaque() : undefined,
    apply: () => opaque()
})

const inputImage = (id, bands) => new Proxy({}, {
    get: (_target, key) => {
        if (!isEarthEngineKey(key)) {
            return undefined
        }
        if (key !== 'select') {
            return () => opaque()
        }
        return selection => {
            const names = [selection].flat()
            if (names.every(name => typeof name === 'string')) {
                const missing = names.filter(name => !bands.includes(name))
                if (missing.length) {
                    throw new Error(`${id} has no band ${missing.join(', ')}`)
                }
                selected.push(...names.map(band => ({id, band})))
            }
            return opaque()
        }
    }
})

const constant = value => {
    const image = new Proxy({}, {get: (_target, key) => isEarthEngineKey(key) ? () => image : undefined})
    constantValues.set(image, value)
    return image
}

const ee = new Proxy({
    getAsset$: id => ASSETS[id] ? of({type: 'Image'}) : throwError(() => new Error(`No asset ${id}`)),
    Image: value => typeof value === 'string'
        ? inputImage(value, ASSETS[value])
        : typeof value === 'number' ? constant(value) : opaque(),
    ImageCollection: images => {
        const collection = opaque()
        if (Array.isArray(images) && images.length && images.every(image => constantValues.has(image))) {
            collectionValues.set(collection, images.map(image => constantValues.get(image)))
        }
        return collection
    },
    mosaic: collection => {
        mosaics.push(collectionValues.get(collection))
        return opaque()
    }
}, {
    get: (target, key) => target[key] || opaque()
})

mock.module('#sepal/ee/ee', {exports: {default: ee}})

const {RecipeScope, withRecipeScope} = await import('#sepal/ee/recipeScope')
const {default: imageFactory} = await import('#sepal/ee/imageFactory')

const inOperation = (name, fn) => it(name, async () => {
    const scope = new RecipeScope(id => throwError(() => new Error(`No recipe ${id}`)))
    try {
        await withRecipeScope(scope, fn)
    } finally {
        scope.close()
    }
})

beforeEach(() => {
    selected = []
    mosaics = []
})

const LEGEND_ENTRIES = [{value: 1, label: 'Forest'}, {value: 2, label: 'Other'}]

describe('Class Change between images whose class bands are named differently', () => {
    const classChange = {
        id: 'class-change-1',
        type: 'CLASS_CHANGE',
        model: {
            fromImage: {type: 'ASSET', id: 'users/x/from', band: 'class', legendEntries: LEGEND_ENTRIES},
            toImage: {type: 'ASSET', id: 'users/x/to', band: 'landcover', legendEntries: LEGEND_ENTRIES},
            options: {minConfidence: 0}
        }
    }

    inOperation('reads each image\'s class from the band configured for it', async () => {
        await firstValueFrom(imageFactory(classChange).getImage$())

        assert.deepEqual(
            selected.filter(({band}) => ['class', 'landcover'].includes(band)),
            [{id: 'users/x/from', band: 'class'}, {id: 'users/x/to', band: 'landcover'}]
        )
    })
})

// ee.mosaic() puts the last image of its collection on top, so the first legend entry, last in the collection,
// decides a pixel two rules both match.
describe('Index Change built twice from one model', () => {
    const rule = value => ({
        value,
        booleanOperator: 'and',
        constraints: [{image: 'this-recipe', band: 'difference', operator: '>', value: 0}]
    })
    const indexChange = () => ({
        id: 'index-change-1',
        type: 'INDEX_CHANGE',
        model: {
            fromImage: {type: 'ASSET', id: 'users/x/before', band: 'ndvi'},
            toImage: {type: 'ASSET', id: 'users/x/after', band: 'ndvi'},
            legend: {entries: [rule(1), rule(2), rule(3)]},
            options: {minConfidence: 2.5}
        }
    })

    inOperation('gives its first legend rule precedence both times', async () => {
        const recipe = indexChange()

        await firstValueFrom(imageFactory(recipe).getImage$())
        await firstValueFrom(imageFactory(recipe).getImage$())

        assert.deepEqual(mosaics, [[3, 2, 1], [3, 2, 1]])
    })

    inOperation('leaves the legend of its model as it was', async () => {
        const recipe = indexChange()

        await firstValueFrom(imageFactory(recipe).getImage$())

        assert.deepEqual(recipe.model.legend.entries.map(({value}) => value), [1, 2, 3])
    })
})
