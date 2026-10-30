import assert from 'node:assert/strict'
import {beforeEach, describe, it, mock} from 'node:test'

import {lastValueFrom, of, throwError} from 'rxjs'

import {MAX_ASSET_PROPERTY_BYTES} from '#sepal/earthEngineAssetProperties'
import {ENCODING_PROPERTY, encodingFromProperties} from '#sepal/recipe/output/bandEncoding'
import {sliceOutputBands} from '#sepal/recipe/type/ccdcSlice'
import {assertMatches} from '#sepal/testSupport/assert'

// What an image collection export leaves behind as Earth Engine asset metadata: the collection prepared first,
// then the tiles a resume does not keep, each started on its own. Tiling, the export start and Earth Engine's own
// data API are substituted; the property assembly, the encoding representation and the property filtering that
// decides what reaches setAssetProperties are the real ones - the filter is where an oversized value is lost.

const COLLECTION = 'projects/p/assets/mosaic'
const REFLECTANCE = {scale: 0.0001, offset: 0, unit: '1'}
const THERMAL = {scale: 0.1, offset: 0, unit: 'K'}

const bytes = value => Buffer.byteLength(String(value), 'utf8')

// Substituted before the specs: node:test starts running them at the first await that follows them.
const state = {}

const resetState = () => {
    state.assets = {}
    state.replacedProperties = []
    state.submitted = []
    state.created = []
    state.deleted = []
    state.readErrors = {}
    state.listError = null
    state.paged = false
    state.parentFolders = []
    state.recordReads = []
    state.listReads = []
    state.presenceQueries = []
    state.presenceError = null
}

mock.module('#sepal/log', {
    exports: {
        getLogger: () => ({trace: () => {}, debug: () => {}, info: () => {}, warn: () => {}, error: () => {}})
    }
})
mock.module('#sepal/ee/eeLimiterService', {
    exports: {
        eeLimiter$: operation$ => operation$
    }
})

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
            state.assets[assetId].properties = Object.fromEntries(Object.entries(properties).filter(([_key, value]) => value !== undefined))
            callback(true)
        }
    }
})

const ee = {
    data: {ExportDestination: {ASSET: 'ASSET'}, ExportType: {IMAGE: 'IMAGE'}},
    batch: {
        Export: {convertToServerParams: config => config},
        ExportTask: {create: config => config}
    },
    Feature: geometry => ({geometry}),
    FeatureCollection: features => ({features}),
    Filter: {eq: (name, value) => ({name, value})},
    ImageCollection: parent => ({filter: filter => ({limit: () => ({size: () => ({evaluate: 'destinationPresence', parent, filter})})})}),
    Geometry: geometry => geometry,
    Dictionary: value => value,
    getAssetRecord$: id => {
        state.recordReads.push(id)
        return state.readErrors[id] ? throwError(() => state.readErrors[id])
            : state.assets[id] ? of(state.assets[id]) : throwError(() => Object.assign(new Error('Not visible'), {eeStatusCode: 404}))
    },
    listAssetsPage$: (parent, token) => {
        state.listReads.push({parent, token})
        if (state.listError) {
            return throwError(() => state.listError)
        }
        const assets = Object.keys(state.assets).filter(id => id.startsWith(`${parent}/`) && !id.slice(parent.length + 1).includes('/')).map(name => ({name}))
        return of(state.paged && parent === COLLECTION
            ? token ? {assets: assets.slice(1)} : {assets: assets.slice(0, 1), nextPageToken: 'page-2'}
            : {assets})
    },
    getAsset$: id => state.assets[id]
        ? of(state.assets[id])
        : throwError(() => new Error(`Asset not found: ${id}`)),
    createParentFolder$: id => { state.parentFolders.push(id); return of(true) },
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
    getInfo$: value => {
        if (value?.evaluate === 'destinationPresence') {
            state.presenceQueries.push(value)
            if (state.presenceError) {
                return throwError(() => state.presenceError)
            }
            assert.equal(value.filter.name, 'system:index')
            return of(state.assets[`${value.parent}/${value.filter.value}`] ? 1 : 0)
        }
        return of(value?.evaluate === 'imageProperties' ? value.properties
            : value?.evaluate === 'tileIds' ? ['tile-0', 'tile-1'] : value)
    },
    startImageExport$: task => {
        state.submitted.push(task)
        return of('T1')
    }
}

mock.module('#sepal/ee/ee', {
    exports: {
        default: ee
    }
})
mock.module('#sepal/ee/tile', {
    exports: {
        default: () => ({
            aggregate_array: () => ({evaluate: 'tileIds'}),
            filter: () => ({geometry: () => region})
        })
    }
})

const {inEEContext} = await import('#sepal/ee/eeContext')
const {prepareImageCollection$, startCollectionTileExport$} = await import('#gee/jobs/task/export/toAsset')
const {readExportAsset$} = await import('#gee/jobs/task/export/regressionCompatibility')

// What version 1 wrote: the whole dictionary in one property.
const storedInline = bands => JSON.stringify({version: 1, bands})

describe('exporting a new image collection', () => {
    it('describes the collection and every tile with the export\'s own encoding', async () => {
        await exportCollection({
            image: sourceImage({[ENCODING_PROPERTY]: storedInline({red: THERMAL})}),
            bandEncoding: {red: REFLECTANCE}
        })

        assert.deepEqual(encodingOf(collectionProperties()), {red: REFLECTANCE})
        assert.deepEqual(
            submittedImages().map(encodingOf),
            [{red: REFLECTANCE}, {red: REFLECTANCE}]
        )
    })

    it('publishes an explicitly unknown encoding rather than leaving an inherited one in place', async () => {
        await exportCollection({
            image: sourceImage({[ENCODING_PROPERTY]: storedInline({red: THERMAL})}),
            bandEncoding: {}
        })

        assert.deepEqual(
            JSON.parse(collectionProperties()[ENCODING_PROPERTY]),
            {version: 2, parts: 0}
        )
        assert.deepEqual(encodingOf(collectionProperties()), {})
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
        assert.deepEqual(encodingOf(written), {red: REFLECTANCE})
        assert.equal(written.sepal_band_encoding_2, undefined)
        assert.deepEqual(
            submittedImages().map(encodingOf),
            [{red: REFLECTANCE}, {red: REFLECTANCE}]
        )
        submittedImages().forEach(tile => assert.equal(tile.sepal_band_encoding_2, removed))
    })

    it('creates the collection and answers every tile, none of them retained', async () => {
        const prepared = await prepare({bandEncoding: {red: REFLECTANCE}})

        assert.deepEqual(prepared, {
            assetId: COLLECTION,
            tiles: [{tileIndex: 0, tileId: 'tile-0', retained: false}, {tileIndex: 1, tileId: 'tile-1', retained: false}]
        })
        assert.deepEqual(state.created, [COLLECTION])
    })

    it('starts a tile as its own image in the collection, answering the Earth Engine task', async () => {
        const started = await exportTile({bandEncoding: {red: REFLECTANCE}}, {tileIndex: 1, tileId: 'tile-1'})

        assert.deepEqual(started, {eeTaskId: 'T1'})
        assertMatches(state.submitted, [{description: 'mosaic_1', assetId: `${COLLECTION}/1`}])
    })

    it('starts a tile with the default projection, pixel limit and shard size, deleting nothing even when replacing', async () => {
        await exportTile({bandEncoding: {}, strategy: 'replace'}, {tileIndex: 1, tileId: 'tile-1'})

        assert.partialDeepStrictEqual(state.submitted[0], {crs: 'EPSG:4326', maxPixels: 1e13, shardSize: 256})
        assert.equal(state.submitted[0].crsTransform, undefined)
        assert.deepEqual(state.deleted, [])
    })

    it('is refused for a user without a Google account, before anything is created', async () => {
        await assert.rejects(prepare({bandEncoding: {}, context: SERVICE_ACCOUNT}), /service account/)
        await assert.rejects(
            exportTile({bandEncoding: {}, context: SERVICE_ACCOUNT}, {tileIndex: 0, tileId: 'tile-0'}),
            /service account/
        )
        assert.deepEqual(state.created, [])
        assert.deepEqual(state.submitted, [])
    })
})

// The encoding of an output with hundreds of bands takes more than one property. Nothing between here and the
// asset may drop one: a part missing from what is written makes the whole encoding unknown when it is read.
describe('exporting an output with hundreds of bands', () => {
    it('writes every part of the encoding to the collection and to each tile', async () => {
        const encoding = sliceShapedEncoding(24)

        await exportCollection({bandEncoding: encoding})

        const written = collectionProperties()
        assert.ok(Object.keys(written).filter(isEncodingPart).length > 1)
        assert.deepEqual(encodingOf(written), encoding)
        assert.deepEqual(submittedImages().map(encodingOf), [encoding, encoding])
    })

    it('keeps a part larger than the retired 1,024 byte restriction', async () => {
        await exportCollection({bandEncoding: sliceShapedEncoding(24)})

        const parts = Object.entries(collectionProperties())
            .filter(([key]) => isEncodingPart(key))
            .map(([_key, value]) => bytes(value))
        assert.ok(Math.max(...parts) > 1024)
        assert.ok(Math.max(...parts) <= MAX_ASSET_PROPERTY_BYTES)
    })
})

// The filter in front of setAssetProperties is what keeps a value Earth Engine would reject from taking the
// whole write down with it. Where it cuts decides what an asset can hold.
describe('what reaches the collection\'s properties', () => {
    for (const [scenario, value, kept] of [
        ['a value of exactly the limit', 'x'.repeat(MAX_ASSET_PROPERTY_BYTES), true],
        ['the first value over it', 'x'.repeat(MAX_ASSET_PROPERTY_BYTES + 1), false],
        ['multibyte text of exactly the limit', 'é'.repeat(MAX_ASSET_PROPERTY_BYTES / 2), true],
        ['multibyte text one byte over it', `x${'é'.repeat(MAX_ASSET_PROPERTY_BYTES / 2)}`, false]
    ]) {
        it(`${kept ? 'keeps' : 'drops'} ${scenario}`, async () => {
            await exportCollection({bandEncoding: {red: REFLECTANCE}, properties: {probe: value}})

            assert.deepEqual(collectionProperties().probe, kept ? value : undefined)
        })
    }

    it('keeps a value of 14,000 bytes, which the retired restriction would have dropped', async () => {
        const value = 'x'.repeat(14000)

        await exportCollection({bandEncoding: {red: REFLECTANCE}, properties: {probe: value}})

        assert.deepEqual(collectionProperties().probe, value)
    })
})

describe('an encoding that cannot be represented', () => {
    const unrepresentable = () => ({[`b${'x'.repeat(MAX_ASSET_PROPERTY_BYTES)}`]: REFLECTANCE})

    it('refuses before creating, replacing or updating anything, naming the entry and the limit', async () => {
        existingCollection({})

        const exported = exportCollection({strategy: 'resume', bandEncoding: unrepresentable()})

        await assert.rejects(exported, error => {
            assertMatches(error, {
                userMessage: {key: 'tasks.ee.export.asset.encodingTooLarge', args: {assetId: COLLECTION}}
            })
            return true
        })
        assert.deepEqual(state.replacedProperties, [])
        assert.deepEqual(state.created, [])
        assert.deepEqual(state.deleted, [])
        assert.deepEqual(submittedImages(), [])
    })
})

describe('replacing an existing image collection', () => {
    it('writes the new encoding whatever the replaced collection held', async () => {
        existingCollection({[ENCODING_PROPERTY]: storedInline({red: THERMAL})})

        await exportCollection({strategy: 'replace', bandEncoding: {red: REFLECTANCE}})

        assert.deepEqual(encodingOf(collectionProperties()), {red: REFLECTANCE})
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

        assert.deepEqual(encodingOf(collectionProperties()), {red: REFLECTANCE, thermal: THERMAL})
    })

    it('recognises the same facts however the collection stored them', async () => {
        existingCollection(currentFormat(proposed))

        await exportCollection({strategy: 'resume', bandEncoding: proposed})

        assert.deepEqual(encodingOf(collectionProperties()), proposed)
    })

    it('exports only the tiles that are missing', async () => {
        existingCollection({[ENCODING_PROPERTY]: storedInline({red: REFLECTANCE, thermal: THERMAL})}, {retainedTiles: [0]})

        await exportCollection({strategy: 'resume', bandEncoding: proposed})

        assert.deepEqual(submittedImages().map(({assetId}) => assetId), [`${COLLECTION}/1`])
    })

    it('reports which tiles a resume keeps, so only the missing ones are exported', async () => {
        existingCollection(currentFormat({red: REFLECTANCE}), {retainedTiles: [0]})

        const {tiles} = await prepare({strategy: 'resume', bandEncoding: {red: REFLECTANCE}})

        assert.deepEqual(
            tiles,
            [{tileIndex: 0, tileId: 'tile-0', retained: true}, {tileIndex: 1, tileId: 'tile-1', retained: false}]
        )
    })

    for (const [fact, thermal] of [
        ['scale', {...THERMAL, scale: 0.01}],
        ['offset', {...THERMAL, offset: -273.15}],
        ['unit', {...THERMAL, unit: 'Cel'}]
    ]) {
        it(
            `refuses a contradicting ${fact} before changing the collection or submitting a tile`,
            async () => {
                existingCollection({[ENCODING_PROPERTY]: storedInline({red: REFLECTANCE, thermal})})

                const exported = exportCollection({strategy: 'resume', bandEncoding: proposed})

                await assert.rejects(exported, error => {
                    assertMatches(error, {
                        userMessage: {key: 'tasks.ee.export.asset.encodingConflict', args: {assetId: COLLECTION}}
                    })

                    return true
                })
                assert.deepEqual(state.replacedProperties, [])
                assert.deepEqual(submittedImages(), [])
            }
        )
    }

    it('refuses a contradiction stored in parts as readily as one stored inline', async () => {
        existingCollection(currentFormat({red: REFLECTANCE, thermal: {...THERMAL, scale: 0.01}}))

        await assert.rejects(exportCollection({strategy: 'resume', bandEncoding: proposed}), error => {
            assertMatches(error, {
                userMessage: {key: 'tasks.ee.export.asset.encodingConflict'}
            })

            return true
        })
    })

    it('refuses a contradiction on one band even where the rest is incomplete', async () => {
        existingCollection({[ENCODING_PROPERTY]: storedInline({thermal: REFLECTANCE})})

        await assert.rejects(exportCollection({strategy: 'resume', bandEncoding: proposed}), error => {
            assertMatches(error, {
                userMessage: {key: 'tasks.ee.export.asset.encodingConflict'}
            })

            return true
        })
    })

    // A collection resumed as unknown before must stay resumable.
    for (const [caseName, properties] of [
        ['has no encoding metadata', {}],
        ['is explicitly unknown', {[ENCODING_PROPERTY]: storedInline({})}],
        ['describes only some of the bands', {[ENCODING_PROPERTY]: storedInline({red: REFLECTANCE})}],
        ['states no unit for a band', {[ENCODING_PROPERTY]: storedInline({red: {scale: 0.0001}, thermal: THERMAL})}],
        ['holds an unsupported version', {[ENCODING_PROPERTY]: JSON.stringify({version: 9, bands: {red: THERMAL}})}],
        ['is missing a part it names', {[ENCODING_PROPERTY]: JSON.stringify({version: 2, parts: 2}), sepal_band_encoding_1: JSON.stringify({red: REFLECTANCE})}]
    ]) {
        it(`resumes as unknown when the collection ${caseName}`, async () => {
            existingCollection(properties)

            await exportCollection({strategy: 'resume', bandEncoding: proposed})

            assert.deepEqual(
                JSON.parse(collectionProperties()[ENCODING_PROPERTY]),
                {version: 2, parts: 0}
            )
            assert.notDeepEqual(submittedImages(), [])
        })
    }

    // The collection cannot describe a mix of tiles, but each tile describes itself.
    it('writes the proposed encoding on the tiles it exports, where the collection states none', async () => {
        existingCollection({[ENCODING_PROPERTY]: storedInline({red: REFLECTANCE})})

        await exportCollection({strategy: 'resume', bandEncoding: proposed})

        assert.deepEqual(encodingOf(collectionProperties()), {})
        assert.deepEqual(submittedImages().map(encodingOf), [proposed, proposed])
    })

    // A resumed collection keeps its tiles, and a tile states its own encoding. The collection's metadata cannot
    // answer for them: it is written by whichever run went last, and may state nothing at all.
    describe('against the tiles it would retain', () => {
        it('refuses one that contradicts this export, though the collection states nothing', async () => {
            existingCollection({[ENCODING_PROPERTY]: storedInline({})})
            retainedTile(0, currentFormat({red: {...REFLECTANCE, scale: 0.1}}))

            await assert.rejects(
                exportCollection({strategy: 'resume', bandEncoding: {red: REFLECTANCE}}),
                error => {
                    assertMatches(error, {
                        userMessage: {key: 'tasks.ee.export.asset.encodingConflict', args: {assetId: COLLECTION}}
                    })

                    return true
                }
            )
            assert.deepEqual(state.replacedProperties, [])
            assert.deepEqual(submittedImages(), [])
        })

        // The first tile is missing, so the conflict is only found once the second is read. Nothing may have been
        // written or submitted by then.
        it('refuses one found after a missing tile, submitting neither', async () => {
            existingCollection({})
            retainedTile(1, currentFormat({red: THERMAL}))

            await assert.rejects(
                exportCollection({strategy: 'resume', bandEncoding: {red: REFLECTANCE}}),
                error => {
                    assertMatches(error, {
                        userMessage: {key: 'tasks.ee.export.asset.encodingConflict'}
                    })

                    return true
                }
            )
            assert.deepEqual(state.replacedProperties, [])
            assert.deepEqual(submittedImages(), [])
        })

        it('exports the tiles that are missing when the retained ones agree', async () => {
            existingCollection(currentFormat({red: REFLECTANCE}))
            retainedTile(0, currentFormat({red: REFLECTANCE}))

            await exportCollection({strategy: 'resume', bandEncoding: {red: REFLECTANCE}})

            assert.deepEqual(submittedImages().map(({assetId}) => assetId), [`${COLLECTION}/1`])
            assert.deepEqual(encodingOf(collectionProperties()), {red: REFLECTANCE})
        })

        it('resumes as unknown where a retained tile states nothing', async () => {
            existingCollection({[ENCODING_PROPERTY]: storedInline({})})
            retainedTile(0)

            await exportCollection({strategy: 'resume', bandEncoding: {red: REFLECTANCE}})

            assert.deepEqual(
                JSON.parse(collectionProperties()[ENCODING_PROPERTY]),
                {version: 2, parts: 0}
            )
            assert.deepEqual(submittedImages().map(({assetId}) => assetId), [`${COLLECTION}/1`])
        })

        // Tiles agreeing among themselves say nothing about the tiles this run never read.
        it('states no collection encoding merely because a retained tile agrees', async () => {
            existingCollection({[ENCODING_PROPERTY]: storedInline({})})
            retainedTile(0, currentFormat({red: REFLECTANCE}))

            await exportCollection({strategy: 'resume', bandEncoding: {red: REFLECTANCE}})

            assert.deepEqual(encodingOf(collectionProperties()), {})
        })
    })

    describe('with bands named like object members', () => {
        const proposedForMembers = {constructor: REFLECTANCE, toString: THERMAL}

        for (const [caseName, properties] of [
            ['has no encoding metadata', {}],
            ['describes only one of them', {[ENCODING_PROPERTY]: storedInline({toString: THERMAL})}]
        ]) {
            it(`resumes as unknown when the collection ${caseName}`, async () => {
                existingCollection(properties)

                await exportCollection({strategy: 'resume', bandEncoding: proposedForMembers})

                assert.deepEqual(
                    JSON.parse(collectionProperties()[ENCODING_PROPERTY]),
                    {version: 2, parts: 0}
                )
            })
        }

        it('keeps an encoding the collection states for them', async () => {
            existingCollection({[ENCODING_PROPERTY]: storedInline({constructor: REFLECTANCE, toString: THERMAL})})

            await exportCollection({strategy: 'resume', bandEncoding: proposedForMembers})

            assert.deepEqual(encodingOf(collectionProperties()), proposedForMembers)
        })
    })
})

describe('regression precision compatibility', () => {
    const precision = JSON.stringify({version: 1, scales: [1000]})
    const options = {strategy: 'resume', regressionPrecision: precision, bandEncoding: {}}
    const assertNoWrites = () => {
        assert.deepEqual(state.parentFolders, [])
        assert.deepEqual(state.replacedProperties, [])
        assert.deepEqual(state.submitted, [])
        assert.deepEqual(state.created, [])
        assert.deepEqual(state.deleted, [])
    }
    const seedCorrected = async () => {
        await exportCollection(options)
        const properties = collectionProperties()
        state.assets[COLLECTION].properties = properties
        for (const {image, assetId} of state.submitted) {
            state.assets[assetId] = {type: 'IMAGE', properties: image.properties, bands: [{id: 'regression', dataType: {precision: 'FLOAT'}}]}
        }
        state.replacedProperties = []
        state.submitted = []
        state.created = []
        state.deleted = []
        state.parentFolders = []
    }

    it('stamps fresh parent and tiles from the executed precision, overriding submitted and inherited claims', async () => {
        await exportCollection({...options, properties: {sepal_regression_precision: 'forged', sepal_regression_schema: 'forged'}})

        const properties = collectionProperties()
        assert.equal(properties.sepal_regression_precision, precision)
        assert.match(properties.sepal_regression_schema, /^[a-f0-9]{64}$/)
        for (const tile of submittedImages()) {
            assert.equal(tile.sepal_regression_precision, precision)
            assert.equal(tile.sepal_regression_schema, properties.sepal_regression_schema)
        }
    })

    it('resumes matching corrected results and exports only a tile confirmed absent by the collection listing', async () => {
        await seedCorrected()
        delete state.assets[`${COLLECTION}/1`]

        const result = await prepare(options)
        await exportTile(options, result.tiles[1])

        assert.deepEqual(result.tiles.map(tile => tile.retained), [true, false])
        assert.deepEqual(state.submitted.map(task => task.assetId), [`${COLLECTION}/1`])
    })

    for (const badName of ['01', '1']) {
        it(`validates the distinct member ${badName} even when a matching numeric spelling is read later`, async () => {
            await seedCorrected()
            const valid = state.assets[`${COLLECTION}/1`]
            delete state.assets[`${COLLECTION}/1`]
            state.assets[`${COLLECTION}/${badName}`] = {...valid, properties: {}}
            state.assets[`${COLLECTION}/${badName === '01' ? '1' : '01'}`] = valid

            await assert.rejects(prepare(options), error => {
                assert.ok(error.message.includes(`${COLLECTION}/${badName}`))
                return true
            })

            assertNoWrites()
        })
    }

    it('does not retain tile 1 merely because a compatible member named 01 exists', async () => {
        await seedCorrected()
        state.assets[`${COLLECTION}/01`] = state.assets[`${COLLECTION}/1`]
        delete state.assets[`${COLLECTION}/1`]

        const {tiles} = await prepare(options)

        assert.deepEqual(tiles.map(tile => tile.retained), [true, false])
        await exportTile(options, tiles[1])
        assert.deepEqual(state.submitted.map(task => task.assetId), [`${COLLECTION}/1`])
    })

    for (const count of [2, 24]) {
        it(`scans all ${count} retained members at preparation, then reads only each submitted tile and its parent`, async () => {
            await seedCorrected()
            const valid = state.assets[`${COLLECTION}/0`]
            delete state.assets[`${COLLECTION}/0`]
            delete state.assets[`${COLLECTION}/1`]
            for (let index = 0; index < count; index++) {
                state.assets[`${COLLECTION}/retained-${index}`] = valid
            }
            state.recordReads = []

            const {tiles} = await prepare(options)

            assert.equal(state.recordReads.length, count + 1)
            assert.deepEqual(tiles.map(tile => tile.retained), [false, false])
            state.recordReads = []
            state.listReads = []
            state.presenceQueries = []
            for (const tile of tiles) {
                await exportTile(options, tile)
            }
            assert.deepEqual(state.recordReads, [COLLECTION, `${COLLECTION}/0`, COLLECTION, `${COLLECTION}/1`])
            assert.deepEqual(state.listReads, [])
            assert.deepEqual(state.presenceQueries.map(({filter}) => filter.value), ['0', '1'])
            assert.equal(state.submitted.length, 2)
        })
    }

    for (const [label, mutate, checkSubmission = true] of [
        ['an unmarked parent', () => delete state.assets[COLLECTION].properties.sepal_regression_precision],
        ['a different public regression scale', () => state.assets[COLLECTION].properties.sepal_regression_precision = '{"version":1,"scales":[1]}'],
        ['an unmarked tile outside the requested tiling', () => state.assets[`${COLLECTION}/99`] = {type: 'IMAGE', properties: {}}, false],
        ['an unmarked retained tile', () => delete state.assets[`${COLLECTION}/1`].properties.sepal_regression_precision],
        ['a conflicting tile on a later listing page', () => { state.paged = true; delete state.assets[`${COLLECTION}/1`].properties.sepal_regression_precision }],
        ['a wrong retained tile type', () => state.assets[`${COLLECTION}/1`].bands[0].dataType.precision = 'INT'],
        ['a wrong array rank', () => state.assets[`${COLLECTION}/1`].bands[0].dataType.dimensionsCount = 1],
        ['an unreadable parent', () => state.readErrors[COLLECTION] = new Error('network failed')],
        ['an unreadable retained tile', () => state.readErrors[`${COLLECTION}/1`] = new Error('permission denied')],
        ['a retained tile returning ambiguous 404', () => state.readErrors[`${COLLECTION}/1`] = Object.assign(new Error('not visible'), {eeStatusCode: 404})],
        ['a failed collection listing', () => state.listError = new Error('listing failed'), false]
    ]) {
        it(`refuses ${label} before preparation writes`, async () => {
            await seedCorrected()
            mutate()

            await assert.rejects(prepare(options), /fresh destination|Resume|Replace/)

            assertNoWrites()
        })

        if (checkSubmission) {
            it(`refuses ${label} at submission of the destination tile`, async () => {
                await seedCorrected()
                mutate()

                await assert.rejects(exportTile(options, {tileIndex: 1, tileId: 'tile-1'}), /fresh destination|Resume|Replace/)

                assertNoWrites()
            })
        }
    }

    it('does not reread other members or their listing when submitting a readable compatible destination', async () => {
        await seedCorrected()
        state.assets[`${COLLECTION}/99`] = {type: 'IMAGE', properties: {}}
        state.listError = new Error('whole collection listing must not be read')
        state.recordReads = []
        state.listReads = []

        await exportTile(options, {tileIndex: 1, tileId: 'tile-1'})

        assert.deepEqual(state.recordReads, [COLLECTION, `${COLLECTION}/1`])
        assert.deepEqual(state.listReads, [])
        assert.equal(state.submitted.length, 1)
    })

    it('refuses an unreadable scoped absence query before submitting a missing destination tile', async () => {
        await seedCorrected()
        delete state.assets[`${COLLECTION}/1`]
        state.presenceError = new Error('destination query failed')

        await assert.rejects(exportTile(options, {tileIndex: 1, tileId: 'tile-1'}), /destination tile is absent/)

        assertNoWrites()
    })

    it('does not mistake an unreadable legacy asset alias for absence when its canonical name is listed', async () => {
        const canonical = 'projects/earthengine-legacy/assets/users/alice/result'
        state.assets[canonical] = {type: 'IMAGE_COLLECTION', properties: {}}
        state.assets['projects/earthengine-legacy/assets/users/alice'] = {type: 'FOLDER', properties: {}}

        await assert.rejects(lastValueFrom(readExportAsset$('users/alice/result', {precision, schema: 'expected'})), /fresh destination|Resume|Replace/)

        assertNoWrites()
    })

    it('permits a fresh legacy destination only after its readable parent listing establishes absence', async () => {
        const asset = await lastValueFrom(readExportAsset$('users/alice/new-result', {precision, schema: 'expected'}))

        assert.equal(asset, null)
        assertNoWrites()
    })

    it('does not accept a missing parent at the independent tile endpoint', async () => {
        await assert.rejects(exportTile(options, {tileIndex: 0, tileId: 'tile-0'}), /Resume/)
        assertNoWrites()
    })

    it('permits explicit Replace of an unmarked collection', async () => {
        existingCollection({})
        await exportCollection({...options, strategy: 'replace'})
        assert.deepEqual(state.deleted, [COLLECTION])
        assert.equal(collectionProperties().sepal_regression_precision, precision)
    })

    it('does not trust submitted precision properties on an unrelated export', async () => {
        await exportCollection({bandEncoding: {}, properties: {sepal_regression_precision: precision, sepal_regression_schema: 'forged'}})
        assert.equal(collectionProperties().sepal_regression_precision, undefined)
        assert.equal(collectionProperties().sepal_regression_schema, undefined)
    })
})

const encodingOf = properties => encodingFromProperties(properties)

const isEncodingPart = key => /^sepal_band_encoding_\d+$/.test(key)

const collectionProperties = () => {
    assert.equal(state.replacedProperties.length, 1)
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

// set() replaces the properties it names and keeps the rest, as Earth Engine's does, so a property this export
// does not name survives on the exported image. toDictionary() answers only the keys it was asked for.
const sourceImage = (properties = {}) => ({
    properties,
    bandNames: () => ['regression'],
    bandTypes: () => ({regression: {precision: 'float'}}),
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

const USER = {requestId: 'r-1', username: 'alice', origin: 'task', auth: {type: 'user'}, projectId: 'p', workloadTag: 'sepal-task-mosaic', endpoint: 'https://ee'}
const SERVICE_ACCOUNT = {...USER, auth: {type: 'serviceAccount'}}
const region = {bounds: () => ({type: 'Polygon'})}

const collectionSource = ({image = sourceImage(), strategy, bandEncoding, properties = {}, regressionPrecision}) => ({
    image,
    description: 'mosaic',
    assetId: COLLECTION,
    assetType: 'ImageCollection',
    strategy,
    region,
    scale: 30,
    tileSize: 2,
    properties: {recipe_id: 'mosaic-1', ...properties},
    bandEncoding,
    regressionPrecision
})

const prepare = ({context = USER, ...options}) =>
    lastValueFrom(inEEContext(context, prepareImageCollection$(collectionSource(options))))

const exportTile = ({context = USER, ...options}, tile) =>
    lastValueFrom(inEEContext(context, startCollectionTileExport$(collectionSource(options), tile)))

// What the task container does: prepare the collection, then start each tile the resume does not keep.
const exportCollection = async options => {
    const source = collectionSource(options)
    const {tiles} = await lastValueFrom(inEEContext(USER, prepareImageCollection$(source)))
    for (const tile of tiles.filter(({retained}) => !retained)) {
        await lastValueFrom(inEEContext(USER, startCollectionTileExport$(source, tile)))
    }
}

beforeEach(resetState)
