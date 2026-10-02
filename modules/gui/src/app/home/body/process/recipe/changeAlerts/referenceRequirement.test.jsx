import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {withRecipe} from '~/app/home/body/process/recipeContext'
import {Recipe} from '~/app/home/body/process/recipeContext'
import {SourceRuntimeProvider, withSourceRuntime} from '~/app/home/body/process/sourceRuntime/sourceRuntimeContext'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {initStore} from '~/store'

// Whether Change Alerts' reference authorizes Retrieve, composed as its editor composes it: the evidence lifecycle
// mounted beside a Retrieve, over a real store and source runtime. Earth Engine and storage are faked.

const fake = vi.hoisted(() => ({
    assets: {}, failing: new Set(), heldMetadata: null, versions: {}, heldVersions: null, calls: [], segmentRequests: []
}))
vi.mock('~/apiRegistry', async () => {
    const {Observable, of, throwError} = await import('rxjs')
    // An asset's metadata and its band evidence are read alike: held, failing or answered together.
    const read$ = (asset, answer) => {
        if (fake.heldMetadata) {
            return new Observable(subscriber => {
                fake.heldMetadata.push(() => {
                    subscriber.next(answer(fake.assets[asset]))
                    subscriber.complete()
                })
            })
        }
        return fake.failing.has(asset)
            ? throwError(() => new Error('Earth Engine unreachable'))
            : of(answer(fake.assets[asset]))
    }
    return {default: {
        gee: {
            assetMetadata$: ({asset}) => {
                fake.calls.push(['assetMetadata', asset])
                return read$(asset, ({metadata}) => metadata)
            },
            bands$: ({asset, includeDataTypes}) => {
                fake.calls.push(['bands', asset])
                return read$(asset, ({bandEvidence}) => includeDataTypes ? bandEvidence : bandEvidence.map(({name}) => name))
            },
            loadCCDCSegments$: ({recipe}) => {
                fake.segmentRequests.push(recipe)
                return of([])
            },
            loadTimeSeriesObservations$: () => of([]),
            assetVersions$: ({ids}) => {
                fake.calls.push(['assetVersions', ids])
                const answer = () => ({assets: ids.map(id => ({id, type: 'IMAGE', version: fake.versions[id] ?? 'v1'}))})
                return fake.heldVersions
                    ? new Observable(subscriber => {
                        fake.heldVersions.push(() => {
                            subscriber.next(answer())
                            subscriber.complete()
                        })
                    })
                    : of(answer())
            }
        },
        recipe: {
            load$: id => throwError(() => new Error(`Recipe ${id} not found`)),
            loadAll$: () => of(LISTING)
        }
    }}
})
vi.mock('~/translate', () => ({msg: (key, values) => values ? `${key} ${JSON.stringify(values)}` : key}))
vi.mock('~/widget/notifications', () => ({Notifications: {error: () => {}}}))
// Filled in once the modules registering these are imported: importing them from within the mock would never resolve.
const registry = vi.hoisted(() => ({}))
vi.mock('~/app/home/body/process/recipeTypeRegistry', () => ({getRecipeType: type => registry[type]}))
vi.mock('../ccdc/ccdcRecipe', () => ({getAllVisualizations: () => []}))
vi.mock('~/sources', () => ({getAvailableBands: ({dataSets}) => dataSets.map(dataSet => dataSet.toLowerCase())}))
vi.mock('~/app/home/user/userDetails', () => ({userDetailsHint: () => {}}))
// The graph renderer is the chart's output boundary.
vi.mock('../ccdc/ccdcGraph', () => ({CCDCGraph: () => null}))
// Constructing a preview layer is what requests a preview: the map mounts it and Earth Engine is asked for its tiles.
const previews = vi.hoisted(() => ({constructed: [], shown: undefined}))
vi.mock('~/app/home/map/layer/earthEngineImageLayer', () => ({
    EarthEngineImageLayer: class {
        constructor({previewRequest, watchedProps}) {
            previews.constructed.push(this)
            this.previewRequest = previewRequest
            this.watchedProps = watchedProps
        }
        removeFromMap() {}
    }
}))

const {SourceEvidenceSync} = await import('../sourceEvidenceSync')
const {changeAlertsObservation} = await import('./referenceObservation')
const {withRetrieveOutput} = await import('../withRetrieveOutput')
const {retrieveDecision} = await import('../retrieveOutput')
const {CHECKED, CHECKING, readSourceRequirements} = await import('../sourceRequirements')
const {
    CHECKING_SOURCE, selectedSourceStatusOfState, sourceProblemsOfState, UNAVAILABLE_SOURCE, UNSUITABLE_SOURCE
} = await import('../selectedSourceStatus')
const {assetsMutated} = await import('~/widget/assetMutations')
const {describeSegments$} = await import('../ccdc/segmentDescription')
const {referenceRequirement} = await import('./referenceRequirement')
const {ChartPixel} = await import('./panels/chartPixel')
const {requestGate} = await import('../sourceRequirements')
const {actionBuilder} = await import('~/action-builder')
const {PortalContainer, PortalContext} = await import('~/widget/portal')
const {RecipeImageLayer} = await import('../recipeImageLayer')
const {addRecipeImageLayer} = await import('../../recipeImageLayerRegistry')
const {TabContext} = await import('~/widget/tabs/tabContext')
const {Subject} = await import('rxjs')

// Change Alerts' own layer form is replaced by one that reports the layer it is given to draw.
addRecipeImageLayer('CHANGE_ALERTS', ({layer}) => {
    previews.shown = layer
    return null
})

registry.CHANGE_ALERTS = {sourceRequirements: [referenceRequirement]}
registry.CCDC = {describeSegments$}

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const ALERTS = 'alerts-1'
const SEGMENTS_ASSET = 'users/x/segments'

let root, container, store, retrieve, runtime

beforeEach(() => {
    fake.assets = {[SEGMENTS_ASSET]: segmentsAsset(VALID_BANDS)}
    fake.segmentRequests = []
    previews.constructed = []
    previews.shown = undefined
    fake.failing = new Set()
    fake.heldMetadata = null
    fake.versions = {}
    fake.heldVersions = null
    fake.calls = []
})

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    container?.remove()
})

describe('a reference that supplies the segments Change Alerts reads', () => {
    it.each([
        ['a Masking over CCDC', ref('masking-ccdc')],
        ['an asset with the segment layout', {type: 'ASSET', id: SEGMENTS_ASSET}]
    ])('authorizes Retrieve and says nothing in REF, for %s', async (_case, selection) => {
        await editor({selection})

        expect(referenceStatus()).toBe(null)
        expect(decision()).toBe('RETRIEVABLE')
    })
})

describe('a reference that cannot supply them', () => {
    it('marks REF, explains the way to where it stopped, keeps the selection and blocks Retrieve', async () => {
        await editor({selection: ref('masking-mosaic')})

        expect(referenceStatus()).toMatchObject({state: UNSUITABLE_SOURCE})
        expect(referenceStatus().message).toContain('"way":"MASKING \'Forest mask\' → "')
        expect(referenceStatus().message).toContain('"source":"MOSAIC \'Sentinel 2021\'"')
        expect(sourceProblemsOfState(store.getState(), ALERTS, id => runtime.evidenceOwnerOf(id)).reference)
            .toBe(referenceStatus().message)
        expect(alertsRecipe().model.reference).toEqual(ref('masking-mosaic'))
        expect(decision()).toBe('BLOCKED')
        expect(retrieve.retrieveOutput.output.diagnostics[0].code).toBe('SOURCE_UNSUITABLE')
    })

    it('is refused the same way when its segments asset lacks the layout, selected directly or behind a recipe', async () => {
        fake.assets[SEGMENTS_ASSET] = segmentsAsset([['ndvi_rmse', 1]])

        await editor({selection: ref('asset-mosaic-1')})
        const behindRecipe = referenceStatus().message
        await act(async () => root.unmount())
        await editor({selection: {type: 'ASSET', id: SEGMENTS_ASSET}})

        expect(referenceStatus()).toMatchObject({state: UNSUITABLE_SOURCE, message: behindRecipe})
        expect(decision()).toBe('BLOCKED')
    })
})

describe('a reference the held records already refuse', () => {
    it('is refused with nothing reading it', async () => {
        await editor({selection: ref('masking-mosaic'), owner: false})

        expect(referenceStatus()).toMatchObject({state: UNSUITABLE_SOURCE})
        expect(decision()).toBe('BLOCKED')
        expect(retrieve.retrieveOutput.output.diagnostics[0].code).toBe('SOURCE_UNSUITABLE')
    })
})

describe('Earth Engine requests that read the reference\'s segments', () => {
    it('are not made while it is unsuitable, and are once a suitable reference is selected', async () => {
        await editor({selection: ref('masking-mosaic'), chart: true})
        expect(referenceStatus()).toMatchObject({state: UNSUITABLE_SOURCE})
        expect(fake.segmentRequests).toEqual([])
        expect(gate('IMAGE_OUTPUT')).toMatchObject({withdraw: true})

        await act(async () => store.dispatch(set(['process', 'loadedRecipes', ALERTS, 'model', 'reference'], ref('masking-ccdc'))))
        await settled()

        expect(fake.segmentRequests).toEqual([ref('masking-ccdc')])
        expect(gate('IMAGE_OUTPUT')).toBe(null)
    })

    it('are held while the reference is being checked, keeping what is drawn, and made once it is known to suit', async () => {
        fake.heldMetadata = []
        await editor({selection: {type: 'ASSET', id: SEGMENTS_ASSET}, chart: true})

        expect(fake.segmentRequests).toEqual([])
        expect(gate('IMAGE_OUTPUT')).toMatchObject({wait: true, withdraw: false})

        await answerHeldReads()

        expect(fake.segmentRequests).toEqual([expect.objectContaining({type: 'ASSET', id: SEGMENTS_ASSET})])
    })
})

// The monitoring and calibration mosaics are built around the geometry of the reference's segment source: execution
// resolves its provider chain, but reads nothing the requirement judges of the segments.
describe('Earth Engine requests for the mosaics a period is compared on', () => {
    it('are made over segments without the layout the alerts need', async () => {
        fake.assets[SEGMENTS_ASSET] = segmentsAsset([['ndvi_rmse', 1]])
        await editor({selection: {type: 'ASSET', id: SEGMENTS_ASSET}})

        expect(gate('IMAGE_OUTPUT')).toMatchObject({code: 'SOURCE_UNSUITABLE', withdraw: true})
        expect(gate('COLLECTION_MOSAIC')).toBe(null)
    })

    it('are refused over a reference whose chain leads to no segments', async () => {
        await editor({selection: ref('masking-mosaic')})

        expect(gate('COLLECTION_MOSAIC')).toMatchObject({code: 'SOURCE_UNSUITABLE', withdraw: true})
    })
})

describe('Earth Engine requests for alerts shown outside their editor', () => {
    it('are refused where the held records alone refuse the reference', async () => {
        await editor({selection: ref('masking-mosaic'), owner: false})

        await act(async () => store.dispatch(set(['process', 'tabs'], [])))

        expect(gate('IMAGE_OUTPUT')).toMatchObject({code: 'SOURCE_UNSUITABLE', withdraw: true})
    })

    it('are not held where only evidence could answer: nothing there reads the reference', async () => {
        await editor({selection: {type: 'ASSET', id: SEGMENTS_ASSET}, owner: false})

        await act(async () => store.dispatch(set(['process', 'tabs'], [])))

        expect(gate('IMAGE_OUTPUT')).toBe(null)
    })
})

describe('a reference its dependencies already know to be unsound', () => {
    it('is refused for that, with the changes still described', async () => {
        await editor({selection: ref(ALERTS)})

        expect(retrieve.retrieveOutput.output.dependencyValidity.status).toBe('INVALID')
        expect(retrieve.retrieveOutput.output.bands).not.toHaveLength(0)
        expect(decision()).toBe('BLOCKED')
    })
})

describe('the alerts drawn on the map', () => {
    it('are not requested while the reference is being checked, and are once it is known to suit', async () => {
        fake.heldMetadata = []
        await editor({selection: {type: 'ASSET', id: SEGMENTS_ASSET}, layer: true})
        expect(previews.constructed).toHaveLength(0)

        await answerHeldReads()

        expect(previews.constructed).toHaveLength(1)
        expect(previews.shown).toBe(previews.constructed[0])
    })

    it('stay drawn while the reference is checked again, but not once what they are drawn from changes', async () => {
        await editor({selection: {type: 'ASSET', id: SEGMENTS_ASSET}, layer: true})
        const drawn = previews.shown
        fake.heldMetadata = []

        await act(async () => replaceCredentials())
        expect(gate('IMAGE_OUTPUT')).toMatchObject({wait: true})
        expect(previews.shown).toBe(drawn)

        await act(async () => store.dispatch(set(['process', 'loadedRecipes', ALERTS, 'model', 'options', 'minConfidence'], 7)))

        expect(previews.shown).toBe(null)
        expect(previews.constructed).toEqual([drawn])
    })

    it('are taken away once the reference is found unsuitable, and requested again once a suitable one is selected', async () => {
        await editor({selection: {type: 'ASSET', id: SEGMENTS_ASSET}, layer: true})
        expect(previews.constructed).toHaveLength(1)
        fake.assets[SEGMENTS_ASSET] = segmentsAsset([['ndvi_rmse', 1]])

        await act(async () => replaceCredentials())
        await settled()

        expect(referenceStatus()).toMatchObject({state: UNSUITABLE_SOURCE})
        expect(previews.shown).toBe(null)
        expect(previews.constructed).toHaveLength(1)

        await act(async () => store.dispatch(set(['process', 'loadedRecipes', ALERTS, 'model', 'reference'], ref('masking-ccdc'))))
        await settled()

        expect(previews.constructed).toHaveLength(2)
        expect(previews.shown).toBe(previews.constructed[1])
    })
})

describe('a recipe with no reference selected', () => {
    it('says nothing in REF before the form asks for one, but cannot be retrieved', async () => {
        await editor({selection: {}})

        expect(referenceStatus()).toBe(null)
        expect(decisionAtApply()).toBe('BLOCKED')
        expect(retrieve.readRetrieveOutput().output.diagnostics[0].code).toBe('SOURCE_MISSING')
    })
})

describe('evidence and the observation it was read by', () => {
    it('counts only for the observation the owner\'s live basis belongs to', async () => {
        await editor({selection: {type: 'ASSET', id: SEGMENTS_ASSET}})
        const recipe = alertsRecipe()
        const owner = runtime.evidenceOwnerOf(ALERTS)
        const read = evidenceOwner =>
            readSourceRequirements({state: store.getState(), recipe, evidenceOwnerOf: () => evidenceOwner, now: Date.now()})[0]

        expect(read(owner).acquisition).toBe(CHECKED)
        expect(read({...owner, observationId: 'another observation'}).acquisition).toBe(CHECKING)
    })

    it('read again authorizes nothing on what the previous observation found, at any notification', async () => {
        await editor({selection: {type: 'ASSET', id: SEGMENTS_ASSET}})
        fake.assets[SEGMENTS_ASSET] = segmentsAsset([['ndvi_rmse', 1]])
        fake.heldMetadata = []
        await act(async () => retrieve.refreshRetrieveOutput())
        const decisions = []
        const unsubscribe = store.subscribe(() => decisions.push(decisionAtApply()))

        act(() => fake.heldMetadata.forEach(answer => answer()))
        await settled()
        unsubscribe()

        expect(decisions.length).toBeGreaterThan(0)
        expect(decisions).not.toContain('RETRIEVABLE')
        expect(referenceStatus()).toMatchObject({state: UNSUITABLE_SOURCE})
    })
})

describe('a source runtime replaced while the store keeps the evidence', () => {
    it.each([
        ['suits once the replacement\'s observation settles', VALID_BANDS, 'RETRIEVABLE'],
        ['is refused once the replacement\'s observation settles', [['ndvi_rmse', 1]], 'BLOCKED']
    ])('authorizes nothing on the evidence the previous runtime published, and %s', async (_case, bands, settledDecision) => {
        // An asset stating no date representation is observed once, so the previous runtime's evidence is its first
        // observation's - the one a replacement would reach again if it counted from where the previous one began.
        fake.assets[SEGMENTS_ASSET] = segmentsAsset(VALID_BANDS, {})
        await editor({selection: {type: 'ASSET', id: SEGMENTS_ASSET}})
        expect(decisionAtApply()).toBe('RETRIEVABLE')
        fake.assets[SEGMENTS_ASSET] = segmentsAsset(bands, {})
        fake.heldMetadata = []

        await replaceRuntime()
        expect(fake.heldMetadata.length).toBeGreaterThan(0)
        expect(decisionAtApply()).not.toBe('RETRIEVABLE')
        act(() => fake.heldMetadata.forEach(answer => answer()))
        await settled()

        expect(decisionAtApply()).toBe(settledDecision)
    })
})

describe('a reference that could not be read', () => {
    it('settles to unavailable rather than checking, and Refresh reads it again and restores Retrieve', async () => {
        fake.failing.add(SEGMENTS_ASSET)
        await editor({selection: {type: 'ASSET', id: SEGMENTS_ASSET}})
        expect(referenceStatus()).toMatchObject({state: UNAVAILABLE_SOURCE, refresh: true})
        expect(decision()).toBe('BLOCKED')

        fake.failing.delete(SEGMENTS_ASSET)
        const reads = metadataReads()
        await act(async () => retrieve.refreshRetrieveOutput())

        expect(metadataReads()).toBeGreaterThan(reads)
        expect(referenceStatus()).toBe(null)
        expect(decision()).toBe('RETRIEVABLE')
    })
})

describe('Apply right after the session moves past what the reference was read on', () => {
    it.each([
        ['credentials are replaced', () => store.dispatch(set(['user', 'currentUser', 'googleTokens'], {accessToken: 'renewed'}))],
        ['a recipe the reference reads is edited', () => store.dispatch(set(['process', 'loadedRecipes', 'masking-ccdc', 'model', 'imageMask'], ref('mosaic-1')))],
        ['the asset it reads is changed by this session', () => assetsMutated([SEGMENTS_ASSET.split('/')])]
    ])('is not authorized when %s, and is again once the reference is read anew', async (_case, change) => {
        const selection = _case.startsWith('a recipe') ? ref('masking-ccdc') : {type: 'ASSET', id: SEGMENTS_ASSET}
        fake.heldVersions = _case.startsWith('the asset') ? [] : null
        await editor({selection})
        answerVersions()
        await settled()
        expect(decision()).toBe('RETRIEVABLE')

        act(() => {
            change()
            expect(decisionAtApply()).not.toBe('RETRIEVABLE')
        })

        fake.versions[SEGMENTS_ASSET] = 'v2'
        for (let follow = 0; follow < 5; follow++) {
            answerVersions()
            await settled()
        }
        expect(decision()).toBe('RETRIEVABLE')
    })

    it('is not authorized right after an explicit refresh, and is again once the reference is read anew', async () => {
        await editor({selection: {type: 'ASSET', id: SEGMENTS_ASSET}})
        fake.heldMetadata = []

        await act(async () => retrieve.refreshRetrieveOutput())

        expect(decisionAtApply()).not.toBe('RETRIEVABLE')
        expect(decision()).toBe('RESOLVING')
        act(() => fake.heldMetadata.forEach(answer => answer()))
        await settled()
        expect(decision()).toBe('RETRIEVABLE')
    })
})

describe('evidence answered before its asset\'s first token', () => {
    it('waits for the token rather than staying pending, and is authorized once it arrives', async () => {
        fake.heldVersions = []
        await editor({selection: {type: 'ASSET', id: SEGMENTS_ASSET}})
        expect(referenceStatus()).toMatchObject({state: CHECKING_SOURCE})
        expect(decision()).toBe('RESOLVING')

        answerVersions()
        await settled()

        expect(referenceStatus()).toBe(null)
        expect(decision()).toBe('RETRIEVABLE')
    })
})

describe('reading whether the reference suits', () => {
    it('starts no work: no request, no dispatch', async () => {
        await editor({selection: ref('masking-mosaic')})
        const calls = fake.calls.length
        const dispatch = vi.spyOn(store, 'dispatch')

        referenceStatus()
        decisionAtApply()

        expect(fake.calls).toHaveLength(calls)
        expect(dispatch).not.toHaveBeenCalled()
    })
})

describe('a Retrieve with nothing reading the reference', () => {
    it('blocks as unchecked rather than waiting for an answer nothing will give', async () => {
        await editor({selection: ref('masking-ccdc'), owner: false})

        expect(decision()).toBe('BLOCKED')
        expect(retrieve.retrieveOutput.output.diagnostics[0].code).toBe('SOURCE_UNCHECKED')
    })
})

const VALID_BANDS = [
    ['tStart', 1], ['tEnd', 1], ['tBreak', 1], ['numObs', 1], ['changeProb', 1],
    ['ndvi_coefs', 2], ['ndvi_rmse', 1], ['ndvi_magnitude', 1]
]

function ref(id) {
    return {type: 'RECIPE_REF', id}
}

const RECORDS = [
    {id: 'masking-ccdc', name: 'Masked CCDC', type: 'MASKING', model: {imageToMask: ref('ccdc-1')}},
    {id: 'masking-mosaic', name: 'Forest mask', type: 'MASKING', model: {imageToMask: ref('mosaic-1')}},
    {id: 'mosaic-1', name: 'Sentinel 2021', type: 'MOSAIC', model: {}},
    {id: 'asset-mosaic-1', name: 'Segments', type: 'ASSET_MOSAIC', model: {assetDetails: {assetId: SEGMENTS_ASSET}}},
    {
        id: 'ccdc-1', name: 'CCDC', type: 'CCDC',
        model: {
            sources: {dataSets: {LANDSAT: ['NDVI']}},
            options: {corrections: []},
            ccdcOptions: {dateFormat: 1},
            dates: {startDate: '2015-01-01', endDate: '2021-01-01'}
        }
    }
].map(record => ({...record, revision: 1}))

const LISTING = [
    {id: ALERTS, name: 'Alerts', type: 'CHANGE_ALERTS', revision: 1},
    ...RECORDS.map(({id, name, type}) => ({id, name, type, revision: 1}))
]

// An image asset as Earth Engine answers for it. Its metadata is the asset record, whose band types state no array
// dimensionality - every band there reads like a scalar, and `dimensions` is the band's grid - while its band evidence
// carries the dimensionality evaluated from the image itself.
function segmentsAsset(bands, properties = {dateFormat: 1}) {
    return {
        metadata: {
            type: 'Image',
            bandNames: bands.map(([name]) => name),
            bands: bands.map(([id]) => ({id, crs: 'EPSG:4326', dimensions: [5015, 3093], data_type: {type: 'PixelType', precision: 'double'}})),
            properties
        },
        bandEvidence: bands.map(([name, arrayDimensions]) => ({name, arrayDimensions}))
    }
}

const Probe = props => {
    retrieve = props
    return null
}
const RetrieveProbe = compose(Probe, withRetrieveOutput(), withRecipe())

const RuntimeProbe = compose(props => {
    runtime = props.sourceRuntime
    return null
}, withSourceRuntime())

const editor = async ({selection, owner = true, chart = false, layer = false}) => {
    const initialState = {
        user: {currentUser: {googleTokens: {accessToken: 'token'}}},
        process: {
            loadedRecipes: {
                [ALERTS]: {
                    id: ALERTS, type: 'CHANGE_ALERTS', revision: 1,
                    model: {
                        reference: selection,
                        sources: {band: 'ndvi', dataSets: {LANDSAT: ['NDVI']}},
                        options: {corrections: []},
                        date: {monitoringEnd: '2024-01-01', monitoringDuration: 1, monitoringDurationUnit: 'months', calibrationDuration: 2, calibrationDurationUnit: 'months'}
                    },
                    ui: {initialized: true}
                },
                ...Object.fromEntries(RECORDS.map(record => [record.id, record]))
            },
            recipes: LISTING,
            recipeListing: {checkedAt: Date.now()},
            projects: [],
            tabs: [{id: ALERTS}]
        },
        assets: {user: [{id: SEGMENTS_ASSET, updateTime: 'T1'}], other: []},
        dimensions: {width: 1024, height: 768}
    }
    store = createStore((state = initialState, action) => action.reduce ? action.reduce(state) : state)
    initStore(store)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => root.render(
        <Provider store={store}>
            <SourceRuntimeProvider>
                <Recipe id={ALERTS}>
                    {owner ? <SourceEvidenceSync observation={changeAlertsObservation}/> : null}
                    <RetrieveProbe/>
                    <RuntimeProbe/>
                    {layer
                        ? (
                            <TabContext id={ALERTS} busyIn$={new Subject()}>
                                <RecipeImageLayer
                                    source={{id: ALERTS, sourceConfig: {recipeId: ALERTS}}}
                                    layerConfig={{visualizationType: 'changes', mosaicType: 'latest', visParams: {type: 'continuous', bands: ['confidence']}}}
                                    map={{}}
                                />
                            </TabContext>
                        )
                        : null}
                    {chart
                        ? (
                            <>
                                <PortalContainer id='chart-panel'/>
                                <PortalContext id='chart-panel'>
                                    <ChartPixel values={{selectedBand: 'ndvi'}}/>
                                </PortalContext>
                            </>
                        )
                        : null}
                </Recipe>
            </SourceRuntimeProvider>
        </Provider>
    ))
    if (chart) {
        act(() => actionBuilder('CHART_PIXEL').set(['process.loadedRecipes', ALERTS, 'ui.chartPixel'], {lat: 0, lng: 0}).dispatch())
    }
    await settled()
}

// The editor mounted again under a new source runtime, over the store as it stood - published evidence included.
const replaceRuntime = async () => {
    const retained = store.getState()
    await act(async () => root.unmount())
    store.dispatch({type: 'RESTORE_RETAINED_STATE', reduce: () => retained})
    root = createRoot(container)
    await act(async () => root.render(
        <Provider store={store}>
            <SourceRuntimeProvider>
                <Recipe id={ALERTS}>
                    <SourceEvidenceSync observation={changeAlertsObservation}/>
                    <RetrieveProbe/>
                    <RuntimeProbe/>
                </Recipe>
            </SourceRuntimeProvider>
        </Provider>
    ))
}

const settled = () => act(async () => {})

const answerHeldReads = async () => {
    const held = fake.heldMetadata
    fake.heldMetadata = null
    act(() => held.forEach(answer => answer()))
    await settled()
}

// Credentials say nothing of the pixels a drawing shows, but evidence read under the previous ones is read again.
const replaceCredentials = () => store.dispatch(set(['user', 'currentUser', 'googleTokens'], {accessToken: `renewed-${Math.random()}`}))

const answerVersions = () => {
    const held = fake.heldVersions || []
    fake.heldVersions = fake.heldVersions && []
    act(() => held.forEach(answer => answer()))
}

const set = (path, value) => ({
    type: 'SET',
    reduce: state => setIn(state, path, value)
})

const setIn = (object, [key, ...rest], value) =>
    ({...object, [key]: rest.length ? setIn(object?.[key] || {}, rest, value) : value})

const alertsRecipe = () => selectFrom(store.getState(), ['process.loadedRecipes', ALERTS])

// Whether a new request for an operation over the alerts may start, read from the store as it stands.
const gate = operation =>
    requestGate({state: store.getState(), recipe: alertsRecipe(), operation, evidenceOwnerOf: id => runtime.evidenceOwnerOf(id), now: Date.now()})

const referenceStatus = () =>
    selectedSourceStatusOfState(store.getState(), ALERTS, 'reference', id => runtime.evidenceOwnerOf(id))

const decide = ({output, pending}) =>
    retrieveDecision({output, pending, names: output.bands.map(({name}) => name), destination: 'GEE'}).status

// What the panel shows, from its last render.
const decision = () => decide(retrieve.retrieveOutput)

// What a submission decides from, read from the store as it stands at that moment.
const decisionAtApply = () => decide(retrieve.readRetrieveOutput())

const metadataReads = () => fake.calls.filter(([name]) => name === 'assetMetadata').length
