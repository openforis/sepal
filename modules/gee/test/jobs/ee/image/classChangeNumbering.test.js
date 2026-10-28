import assert from 'node:assert/strict'
import {beforeEach, describe, it, mock} from 'node:test'

import {firstValueFrom, of, throwError} from 'rxjs'

// Which code Class Change gives each transition, through the REAL imageFactory, asset and Class Change code. A
// transition's code comes from the position of each image's class among its legend's values, and execution finds
// that position by comparing the class band with each value in turn. Only Earth Engine is substituted: a class band
// records the values it is compared with, in order, and everything else answers anything. Pixel codes themselves are
// checked on live Earth Engine by verify/classChangeConfidence.mjs.

const ASSETS = {'users/x/from': ['class'], 'users/x/to': ['landcover']}

// RxJS takes a value with then() for a promise and one with schedule() for a scheduler; no Earth Engine object is.
const NOT_EARTH_ENGINE = ['then', 'schedule']
const isEarthEngineKey = key => typeof key !== 'symbol' && !NOT_EARTH_ENGINE.includes(key)

let compared = {}

const opaque = () => new Proxy(function () {}, {
    get: (_target, key) => isEarthEngineKey(key) ? () => opaque() : undefined,
    apply: () => opaque()
})

const classBand = id => {
    const band = new Proxy({}, {
        get: (_target, key) => {
            if (!isEarthEngineKey(key)) {
                return undefined
            }
            if (key === 'select') {
                return () => band
            }
            if (key === 'eq') {
                return value => {
                    compared[id] = [...(compared[id] || []), value]
                    return opaque()
                }
            }
            return () => opaque()
        }
    })
    return band
}

const inputImage = id => new Proxy({}, {
    get: (_target, key) => {
        if (!isEarthEngineKey(key)) {
            return undefined
        }
        return key === 'select' ? () => classBand(id) : () => opaque()
    }
})

const ee = new Proxy({
    getAsset$: id => ASSETS[id] ? of({type: 'Image'}) : throwError(() => new Error(`No asset ${id}`)),
    Image: value => typeof value === 'string' ? inputImage(value) : opaque()
}, {
    get: (target, key) => target[key] || opaque()
})

mock.module('#sepal/ee/ee', {exports: {default: ee}})

const {RecipeScope, withRecipeScope} = await import('#sepal/ee/recipeScope')
const {default: imageFactory} = await import('#sepal/ee/imageFactory')
const {classTransitions} = await import('#sepal/recipe/type/classChange')

const inOperation = (name, fn) => it(name, async () => {
    const scope = new RecipeScope(id => throwError(() => new Error(`No recipe ${id}`)))
    try {
        await withRecipeScope(scope, fn)
    } finally {
        scope.close()
    }
})

beforeEach(() => {
    compared = {}
})

const legend = values => values.map(value => ({value, label: `class ${value}`}))

const classChange = (fromValues, toValues) => ({
    id: 'class-change-1',
    type: 'CLASS_CHANGE',
    model: {
        fromImage: {type: 'ASSET', id: 'users/x/from', band: 'class', legendEntries: legend(fromValues)},
        toImage: {type: 'ASSET', id: 'users/x/to', band: 'landcover', legendEntries: legend(toValues)},
        options: {minConfidence: 0}
    }
})

// The code execution gives a transition: its classes' positions among the values each image was compared with.
const executedCode = ({from, to}) => {
    const fromOrder = compared['users/x/from']
    const toOrder = compared['users/x/to']
    return fromOrder.indexOf(from.value) * toOrder.length + toOrder.indexOf(to.value) + 1
}

describe('the code Class Change gives a transition', () => {
    for (const [legends, fromValues, toValues] of [
        ['ascending single-digit classes', [1, 2, 3], [1, 2, 3]],
        ['classes whose text order is not their numeric order', [2, 10], [2, 10]],
        ['legends deliberately ordered neither ascending nor as text', [3, 1, 2], [3, 1, 2]],
        ['different legends on each image', [2, 10], [3, 1, 2]]
    ]) {
        inOperation(`is the one the legend gives it, for ${legends}`, async () => {
            const recipe = classChange(fromValues, toValues)

            await firstValueFrom(imageFactory(recipe).getImage$())

            const transitions = classTransitions(recipe.model.fromImage.legendEntries, recipe.model.toImage.legendEntries)
            assert.deepEqual(transitions.map(executedCode), transitions.map(({value}) => value))
        })
    }

    inOperation('leaves both legends of the model as they were', async () => {
        const recipe = classChange([2, 10], [3, 1, 2])

        await firstValueFrom(imageFactory(recipe).getImage$())

        assert.deepEqual(recipe.model.fromImage.legendEntries, legend([2, 10]))
        assert.deepEqual(recipe.model.toImage.legendEntries, legend([3, 1, 2]))
    })
})
