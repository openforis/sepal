import assert from 'node:assert/strict'
import {describe, it, mock} from 'node:test'

import {firstValueFrom, of, throwError} from 'rxjs'

// The bands Regression and Unsupervised Classification build, through the REAL imageFactory, asset, covariate,
// training and clustering code, against their shared declarations. Only Earth Engine is substituted: an image is its
// bands' names and dimensionality, and an image operation not modelled here fails. Objects without bands answer
// anything. Launched from a Jest bridge (test/support/nodeWitness.js).

const ASSETS = {'users/x/covariates': ['red', 'nir', 'swir1']}

const scalar = name => ({name, arrayDimensions: 0})

// RxJS takes a value with then() for a promise and one with schedule() for a scheduler; no Earth Engine object is.
const NOT_EARTH_ENGINE = ['then', 'schedule']

const opaque = () => new Proxy(function () {}, {
    get: (_target, key) => typeof key === 'symbol' || NOT_EARTH_ENGINE.includes(key) ? undefined : () => opaque(),
    apply: () => opaque()
})

const eeImage = bands => new Proxy({bands}, {
    get: (target, key) => {
        if (key === 'bands') {
            return target.bands
        }
        if (typeof key === 'symbol' || NOT_EARTH_ENGINE.includes(key)) {
            return undefined
        }
        if (!IMAGE_OPERATIONS[key]) {
            throw new Error(`Earth Engine image operation not modelled here: ${key}`)
        }
        return (...args) => IMAGE_OPERATIONS[key](target.bands, ...args)
    }
})

const named = (bands, names) => bands.filter(({name}) => names.includes(name))

// Earth Engine's own naming: classify() yields one scalar `classification` band, cluster() one scalar band under the
// name it is given, remap() one named `remapped`, and reduce() one band per reducer output.
const IMAGE_OPERATIONS = {
    select: (bands, selection) => eeImage(typeof selection === 'number' ? [bands[selection]] : named(bands, [selection].flat())),
    selectExisting: (bands, names) => eeImage(named(bands, names)),
    addBands: (bands, other) => eeImage([...bands.filter(({name}) => !named(other.bands, [name]).length), ...other.bands]),
    rename: (bands, names) => {
        const renamed = [names].flat()
        assert.equal(renamed.length, bands.length, `renaming ${bands.length} bands to ${renamed}`)
        return eeImage(bands.map((band, index) => ({...band, name: renamed[index]})))
    },
    classify: () => eeImage([scalar('classification')]),
    cluster: (_bands, _clusterer, outputName = 'cluster') => eeImage([scalar(outputName)]),
    reduce: () => eeImage([scalar('max')]),
    remap: () => eeImage([scalar('remapped')]),
    float: bands => eeImage(bands),
    mask: bands => eeImage(bands),
    updateMask: bands => eeImage(bands),
    clip: bands => eeImage(bands),
    bandNames: () => opaque(),
    geometry: () => opaque(),
    sample: () => opaque(),
    sampleRegions: () => opaque(),
    stratifiedSample: () => opaque()
}

const ee = new Proxy({
    getAsset$: id => ASSETS[id] ? of({type: 'Image'}) : throwError(() => new Error(`No asset ${id}`)),
    Image: value => typeof value === 'string'
        ? eeImage(ASSETS[value].map(scalar))
        : Array.isArray(value) ? eeImage(value.flatMap(image => image.bands)) : value
}, {
    get: (target, key) => target[key] || opaque()
})

mock.module('#sepal/ee/ee', {exports: {default: ee}})

const {RecipeScope, withRecipeScope} = await import('#sepal/ee/recipeScope')
const {default: imageFactory} = await import('#sepal/ee/imageFactory')
const {recipeType} = await import('#sepal/recipe/recipeTypeRegistry')

const inOperation = (name, fn) => it(name, async () => {
    const scope = new RecipeScope(id => throwError(() => new Error(`No recipe ${id}`)))
    try {
        await withRecipeScope(scope, fn)
    } finally {
        scope.close()
    }
})

const covariates = {
    imageId: 'image-1',
    type: 'ASSET',
    id: 'users/x/covariates',
    bandSetSpecs: [{type: 'IMAGE_BANDS', included: ['red', 'nir']}]
}

const REGRESSION = {
    id: 'regression-1',
    type: 'REGRESSION',
    model: {
        inputImagery: {images: [covariates]},
        trainingData: {dataSets: [{type: 'EE_TABLE', referenceData: [{x: 1, y: 2, value: 3.5}]}]},
        classifier: {type: 'RANDOM_FOREST', numberOfTrees: 25},
        scale: 30
    }
}

const UNSUPERVISED_CLASSIFICATION = {
    id: 'clusters-1',
    type: 'UNSUPERVISED_CLASSIFICATION',
    model: {
        inputImagery: {images: [covariates]},
        sampling: {numberOfSamples: 1000, sampleScale: 30},
        clusterer: {type: 'KMEANS', numberOfClusters: 5},
        scale: 30
    }
}

const declared = recipe => recipeType(recipe.type).imageOutput.describe({recipe}).bands

for (const [type, recipe] of [['Regression', REGRESSION], ['Unsupervised Classification', UNSUPERVISED_CLASSIFICATION]]) {
    describe(type, () => {
        inOperation('builds exactly the bands it declares, with the dimensionality it declares', async () => {
            const built = await firstValueFrom(imageFactory(recipe).getImage$())

            assert.deepEqual(
                built.bands,
                declared(recipe).map(({name, dataType}) => ({name, arrayDimensions: dataType.arrayDimensions}))
            )
        })

        inOperation('says it can be asked for exactly the bands it declares', async () => {
            const catalogue = await firstValueFrom(imageFactory(recipe).getBands$())

            assert.deepEqual(catalogue, declared(recipe).map(({name}) => name))
        })
    })
}
