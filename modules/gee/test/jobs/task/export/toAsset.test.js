import {jest} from '@jest/globals'
import {lastValueFrom, of} from 'rxjs'

import {MAX_ASSET_PROPERTY_BYTES} from '#sepal/earthEngineAssetProperties'
import {ENCODING_PROPERTY, encodingFromProperties} from '#sepal/recipe/output/bandEncoding'

// What a single-image asset export submits. Earth Engine's data API and the export start are substituted; the
// property assembly and the encoding representation are the real ones.

const ASSET = 'projects/p/assets/mosaic'
const REFLECTANCE = {scale: 0.0001, offset: 0, unit: '1'}
const THERMAL = {scale: 0.1, offset: 0, unit: 'K'}
const storedInline = bands => JSON.stringify({version: 1, bands})
const removed = null

const state = {}

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

const ee = {
    data: {ExportDestination: {ASSET: 'ASSET'}, ExportType: {IMAGE: 'IMAGE'}},
    batch: {
        Export: {convertToServerParams: config => config},
        ExportTask: {create: config => config}
    },
    Geometry: geometry => geometry,
    createParentFolder$: () => of(true),
    deleteAssetRecursive$: assetId => {
        state.deleted.push(assetId)
        return of(true)
    },
    getInfo$: value => of(value?.evaluate === 'imageProperties' ? value.properties : value),
    startImageExport$: task => {
        state.submitted.push(task)
        return of('T1')
    }
}

jest.unstable_mockModule('#sepal/ee/ee', () => ({default: ee}))

const {inEEContext} = await import('#sepal/ee/eeContext')
const {startImageToAssetExport$} = await import('#gee/jobs/task/export/toAsset')

const USER = {requestId: 'r-1', username: 'alice', origin: 'task', auth: {type: 'user'}, projectId: 'p', workloadTag: 'sepal-task-mosaic', endpoint: 'https://ee'}
const SERVICE_ACCOUNT = {...USER, auth: {type: 'serviceAccount'}}
const region = {bounds: () => ({type: 'Polygon'})}

const exportImage = ({image = sourceImage(), bandEncoding, properties = {}, strategy, context = USER}) => lastValueFrom(
    inEEContext(context, startImageToAssetExport$({
        image,
        description: 'mosaic',
        assetId: ASSET,
        strategy,
        region,
        scale: 30,
        properties: {recipe_id: 'mosaic-1', ...properties},
        bandEncoding
    }))
)

const submittedImage = () => state.submitted[0].image.properties
const encodingOf = properties => encodingFromProperties(properties)

beforeEach(() => {
    state.submitted = []
    state.deleted = []
})

describe('exporting a single image', () => {
    it('answers the Earth Engine task it started and the asset it writes', async () => {
        expect(await exportImage({bandEncoding: {red: REFLECTANCE}})).toEqual({eeTaskId: 'T1', assetId: ASSET})
    })

    it('writes the export\'s own encoding over one the source image carries', async () => {
        await exportImage({image: sourceImage({[ENCODING_PROPERTY]: storedInline({red: THERMAL})}), bandEncoding: {red: REFLECTANCE}})

        expect(encodingOf(submittedImage())).toEqual({red: REFLECTANCE})
    })

    it('states that nothing is known where the export establishes no encoding', async () => {
        await exportImage({image: sourceImage({[ENCODING_PROPERTY]: storedInline({red: THERMAL})}), bandEncoding: undefined})

        expect(encodingOf(submittedImage())).toEqual({})
        expect(JSON.parse(submittedImage()[ENCODING_PROPERTY])).toEqual({version: 2, parts: 0})
    })

    it('writes no part of an encoding the submitted properties claim', async () => {
        await exportImage({
            bandEncoding: {red: REFLECTANCE},
            properties: {
                [ENCODING_PROPERTY]: JSON.stringify({version: 2, parts: 2}),
                sepal_band_encoding_2: JSON.stringify({thermal: THERMAL})
            }
        })

        expect(encodingOf(submittedImage())).toEqual({red: REFLECTANCE})
        expect(submittedImage().sepal_band_encoding_2).toBeUndefined()
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

        expect(encodingOf(submittedImage())).toEqual({red: REFLECTANCE})
        expect(submittedImage().sepal_band_encoding_2).toBe(removed)
        expect(submittedImage().sepal_band_encoding_3).toBe(removed)
    })

    it('submits the default projection, pixel limit and shard size where the export names none', async () => {
        await exportImage({bandEncoding: {}})

        expect(state.submitted[0]).toMatchObject({crs: 'EPSG:4326', maxPixels: 1e13, shardSize: 256})
        expect(state.submitted[0].crsTransform).toBeUndefined()
    })

    it('deletes the existing asset before starting, when replacing', async () => {
        await exportImage({bandEncoding: {}, strategy: 'replace'})

        expect(state.deleted).toEqual([ASSET])
        expect(state.submitted).toHaveLength(1)
    })

    it('is refused for a user without a Google account, before anything is submitted', async () => {
        await expect(exportImage({bandEncoding: {}, context: SERVICE_ACCOUNT})).rejects.toThrow(/service account/)
        expect(state.submitted).toEqual([])
    })

    it('is refused for an image collection, which is exported tile by tile', async () => {
        await expect(lastValueFrom(inEEContext(USER, startImageToAssetExport$({
            image: sourceImage(), description: 'mosaic', assetId: ASSET, assetType: 'ImageCollection', region, scale: 30, properties: {}
        })))).rejects.toThrow(/ImageCollection/)
        expect(state.submitted).toEqual([])
    })

    it('refuses an encoding that cannot be stored, before anything is submitted', async () => {
        const unrepresentable = {[`b${'x'.repeat(MAX_ASSET_PROPERTY_BYTES)}`]: REFLECTANCE}

        await expect(exportImage({bandEncoding: unrepresentable})).rejects.toMatchObject({
            userMessage: {key: 'tasks.ee.export.asset.encodingTooLarge', args: {assetId: ASSET}}
        })
        expect(state.submitted).toEqual([])
    })
})
