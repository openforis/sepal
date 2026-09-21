import {jest} from '@jest/globals'
import {firstValueFrom, of} from 'rxjs'

import {ENCODING_PROPERTY, encodingPropertyKeys} from '#sepal/recipe/output/bandEncoding'

let assetBands = []
let assetProperties = {}
let recipeBands = []
let recipePhysicalBands = []
let recipeProperties = {}
const factoryCalls = []
const toDictionaryCalls = []
const getInfoCalls = []
const bandTypesCalls = []
const pixelTypeCalls = []
const dimensionsCalls = []

const serverList = (image, values) => ({
    kind: 'LIST',
    image,
    values,
    map: mapper => serverList(image, values.map(mapper))
})

const imageFor = (id, physicalBands, properties = {}) => {
    const image = {
        id,
        bandNames: () => serverList(image, physicalBands.map(({name}) => name)),
        // What Earth Engine answers for a property an image does not carry: an entry that is simply absent.
        toDictionary: keys => {
            toDictionaryCalls.push({image, keys})
            return {
                kind: 'DICTIONARY',
                image,
                values: Object.fromEntries(
                    keys.filter(key => key in properties).map(key => [key, properties[key]])
                )
            }
        },
        bandTypes: () => {
            bandTypesCalls.push(image)
            return {
                kind: 'BAND_TYPES',
                image,
                get: name => {
                    const {arrayDimensions} = physicalBands.find(band => band.name === name)
                    return {
                        kind: 'PIXEL_TYPE',
                        image,
                        name,
                        dimensions: () => {
                            dimensionsCalls.push({image, name})
                            return arrayDimensions
                        }
                    }
                }
            }
        }
    }
    return image
}

const materialize = value => {
    if (value?.kind === 'LIST') {
        return value.values.map(materialize)
    }
    if (value?.kind === 'DICTIONARY') {
        return Object.fromEntries(Object.entries(value.values).map(([key, entry]) => [key, materialize(entry)]))
    }
    if (value?.kind) {
        throw new Error(`Earth Engine expression was not normalized before evaluation: ${value.kind}`)
    }
    return value
}

const ee = {
    Dictionary: values => ({kind: 'DICTIONARY', values}),
    PixelType: value => {
        pixelTypeCalls.push(value)
        return value
    },
    getInfo$: (value, description) => {
        getInfoCalls.push({value, description})
        return of(materialize(value))
    }
}

jest.unstable_mockModule('#sepal/ee/ee', () => ({default: ee}))
jest.unstable_mockModule('#gee/jobs/job', () => ({job: config => config}))
jest.unstable_mockModule('#sepal/ee/imageFactory', () => ({
    default: source => {
        factoryCalls.push(source)
        return source.type === 'ASSET'
            ? {getImage$: () => of(imageFor(source.id, assetBands, assetProperties))}
            : {
                getBands$: () => of(recipeBands),
                getImage$: () => of(imageFor(source.id, recipePhysicalBands, recipeProperties))
            }
    }
}))

const {default: bandsJob} = await import('#gee/jobs/ee/image/bands')
const {worker$} = bandsJob

const run = requestArgs => firstValueFrom(worker$({requestArgs}))

beforeEach(() => {
    assetBands = []
    assetProperties = {}
    recipeBands = []
    recipePhysicalBands = []
    recipeProperties = {}
    factoryCalls.length = 0
    toDictionaryCalls.length = 0
    getInfoCalls.length = 0
    bandTypesCalls.length = 0
    pixelTypeCalls.length = 0
    dimensionsCalls.length = 0
})

describe('the existing response contract', () => {
    it('keeps an ordinary asset request as an ordered string array', async () => {
        assetBands = [
            {name: 'array', arrayDimensions: 1},
            {name: 'scalar', arrayDimensions: 0}
        ]

        await expect(run({asset: 'users/x/image'})).resolves.toEqual(['array', 'scalar'])
        expect(factoryCalls).toEqual([{type: 'ASSET', id: 'users/x/image'}])
    })

    it('keeps an ordinary recipe request as the existing string array', async () => {
        const recipe = {id: 'recipe-1', type: 'CCDC', model: {}}
        recipeBands = ['tStart', 'ndvi_coefs']

        await expect(run({recipe})).resolves.toEqual(recipeBands)
        expect(factoryCalls).toEqual([recipe])
        expect(getInfoCalls).toEqual([])
    })
})

describe('typed physical evidence', () => {
    const physicalBands = [
        {name: 'future_matrix', arrayDimensions: 2},
        {name: 'scalar', arrayDimensions: 0},
        {name: 'tStart', arrayDimensions: 1}
    ]

    it('returns ordered normalized dimensions for an asset', async () => {
        assetBands = physicalBands

        await expect(run({asset: 'users/x/image', includeDataTypes: true})).resolves.toEqual(physicalBands)
    })

    it('returns the same typed contract for a recipe', async () => {
        const recipe = {id: 'recipe-1', type: 'CCDC', model: {}}
        recipeBands = physicalBands.map(({name}) => name)
        recipePhysicalBands = physicalBands

        await expect(run({recipe, includeDataTypes: true})).resolves.toEqual(physicalBands)
        expect(factoryCalls).toEqual([recipe])
    })

    it('normalizes PixelType.dimensions() before the single metadata evaluation', async () => {
        assetBands = physicalBands

        await run({asset: 'users/x/image', includeDataTypes: true})

        expect(getInfoCalls).toHaveLength(1)
        expect(bandTypesCalls).toHaveLength(1)
        expect(pixelTypeCalls).toHaveLength(physicalBands.length)
        expect(dimensionsCalls.map(({name}) => name)).toEqual(physicalBands.map(({name}) => name))
        const evaluatedImage = getInfoCalls[0].value.values.bands.image
        expect(bandTypesCalls[0]).toBe(evaluatedImage)
        expect(pixelTypeCalls.every(({image}) => image === evaluatedImage)).toBe(true)
    })

    it.each([
        ['asset', 1],
        ['asset', 3],
        ['asset', 8],
        ['recipe', 1],
        ['recipe', 3],
        ['recipe', 8]
    ])('uses exactly one complete metadata evaluation for a %s with %i bands', async (source, count) => {
        const bands = Array.from({length: count}, (_value, index) => ({
            name: `b${index}`,
            arrayDimensions: index % 3
        }))
        const request = source === 'asset'
            ? {asset: 'users/x/image', includeDataTypes: true}
            : {recipe: {id: 'recipe-1', type: 'CCDC', model: {}}, includeDataTypes: true}
        if (source === 'asset') {
            assetBands = bands
        } else {
            recipePhysicalBands = bands
        }

        await run(request)

        expect(getInfoCalls).toHaveLength(1)
        expect(pixelTypeCalls).toHaveLength(count)
        expect(dimensionsCalls).toHaveLength(count)
    })
})

describe('stored band encoding', () => {
    const REFLECTANCE = {scale: 0.0001, offset: 0, unit: '1'}
    const THERMAL = {scale: 0.1, offset: 0, unit: 'K'}

    const storing = bands => ({[ENCODING_PROPERTY]: JSON.stringify({version: 1, bands})})

    const readAsset = () => run({asset: 'users/x/image', includeDataTypes: true})

    beforeEach(() => {
        assetBands = [
            {name: 'red', arrayDimensions: 0},
            {name: 'thermal', arrayDimensions: 0}
        ]
    })

    it('carries what the asset states, per band', async () => {
        assetProperties = storing({red: REFLECTANCE, thermal: THERMAL})

        await expect(readAsset()).resolves.toEqual([
            {name: 'red', arrayDimensions: 0, encoding: REFLECTANCE},
            {name: 'thermal', arrayDimensions: 0, encoding: THERMAL}
        ])
    })

    it('reads a non-zero offset as stated', async () => {
        const OFFSET = {scale: 0.0000275, offset: -0.2, unit: '1'}
        assetProperties = storing({red: OFFSET})

        const [red] = await readAsset()

        expect(red.encoding).toEqual(OFFSET)
    })

    it('completes an omitted offset rather than leaving it open', async () => {
        assetProperties = storing({red: {scale: 0.0001, unit: '1'}})

        const [red] = await readAsset()

        expect(red.encoding).toEqual({scale: 0.0001, offset: 0, unit: '1'})
    })

    it('leaves a legacy asset with no metadata unknown', async () => {
        assetProperties = {}

        await expect(readAsset()).resolves.toEqual([
            {name: 'red', arrayDimensions: 0},
            {name: 'thermal', arrayDimensions: 0}
        ])
    })

    it.each([
        ['unparseable', 'not json at all'],
        ['not an object', JSON.stringify(['red'])],
        ['an unsupported version', JSON.stringify({version: 9, bands: {red: REFLECTANCE}})],
        ['explicitly empty', JSON.stringify({version: 1, bands: {}})],
        ['a manifest whose parts are absent', JSON.stringify({version: 2, parts: 2})]
    ])('leaves every band unknown when the property is %s, and still describes the asset', async (_case, stored) => {
        assetProperties = {[ENCODING_PROPERTY]: stored}

        await expect(readAsset()).resolves.toEqual([
            {name: 'red', arrayDimensions: 0},
            {name: 'thermal', arrayDimensions: 0}
        ])
    })

    it('withholds only the bands it cannot read', async () => {
        assetProperties = storing({red: {scale: 0}, thermal: THERMAL, absent: REFLECTANCE})

        await expect(readAsset()).resolves.toEqual([
            {name: 'red', arrayDimensions: 0},
            {name: 'thermal', arrayDimensions: 0, encoding: THERMAL}
        ])
    })

    describe('for bands named like object members', () => {
        beforeEach(() => {
            assetBands = [
                {name: 'constructor', arrayDimensions: 0},
                {name: 'toString', arrayDimensions: 0}
            ]
        })

        it('leaves them unknown when the asset states nothing', async () => {
            assetProperties = {}

            await expect(readAsset()).resolves.toEqual(assetBands)
        })

        it('carries what the asset states for them', async () => {
            assetProperties = storing({constructor: REFLECTANCE, toString: THERMAL})

            await expect(readAsset()).resolves.toEqual([
                {name: 'constructor', arrayDimensions: 0, encoding: REFLECTANCE},
                {name: 'toString', arrayDimensions: 0, encoding: THERMAL}
            ])
        })
    })

    it('carries what an asset states in several properties', async () => {
        assetProperties = {
            [ENCODING_PROPERTY]: JSON.stringify({version: 2, parts: 2}),
            sepal_band_encoding_1: JSON.stringify({red: REFLECTANCE}),
            sepal_band_encoding_2: JSON.stringify({thermal: THERMAL})
        }

        await expect(readAsset()).resolves.toEqual([
            {name: 'red', arrayDimensions: 0, encoding: REFLECTANCE},
            {name: 'thermal', arrayDimensions: 0, encoding: THERMAL}
        ])
    })

    // However many properties the encoding occupies, they are named before the asset is read, so reading it
    // stays the one evaluation that reads the bands.
    it('reads every part in the one evaluation that reads the bands', async () => {
        assetProperties = {
            [ENCODING_PROPERTY]: JSON.stringify({version: 2, parts: 2}),
            sepal_band_encoding_1: JSON.stringify({red: REFLECTANCE}),
            sepal_band_encoding_2: JSON.stringify({thermal: THERMAL})
        }

        await readAsset()

        expect(getInfoCalls).toHaveLength(1)
        expect(toDictionaryCalls).toEqual([
            {image: getInfoCalls[0].value.values.bands.image, keys: encodingPropertyKeys()}
        ])
    })

    it('is never read from a recipe image', async () => {
        recipePhysicalBands = [{name: 'red', arrayDimensions: 0}]
        recipeProperties = storing({red: THERMAL})

        const bands = await run({recipe: {id: 'recipe-1', type: 'MOSAIC', model: {}}, includeDataTypes: true})

        expect(bands).toEqual([{name: 'red', arrayDimensions: 0}])
        expect(toDictionaryCalls).toEqual([])
    })
})
