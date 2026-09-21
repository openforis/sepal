import {jest} from '@jest/globals'
import {lastValueFrom, of, throwError} from 'rxjs'

import {MAX_ASSET_PROPERTY_BYTES} from '#sepal/earthEngineAssetProperties'
import {ENCODING_PROPERTY, encodingFromProperties} from '#sepal/recipe/output/bandEncoding'
import {sliceOutputBands} from '#sepal/recipe/type/ccdcSlice'

// What an export leaves behind as Earth Engine asset metadata. Tiling, task submission and Earth Engine's own
// data API are substituted; the property assembly, the encoding representation and the property filtering that
// decides what reaches setAssetProperties are the real ones - the filter is where an oversized value is lost.

const COLLECTION = 'projects/p/assets/mosaic'
const REFLECTANCE = {scale: 0.0001, offset: 0, unit: '1'}
const THERMAL = {scale: 0.1, offset: 0, unit: 'K'}

const bytes = value => Buffer.byteLength(String(value), 'utf8')

// What version 1 wrote: the whole dictionary in one property.
const storedInline = bands => JSON.stringify({version: 1, bands})

describe('exporting a single image', () => {
    it('writes the export\'s own encoding over one the source image carries', async () => {
        await exportImage({
            image: sourceImage({[ENCODING_PROPERTY]: storedInline({red: THERMAL})}),
            bandEncoding: {red: REFLECTANCE}
        })

        expect(encodingOf(submittedImages()[0])).toEqual({red: REFLECTANCE})
    })

    it('states that nothing is known where the export establishes no encoding', async () => {
        await exportImage({
            image: sourceImage({[ENCODING_PROPERTY]: storedInline({red: THERMAL})}),
            bandEncoding: undefined
        })

        expect(encodingOf(submittedImages()[0])).toEqual({})
        expect(JSON.parse(submittedImages()[0][ENCODING_PROPERTY])).toEqual({version: 2, parts: 0})
    })

    // The submitter states the destination, never what the values mean: a part left among the submitted
    // properties would otherwise be written beside the export's own representation.
    it('writes no part of an encoding the submitted properties claim', async () => {
        await exportImage({
            bandEncoding: {red: REFLECTANCE},
            properties: {
                [ENCODING_PROPERTY]: JSON.stringify({version: 2, parts: 2}),
                sepal_band_encoding_2: JSON.stringify({thermal: THERMAL})
            }
        })

        const written = submittedImages()[0]
        expect(encodingOf(written)).toEqual({red: REFLECTANCE})
        expect(written.sepal_band_encoding_2).toBeUndefined()
    })

    it('removes every part of an encoding the source image carried that it does not replace', async () => {
        await exportImage({
            image: sourceImage({
                [ENCODING_PROPERTY]: JSON.stringify({version: 2, parts: 3}),
                sepal_band_encoding_1: JSON.stringify({red: THERMAL}),
                sepal_band_encoding_2: JSON.stringify({thermal: THERMAL}),
                sepal_band_encoding_3: JSON.stringify({nir: THERMAL})
            }),
            bandEncoding: {red: REFLECTANCE}
        })

        const written = submittedImages()[0]
        expect(encodingOf(written)).toEqual({red: REFLECTANCE})
        expect(JSON.parse(written[ENCODING_PROPERTY])).toEqual({version: 2, parts: 1})
        expect(written.sepal_band_encoding_2).toBe(removed)
        expect(written.sepal_band_encoding_3).toBe(removed)
    })
})

describe('exporting a new image collection', () => {
    it('describes the collection and every tile with the export\'s own encoding', async () => {
        await exportCollection({
            image: sourceImage({[ENCODING_PROPERTY]: storedInline({red: THERMAL})}),
            bandEncoding: {red: REFLECTANCE}
        })

        expect(encodingOf(collectionProperties())).toEqual({red: REFLECTANCE})
        expect(submittedImages().map(encodingOf)).toEqual([{red: REFLECTANCE}, {red: REFLECTANCE}])
    })

    it('publishes an explicitly unknown encoding rather than leaving an inherited one in place', async () => {
        await exportCollection({
            image: sourceImage({[ENCODING_PROPERTY]: storedInline({red: THERMAL})}),
            bandEncoding: {}
        })

        expect(JSON.parse(collectionProperties()[ENCODING_PROPERTY])).toEqual({version: 2, parts: 0})
        expect(encodingOf(collectionProperties())).toEqual({})
    })

    it('removes the parts of an encoding the source image carried, from the collection and from every tile', async () => {
        await exportCollection({
            image: sourceImage({
                [ENCODING_PROPERTY]: JSON.stringify({version: 2, parts: 2}),
                sepal_band_encoding_1: JSON.stringify({red: THERMAL}),
                sepal_band_encoding_2: JSON.stringify({thermal: THERMAL})
            }),
            bandEncoding: {red: REFLECTANCE}
        })

        const written = collectionProperties()
        expect(encodingOf(written)).toEqual({red: REFLECTANCE})
        expect(written.sepal_band_encoding_2).toBeUndefined()
        expect(submittedImages().map(encodingOf)).toEqual([{red: REFLECTANCE}, {red: REFLECTANCE}])
        submittedImages().forEach(tile => expect(tile.sepal_band_encoding_2).toBe(removed))
    })
})

// The encoding of an output with hundreds of bands takes more than one property. Nothing between here and the
// asset may drop one: a part missing from what is written makes the whole encoding unknown when it is read.
describe('exporting an output with hundreds of bands', () => {
    it('writes every part of the encoding to the collection and to each tile', async () => {
        const encoding = sliceShapedEncoding(24)

        await exportCollection({bandEncoding: encoding})

        const written = collectionProperties()
        expect(Object.keys(written).filter(isEncodingPart).length).toBeGreaterThan(1)
        expect(encodingOf(written)).toEqual(encoding)
        expect(submittedImages().map(encodingOf)).toEqual([encoding, encoding])
    })

    it('keeps a part larger than the retired 1,024 byte restriction', async () => {
        await exportCollection({bandEncoding: sliceShapedEncoding(24)})

        const parts = Object.entries(collectionProperties())
            .filter(([key]) => isEncodingPart(key))
            .map(([_key, value]) => bytes(value))
        expect(Math.max(...parts)).toBeGreaterThan(1024)
        expect(Math.max(...parts)).toBeLessThanOrEqual(MAX_ASSET_PROPERTY_BYTES)
    })
})

// The filter in front of setAssetProperties is what keeps a value Earth Engine would reject from taking the
// whole write down with it. Where it cuts decides what an asset can hold.
describe('what reaches the collection\'s properties', () => {
    it.each([
        ['a value of exactly the limit', 'x'.repeat(MAX_ASSET_PROPERTY_BYTES), true],
        ['the first value over it', 'x'.repeat(MAX_ASSET_PROPERTY_BYTES + 1), false],
        ['multibyte text of exactly the limit', 'é'.repeat(MAX_ASSET_PROPERTY_BYTES / 2), true],
        ['multibyte text one byte over it', `x${'é'.repeat(MAX_ASSET_PROPERTY_BYTES / 2)}`, false]
    ])('keeps %s: %#', async (_case, value, kept) => {
        await exportCollection({bandEncoding: {red: REFLECTANCE}, properties: {probe: value}})

        expect(collectionProperties().probe).toEqual(kept ? value : undefined)
    })

    it('keeps a value of 14,000 bytes, which the retired restriction would have dropped', async () => {
        const value = 'x'.repeat(14000)

        await exportCollection({bandEncoding: {red: REFLECTANCE}, properties: {probe: value}})

        expect(collectionProperties().probe).toEqual(value)
    })
})

describe('an encoding that cannot be represented', () => {
    const unrepresentable = () => ({[`b${'x'.repeat(MAX_ASSET_PROPERTY_BYTES)}`]: REFLECTANCE})

    it('refuses before creating, replacing or updating anything, naming the entry and the limit', async () => {
        existingCollection({})

        const exported = exportCollection({strategy: 'resume', bandEncoding: unrepresentable()})

        await expect(exported).rejects.toMatchObject({
            userMessage: {key: 'tasks.ee.export.asset.encodingTooLarge', args: {assetId: COLLECTION}}
        })
        expect(state.replacedProperties).toEqual([])
        expect(state.created).toEqual([])
        expect(state.deleted).toEqual([])
        expect(submittedImages()).toEqual([])
    })

    it('refuses a single image export before it is submitted', async () => {
        await expect(exportImage({bandEncoding: unrepresentable()})).rejects.toThrow(/does not fit an asset property/)
        expect(submittedImages()).toEqual([])
    })
})

describe('replacing an existing image collection', () => {
    it('writes the new encoding whatever the replaced collection held', async () => {
        existingCollection({[ENCODING_PROPERTY]: storedInline({red: THERMAL})})

        await exportCollection({strategy: 'replace', bandEncoding: {red: REFLECTANCE}})

        expect(encodingOf(collectionProperties())).toEqual({red: REFLECTANCE})
    })
})

describe('resuming an existing image collection', () => {
    const proposed = {red: REFLECTANCE, thermal: THERMAL}

    it('keeps an encoding the retained tiles were written with', async () => {
        existingCollection({[ENCODING_PROPERTY]: storedInline({
            red: {scale: 0.0001, unit: '1'},
            thermal: THERMAL
        })})

        await exportCollection({strategy: 'resume', bandEncoding: proposed})

        expect(encodingOf(collectionProperties())).toEqual({red: REFLECTANCE, thermal: THERMAL})
    })

    it('recognises the same facts however the collection stored them', async () => {
        existingCollection(currentFormat(proposed))

        await exportCollection({strategy: 'resume', bandEncoding: proposed})

        expect(encodingOf(collectionProperties())).toEqual(proposed)
    })

    it('exports only the tiles that are missing', async () => {
        existingCollection({[ENCODING_PROPERTY]: storedInline({red: REFLECTANCE, thermal: THERMAL})}, {retainedTiles: [0]})

        await exportCollection({strategy: 'resume', bandEncoding: proposed})

        expect(submittedImages().map(({assetId}) => assetId)).toEqual([`${COLLECTION}/1`])
    })

    it.each([
        ['scale', {...THERMAL, scale: 0.01}],
        ['offset', {...THERMAL, offset: -273.15}],
        ['unit', {...THERMAL, unit: 'Cel'}]
    ])('refuses a contradicting %s before changing the collection or submitting a tile', async (_fact, thermal) => {
        existingCollection({[ENCODING_PROPERTY]: storedInline({red: REFLECTANCE, thermal})})

        const exported = exportCollection({strategy: 'resume', bandEncoding: proposed})

        await expect(exported).rejects.toMatchObject({
            userMessage: {key: 'tasks.ee.export.asset.encodingConflict', args: {assetId: COLLECTION}}
        })
        expect(state.replacedProperties).toEqual([])
        expect(submittedImages()).toEqual([])
    })

    it('refuses a contradiction stored in parts as readily as one stored inline', async () => {
        existingCollection(currentFormat({red: REFLECTANCE, thermal: {...THERMAL, scale: 0.01}}))

        await expect(exportCollection({strategy: 'resume', bandEncoding: proposed})).rejects.toMatchObject({
            userMessage: {key: 'tasks.ee.export.asset.encodingConflict'}
        })
    })

    it('refuses a contradiction on one band even where the rest is incomplete', async () => {
        existingCollection({[ENCODING_PROPERTY]: storedInline({thermal: REFLECTANCE})})

        await expect(exportCollection({strategy: 'resume', bandEncoding: proposed})).rejects.toMatchObject({
            userMessage: {key: 'tasks.ee.export.asset.encodingConflict'}
        })
    })

    // A collection resumed as unknown before must stay resumable.
    it.each([
        ['has no encoding metadata', {}],
        ['is explicitly unknown', {[ENCODING_PROPERTY]: storedInline({})}],
        ['describes only some of the bands', {[ENCODING_PROPERTY]: storedInline({red: REFLECTANCE})}],
        ['states no unit for a band', {[ENCODING_PROPERTY]: storedInline({red: {scale: 0.0001}, thermal: THERMAL})}],
        ['holds an unsupported version', {[ENCODING_PROPERTY]: JSON.stringify({version: 9, bands: {red: THERMAL}})}],
        ['is missing a part it names', {[ENCODING_PROPERTY]: JSON.stringify({version: 2, parts: 2}), sepal_band_encoding_1: JSON.stringify({red: REFLECTANCE})}]
    ])('resumes as unknown when the collection %s', async (_case, properties) => {
        existingCollection(properties)

        await exportCollection({strategy: 'resume', bandEncoding: proposed})

        expect(JSON.parse(collectionProperties()[ENCODING_PROPERTY])).toEqual({version: 2, parts: 0})
        expect(submittedImages()).not.toEqual([])
    })

    // The collection cannot describe a mix of tiles, but each tile describes itself.
    it('writes the proposed encoding on the tiles it exports, where the collection states none', async () => {
        existingCollection({[ENCODING_PROPERTY]: storedInline({red: REFLECTANCE})})

        await exportCollection({strategy: 'resume', bandEncoding: proposed})

        expect(encodingOf(collectionProperties())).toEqual({})
        expect(submittedImages().map(encodingOf)).toEqual([proposed, proposed])
    })

    // A resumed collection keeps its tiles, and a tile states its own encoding. The collection's metadata cannot
    // answer for them: it is written by whichever run went last, and may state nothing at all.
    describe('against the tiles it would retain', () => {
        it('refuses one that contradicts this export, though the collection states nothing', async () => {
            existingCollection({[ENCODING_PROPERTY]: storedInline({})})
            retainedTile(0, currentFormat({red: {...REFLECTANCE, scale: 0.1}}))

            await expect(exportCollection({strategy: 'resume', bandEncoding: {red: REFLECTANCE}})).rejects.toMatchObject({
                userMessage: {key: 'tasks.ee.export.asset.encodingConflict', args: {assetId: COLLECTION}}
            })
            expect(state.replacedProperties).toEqual([])
            expect(submittedImages()).toEqual([])
        })

        // The first tile is missing, so the conflict is only found once the second is read. Nothing may have been
        // written or submitted by then.
        it('refuses one found after a missing tile, submitting neither', async () => {
            existingCollection({})
            retainedTile(1, currentFormat({red: THERMAL}))

            await expect(exportCollection({strategy: 'resume', bandEncoding: {red: REFLECTANCE}})).rejects.toMatchObject({
                userMessage: {key: 'tasks.ee.export.asset.encodingConflict'}
            })
            expect(state.replacedProperties).toEqual([])
            expect(submittedImages()).toEqual([])
        })

        it('exports the tiles that are missing when the retained ones agree', async () => {
            existingCollection(currentFormat({red: REFLECTANCE}))
            retainedTile(0, currentFormat({red: REFLECTANCE}))

            await exportCollection({strategy: 'resume', bandEncoding: {red: REFLECTANCE}})

            expect(submittedImages().map(({assetId}) => assetId)).toEqual([`${COLLECTION}/1`])
            expect(encodingOf(collectionProperties())).toEqual({red: REFLECTANCE})
        })

        it('resumes as unknown where a retained tile states nothing', async () => {
            existingCollection({[ENCODING_PROPERTY]: storedInline({})})
            retainedTile(0)

            await exportCollection({strategy: 'resume', bandEncoding: {red: REFLECTANCE}})

            expect(JSON.parse(collectionProperties()[ENCODING_PROPERTY])).toEqual({version: 2, parts: 0})
            expect(submittedImages().map(({assetId}) => assetId)).toEqual([`${COLLECTION}/1`])
        })

        // Tiles agreeing among themselves say nothing about the tiles this run never read.
        it('states no collection encoding merely because a retained tile agrees', async () => {
            existingCollection({[ENCODING_PROPERTY]: storedInline({})})
            retainedTile(0, currentFormat({red: REFLECTANCE}))

            await exportCollection({strategy: 'resume', bandEncoding: {red: REFLECTANCE}})

            expect(encodingOf(collectionProperties())).toEqual({})
        })
    })

    describe('with bands named like object members', () => {
        const proposedForMembers = {constructor: REFLECTANCE, toString: THERMAL}

        it.each([
            ['has no encoding metadata', {}],
            ['describes only one of them', {[ENCODING_PROPERTY]: storedInline({toString: THERMAL})}]
        ])('resumes as unknown when the collection %s', async (_case, properties) => {
            existingCollection(properties)

            await exportCollection({strategy: 'resume', bandEncoding: proposedForMembers})

            expect(JSON.parse(collectionProperties()[ENCODING_PROPERTY])).toEqual({version: 2, parts: 0})
        })

        it('keeps an encoding the collection states for them', async () => {
            existingCollection({[ENCODING_PROPERTY]: storedInline({constructor: REFLECTANCE, toString: THERMAL})})

            await exportCollection({strategy: 'resume', bandEncoding: proposedForMembers})

            expect(encodingOf(collectionProperties())).toEqual(proposedForMembers)
        })
    })
})

const encodingOf = properties => encodingFromProperties(properties)

const isEncodingPart = key => /^sepal_band_encoding_\d+$/.test(key)

const collectionProperties = () => {
    expect(state.replacedProperties).toHaveLength(1)
    return state.replacedProperties[0].properties
}

const submittedImages = () => state.submitted.map(({image, assetId}) => ({...image.properties, assetId}))

// The bands a slice of 24 measures produces, with a fixture encoding on the measure-derived ones: 293 bands,
// more encoding than one property holds. CCDC Slice declares no encoding of its own.
const sliceShapedEncoding = measures => {
    const base = Array.from({length: measures}, (_value, index) => `measure_${index + 1}`)
    const physical = ['tStart', 'tEnd', 'tBreak', 'numObs', 'changeProb', ...base.map(name => `${name}_coefs`)]
    const model = {date: {dateType: 'SINGLE'}, options: {gapStrategy: 'INTERPOLATE', harmonics: 3}}
    return Object.fromEntries(
        sliceOutputBands(physical, model)
            .filter(name => base.some(measure => name.startsWith(measure)))
            .map(name => [name, REFLECTANCE])
    )
}

const state = {}

const resetState = () => {
    state.assets = {}
    state.replacedProperties = []
    state.submitted = []
    state.created = []
    state.deleted = []
}

// set() replaces the properties it names and keeps the rest, as Earth Engine's does, so a property this export
// does not name survives on the exported image. toDictionary() answers only the keys it was asked for.
const sourceImage = (properties = {}) => ({
    properties,
    set: added => sourceImage({...properties, ...added}),
    toDictionary: keys => ({
        evaluate: 'imageProperties',
        properties: keys
            ? Object.fromEntries(keys.filter(key => key in properties).map(key => [key, properties[key]]))
            : properties
    })
})

// A property named for removal: Earth Engine keeps what is not named, so an obsolete part has to be set to null.
const removed = null

const existingCollection = (properties, {retainedTiles = []} = {}) => {
    state.assets[COLLECTION] = {type: 'ImageCollection', properties}
    retainedTiles.forEach(index => retainedTile(index))
}

const retainedTile = (index, properties = {}) =>
    state.assets[`${COLLECTION}/${index}`] = {type: 'Image', properties}

// Properties as this release writes them, for a collection an earlier run of the same export left behind.
const currentFormat = encoding => Object.fromEntries(
    Object.entries(encoding).map(([name, band], index) => [`sepal_band_encoding_${index + 1}`, JSON.stringify({[name]: band})])
        .concat([[ENCODING_PROPERTY, JSON.stringify({version: 2, parts: Object.keys(encoding).length})]])
)

jest.unstable_mockModule('#sepal/log', () => ({
    getLogger: () => ({trace: () => {}, debug: () => {}, info: () => {}, warn: () => {}, error: () => {}})
}))
jest.unstable_mockModule('#sepal/ee/eeLimiterService', () => ({eeLimiter$: operation$ => operation$}))

// The real property writer, over Earth Engine's own low-level calls. Substituting the writer itself would hide
// what it filters out, which is the whole point of this boundary.
const {default: eeExtensions} = await import('#sepal/ee/extensions/utils')

const {replaceAssetProperties$} = eeExtensions({
    data: {
        getAsset: (assetId, callback) => state.assets[assetId]
            ? callback(state.assets[assetId])
            : callback(null, `Asset not found: ${assetId}`),
        setAssetProperties: (assetId, properties, callback) => {
            state.replacedProperties.push({assetId, properties})
            callback(true)
        }
    }
})

const ee = {
    sepal: {getAuthType: () => 'USER'},
    data: {ExportDestination: {ASSET: 'ASSET'}, ExportType: {IMAGE: 'IMAGE'}},
    batch: {
        Export: {convertToServerParams: config => config},
        ExportTask: {create: config => config}
    },
    Feature: geometry => ({geometry}),
    FeatureCollection: features => ({features}),
    Filter: {eq: () => ({})},
    Geometry: geometry => geometry,
    getAsset$: id => state.assets[id]
        ? of(state.assets[id])
        : throwError(() => new Error(`Asset not found: ${id}`)),
    createParentFolder$: () => of(true),
    createImageCollection$: assetId => {
        state.created.push(assetId)
        state.assets[assetId] = {type: 'ImageCollection', properties: {}}
        return of(true)
    },
    deleteAssetRecursive$: assetId => {
        state.deleted.push(assetId)
        delete state.assets[assetId]
        return of(true)
    },
    replaceAssetProperties$,
    getInfo$: value => of(
        value?.evaluate === 'imageProperties' ? value.properties
            : value?.evaluate === 'tileIds' ? ['tile-0', 'tile-1']
                : value
    )
}

jest.unstable_mockModule('#sepal/ee/ee', () => ({default: ee}))
jest.unstable_mockModule('#sepal/ee/tile', () => ({
    default: () => ({
        aggregate_array: () => ({evaluate: 'tileIds'}),
        filter: () => ({geometry: () => region})
    })
}))
jest.unstable_mockModule('#task/ee/task', () => ({
    task$: (_taskId, task) => {
        state.submitted.push(task)
        return of(true)
    }
}))
jest.unstable_mockModule('#task/jobs/service/exportLimiter', () => ({exportLimiter$: export$ => export$}))

const {exportImageToAsset$} = await import('./toAsset.js')

const region = {bounds: () => ({type: 'Polygon'})}

const exportImage = ({image = sourceImage(), bandEncoding, properties = {}}) => lastValueFrom(
    exportImageToAsset$('task-1', {
        image,
        description: 'mosaic',
        assetId: COLLECTION,
        region,
        scale: 30,
        properties: {recipe_id: 'mosaic-1', ...properties},
        bandEncoding
    }),
    {defaultValue: null}
)

const exportCollection = ({image = sourceImage(), strategy, bandEncoding, properties = {}}) => lastValueFrom(
    exportImageToAsset$('task-1', {
        image,
        description: 'mosaic',
        assetId: COLLECTION,
        assetType: 'ImageCollection',
        strategy,
        region,
        scale: 30,
        tileSize: 2,
        properties: {recipe_id: 'mosaic-1', ...properties},
        bandEncoding
    }),
    {defaultValue: null}
)

beforeEach(resetState)
