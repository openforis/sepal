import {jest} from '@jest/globals'
import {firstValueFrom, of} from 'rxjs'

let assetBands = []
let recipeBands = []
let recipePhysicalBands = []
const factoryCalls = []
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

const imageFor = (id, physicalBands) => {
    const image = {
        id,
        bandNames: () => serverList(image, physicalBands.map(({name}) => name)),
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
            ? {getImage$: () => of(imageFor(source.id, assetBands))}
            : {
                getBands$: () => of(recipeBands),
                getImage$: () => of(imageFor(source.id, recipePhysicalBands))
            }
    }
}))

const {default: bandsJob} = await import('#gee/jobs/ee/image/bands')
const {worker$} = bandsJob

const run = requestArgs => firstValueFrom(worker$({requestArgs}))

beforeEach(() => {
    assetBands = []
    recipeBands = []
    recipePhysicalBands = []
    factoryCalls.length = 0
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
        const evaluatedImage = getInfoCalls[0].value.image
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
