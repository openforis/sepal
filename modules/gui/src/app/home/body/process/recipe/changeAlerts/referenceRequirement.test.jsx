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
    assets: {}, failing: new Set(), heldMetadata: null, versions: {}, heldVersions: null, calls: [], segmentRequests: [],
    stored: {}, heldLoads: null, failingLoads: new Set()
}))
vi.mock('~/apiRegistry', async () => {
    const {Observable, of, throwError} = await import('rxjs')
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
                return read$(asset, metadata => metadata)
            },
            bands$: ({asset}) => {
                fake.calls.push(['bands', asset])
                return throwError(() => new Error('Unexpected band request'))
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
            load$: id => {
                fake.calls.push(['loadRecipe', id])
                if (fake.failingLoads.has(id) || !fake.stored[id]) {
                    return throwError(() => new Error(`Recipe ${id} not found`))
                }
                return fake.heldLoads
                    ? new Observable(subscriber => {
                        fake.heldLoads.push(() => {
                            subscriber.next(fake.stored[id])
                            subscriber.complete()
                        })
                    })
                    : of(fake.stored[id])
            },
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
const {mapProducts} = await import('./bands')
const {recipeAccess} = await import('../../recipeAccess')
const {ChartPixel} = await import('./panels/chartPixel')
const {requestGate} = await import('../sourceRequirements')
const {actionBuilder} = await import('~/action-builder')
const {PortalContainer, PortalContext} = await import('~/widget/portal')
const {RecipeImageLayer} = await import('../recipeImageLayer')
const {addRecipeImageLayer} = await import('../../recipeImageLayerRegistry')
const {TabContext} = await import('~/widget/tabs/tabContext')
const {Subject} = await import('rxjs')
const {LayerSourceRequirement, SelectedSourceStatus} = await import('../selectedSource')

// Change Alerts' own layer form is replaced by one that reports the layer it is given to draw, and shows what every
// layer form shows of the requirement holding it.
addRecipeImageLayer('CHANGE_ALERTS', ({layer}) => {
    previews.shown = layer
    return <LayerSourceRequirement/>
})

registry.CHANGE_ALERTS = {sourceRequirements: [referenceRequirement], sourceObservation: changeAlertsObservation, mapProducts}
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
    fake.stored = {}
    fake.heldLoads = null
    fake.failingLoads = new Set()
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

    it('is judged from its asset\'s metadata alone, with no band request', async () => {
        await editor({selection: ref('asset-mosaic-1')})

        expect(decision()).toBe('RETRIEVABLE')
        expect(fake.calls.filter(([name]) => name === 'bands')).toEqual([])
        expect(metadataReads()).toBe(1)
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
        await onAnotherMap({selection: ref('masking-mosaic')})

        expect(gate('IMAGE_OUTPUT')).toMatchObject({code: 'SOURCE_UNSUITABLE', withdraw: true})
        expect(previews.constructed).toEqual([])
    })

    it('are refused over a reference only its evidence shows to be unsuitable, and nothing is drawn', async () => {
        fake.assets[SEGMENTS_ASSET] = segmentsAsset([['ndvi_rmse', 1]])

        await onAnotherMap({selection: {type: 'ASSET', id: SEGMENTS_ASSET}})

        expect(gate('IMAGE_OUTPUT')).toMatchObject({code: 'SOURCE_UNSUITABLE', withdraw: true})
        expect(previews.constructed).toEqual([])
    })

    it('are held while the layer\'s own watch checks the reference, and made once it is known to suit', async () => {
        fake.heldMetadata = []
        await onAnotherMap({selection: {type: 'ASSET', id: SEGMENTS_ASSET}})
        expect(gate('IMAGE_OUTPUT')).toMatchObject({code: 'SOURCE_PENDING', wait: true})
        expect(previews.constructed).toEqual([])

        await answerHeldReads()

        expect(gate('IMAGE_OUTPUT')).toBe(null)
        expect(previews.constructed).toHaveLength(1)
    })

    it('change none of the alerts\' configuration', async () => {
        fake.assets[SEGMENTS_ASSET] = segmentsAsset(VALID_BANDS, {dateFormat: 2, recipe_sources: JSON.stringify(EXPORTED_SOURCES)})
        const before = alertsModel({type: 'ASSET', id: SEGMENTS_ASSET})

        await onAnotherMap({selection: {type: 'ASSET', id: SEGMENTS_ASSET}})

        expect(alertsRecipe().ui.sourceEvidence.status).toBe('OBSERVED')
        expect(alertsRecipe().model).toEqual(before)
    })
})

// The monitoring and calibration mosaics resolve the reference through its provider chain alone.
// What the map's area menu says of alerts withheld over their reference: the alerts, the section their reference is
// selected in, and the diagnosis that section gives.
describe('alerts shown on another map while their reference holds them', () => {
    it('say why they are not drawn', async () => {
        await onAnotherMap({selection: ref('masking-mosaic')})

        expect(previews.constructed).toEqual([])
        expect(layerMessages()).toEqual([{type: 'warning', text: expect.stringContaining('process.source.status.held')}])
        expect(layerMessages()[0].text).toContain('CHANGE_ALERTS \'Alerts\'')
        expect(layerMessages()[0].text).toContain('process.changeAlerts.panel.reference.button')
        expect(layerMessages()[0].text).toContain('process.source.status.notAProducer')
        expect(layerMessages()[0].text).toContain('Sentinel 2021')
    })

    it('say so when no reference is selected', async () => {
        await onAnotherMap({selection: {}})

        expect(layerMessages()).toEqual([{type: 'warning', text: expect.stringContaining('process.source.status.missing')}])
    })

    it('stop saying it, and are drawn, once a suitable reference is selected', async () => {
        await onAnotherMap({selection: ref('masking-mosaic')})

        await act(async () => store.dispatch(set(['process', 'loadedRecipes', ALERTS, 'model', 'reference'], ref('masking-ccdc'))))
        await settled()

        expect(layerMessages()).toEqual([])
        expect(previews.constructed).toHaveLength(1)
    })

    it('say only that the reference is being checked while it is', async () => {
        fake.heldMetadata = []
        await onAnotherMap({selection: {type: 'ASSET', id: SEGMENTS_ASSET}})
        expect(layerMessages()).toEqual([{type: 'info', text: 'process.source.status.held ' + JSON.stringify({
            recipe: 'CHANGE_ALERTS \'Alerts\'',
            section: 'process.changeAlerts.panel.reference.button',
            message: 'process.source.status.checking'
        })}])

        await answerHeldReads()

        expect(layerMessages()).toEqual([])
    })

    // The mosaics resolve the reference through its provider chain alone, which an asset selected directly satisfies.
    it('warn nothing for a product of theirs the requirement does not hold', async () => {
        fake.assets[SEGMENTS_ASSET] = segmentsAsset([['ndvi_rmse', 1]])
        const MOSAIC = {visualizationType: 'monitoring', mosaicType: 'latest', visParams: {type: 'rgb', bands: ['red', 'green', 'blue']}}

        await onAnotherMap({selection: {type: 'ASSET', id: SEGMENTS_ASSET}, layers: [MOSAIC, CHANGES]})

        expect(layerMessages()).toEqual([{type: 'warning', text: expect.stringContaining('process.source.status.held')}])
        expect(gate('COLLECTION_MOSAIC')).toBe(null)
    })
})

// REF says what it knows of the reference: checking as information, a problem established about it as a warning.
describe('the reference section', () => {
    it.each([
        ['checking it', 'info', () => fake.heldMetadata = [], {type: 'ASSET', id: SEGMENTS_ASSET}],
        ['unsuitable', 'warning', () => {}, ref('masking-mosaic')],
        ['unavailable', 'warning', () => fake.failing.add(SEGMENTS_ASSET), {type: 'ASSET', id: SEGMENTS_ASSET}]
    ])('shows a reference %s as %s', async (_case, type, arrange, selection) => {
        arrange()

        await editor({selection, section: true})

        expect(sectionMessage()).toEqual(type)
    })
})

describe('a mosaic of the period, shown with the editor closed', () => {
    const MOSAIC = {visualizationType: 'monitoring', mosaicType: 'latest', visParams: {type: 'rgb', bands: ['red', 'green', 'blue']}}

    it('asks nothing of the segments it does not read', async () => {
        await onAnotherMap({selection: {type: 'ASSET', id: SEGMENTS_ASSET}, layers: [MOSAIC]})

        expect(gate('COLLECTION_MOSAIC')).toBe(null)
        expect(metadataReads()).toBe(0)
    })

    it('is held while the records of a chain the session does not hold are read, and refused once they show it leads to no segments', async () => {
        fake.stored = storedRecords(['masking-mosaic', 'mosaic-1'])
        fake.heldLoads = []
        await onAnotherMap({selection: ref('masking-mosaic'), unloaded: ['masking-mosaic', 'mosaic-1'], layers: [MOSAIC]})
        expect(gate('COLLECTION_MOSAIC')).toMatchObject({code: 'SOURCE_PENDING', wait: true})

        await answerHeldLoads()

        expect(gate('COLLECTION_MOSAIC')).toMatchObject({code: 'SOURCE_UNSUITABLE', withdraw: true})
        expect(previews.constructed).toEqual([])
        expect(metadataReads()).toBe(0)
    })

    it('is refused as unavailable, not left waiting, when those records cannot be read', async () => {
        fake.failingLoads = new Set(['masking-mosaic'])

        await onAnotherMap({selection: ref('masking-mosaic'), unloaded: ['masking-mosaic', 'mosaic-1'], layers: [MOSAIC]})

        expect(gate('COLLECTION_MOSAIC')).toMatchObject({code: 'SOURCE_UNAVAILABLE', wait: false})
        expect(previews.constructed).toEqual([])
    })
})

describe('the reference watched by several consumers', () => {
    // An asset stating no date representation proposes none, so the selection is left as it is.
    it('is read once for two layers and the editor', async () => {
        fake.assets[SEGMENTS_ASSET] = segmentsAsset(VALID_BANDS, {})

        await onAnotherMap({selection: {type: 'ASSET', id: SEGMENTS_ASSET}, layers: [CHANGES, CHANGES_AGAIN], editor: true})

        expect(metadataReads()).toBe(1)
        expect(previews.constructed).toHaveLength(2)
    })

    it('stays watched while one of them closes, without being read again', async () => {
        await onAnotherMap({selection: {type: 'ASSET', id: SEGMENTS_ASSET}, layers: [CHANGES, CHANGES_AGAIN]})
        const owner = runtime.evidenceOwnerOf(ALERTS)

        await show({layers: [CHANGES]})

        expect(runtime.evidenceOwnerOf(ALERTS)).toBe(owner)
        expect(metadataReads()).toBe(1)
        expect(gate('IMAGE_OUTPUT')).toBe(null)
    })

    it('is let go with the last: its read is cancelled, and the records it loaded are released', async () => {
        fake.stored = storedRecords(['asset-mosaic-1'])
        await onAnotherMap({selection: ref('asset-mosaic-1'), unloaded: ['asset-mosaic-1']})
        expect(loaded()).toContain('asset-mosaic-1')
        const evidence = alertsRecipe().ui.sourceEvidence
        fake.heldMetadata = []
        await act(async () => replaceCredentials())
        expect(fake.heldMetadata).toHaveLength(1)

        await show({layers: [], held: true})
        await answerHeldReads()

        expect(runtime.evidenceOwnerOf(ALERTS)).toBe(null)
        expect(alertsRecipe().ui.sourceEvidence).toBe(evidence)
        expect(loaded()).not.toContain('asset-mosaic-1')
    })
})

describe('the editor opened over evidence a map already obtained', () => {
    const ASSET = {type: 'ASSET', id: SEGMENTS_ASSET}

    beforeEach(() => {
        fake.assets[SEGMENTS_ASSET] = segmentsAsset(VALID_BANDS, {dateFormat: 2, recipe_sources: JSON.stringify(EXPORTED_SOURCES)})
    })

    it('applies the monitoring settings it proposes, without reading the reference again', async () => {
        await onAnotherMap({selection: ref('asset-mosaic-1')})

        await show({editor: true})

        expect(alertsRecipe().model.sources.dataSets).toEqual(EXPORTED_SOURCES.dataSets)
        expect(metadataReads()).toBe(1)
    })

    // Configured beside an asset selection, the representation is the selection's own; the editor seeds it as it would
    // on the first answer it saw.
    it('seeds the date representation of an asset it had no answer for', async () => {
        await onAnotherMap({selection: ASSET})

        await show({editor: true})

        expect(alertsRecipe().model.reference.dateFormat).toBe(2)
    })

    it('leaves what the user edited since alone when it is opened again', async () => {
        await onAnotherMap({selection: ASSET, editor: true})
        await act(async () => store.dispatch(set(['process', 'loadedRecipes', ALERTS, 'model', 'sources', 'band'], 'nbr')))

        await show({editor: false})
        await show({editor: true})

        expect(alertsRecipe().model.sources.band).toBe('nbr')
    })

    it('writes them once, however the store is notified while they are applied', async () => {
        await onAnotherMap({selection: ref('asset-mosaic-1')})
        const models = [alertsRecipe().model]
        const unsubscribe = store.subscribe(() => {
            const model = alertsRecipe()?.model
            if (model !== models.at(-1)) {
                models.push(model)
                store.dispatch({type: 'UNRELATED'})
            }
        })

        await show({editor: true})
        unsubscribe()

        expect(models).toHaveLength(2)
        expect(models[1].sources.dataSets).toEqual(EXPORTED_SOURCES.dataSets)
        expect(metadataReads()).toBe(1)
    })
})

describe('evidence published for alerts the session no longer holds', () => {
    it('does not bring their record back', async () => {
        fake.heldMetadata = []
        await onAnotherMap({selection: {type: 'ASSET', id: SEGMENTS_ASSET}})

        await act(async () => store.dispatch(set(['process', 'loadedRecipes'], without(store.getState().process.loadedRecipes, ALERTS))))
        await answerHeldReads()

        expect(alertsRecipe()).toBeUndefined()
    })
})

describe('a dependency the user closed while its save is still settling', () => {
    it('is read as the draft it is, neither replaced nor let go by the watch', async () => {
        const draft = {...RECORDS.find(({id}) => id === 'masking-ccdc'), name: 'Edited, not yet saved'}
        fake.stored = storedRecords(['masking-ccdc'])
        await onAnotherMap({selection: ref('masking-ccdc'), saving: {'masking-ccdc': draft}})

        await show({layers: []})

        expect(store.getState().process.loadedRecipes['masking-ccdc']).toBe(draft)
        expect(fake.calls).not.toContainEqual(['loadRecipe', 'masking-ccdc'])
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
    ])('authorizes nothing on what was read before %s, and is authorized once the reference is read anew', async (_case, change) => {
        const selection = _case.startsWith('a recipe') ? ref('masking-ccdc') : {type: 'ASSET', id: SEGMENTS_ASSET}
        fake.heldVersions = _case.startsWith('the asset') ? [] : null
        await editor({selection})
        answerVersions()
        await settled()
        expect(decision()).toBe('RETRIEVABLE')
        const before = authorizedBy()

        act(() => {
            change()
            expect(authorizedBy()).not.toBe(before)
        })

        fake.versions[SEGMENTS_ASSET] = 'v2'
        // A mutation's first follow-up read is scheduled on the clock, not as a promise.
        for (let follow = 0; follow < 5; follow++) {
            answerVersions()
            await act(async () => new Promise(resolve => setTimeout(resolve, 0)))
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

describe('a Retrieve whose recipe nothing else watches', () => {
    it('has the reference read for it, and is authorized once it is known to suit', async () => {
        await editor({selection: ref('masking-ccdc'), owner: false})

        expect(decision()).toBe('RETRIEVABLE')
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

// An image asset as /assetMetadata answers for it: each band's grid as `dimensions`, its array rank on its type.
function segmentsAsset(bands, properties = {dateFormat: 1}) {
    return {
        type: 'Image',
        bandNames: bands.map(([name]) => name),
        bands: bands.map(([id, rank]) => ({
            id, crs: 'EPSG:4326', dimensions: [5015, 3093], data_type: {type: 'PixelType', precision: 'double', ...(rank && {dimensions: rank})}
        })),
        properties
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

// The session as it stands when the alerts are shown: their record and the recipes they may read, less any the session
// does not hold, and with any closed while a save of theirs is still settling - towards a revision the listing
// already names.
const sessionState = ({selection, tabs, unloaded = [], saving = {}}) => ({
    user: {currentUser: {googleTokens: {accessToken: 'token'}}},
    process: {
        loadedRecipes: {
            [ALERTS]: {id: ALERTS, type: 'CHANGE_ALERTS', revision: 1, model: alertsModel(selection), ui: {initialized: true}},
            ...Object.fromEntries(RECORDS.filter(({id}) => !unloaded.includes(id)).map(record => [record.id, record])),
            ...saving
        },
        recipes: LISTING.map(summary => saving[summary.id] ? {...summary, revision: 2} : summary),
        recipeListing: {checkedAt: Date.now()},
        saveStates: Object.fromEntries(Object.keys(saving).map(id => [id, {status: 'SAVING', revision: 2, model: saving[id].model}])),
        projects: [],
        tabs
    },
    assets: {user: [{id: SEGMENTS_ASSET, updateTime: 'T1'}], other: []},
    dimensions: {width: 1024, height: 768}
})

function alertsModel(selection) {
    return {
        reference: selection,
        sources: {band: 'ndvi', dataSets: {LANDSAT: ['NDVI']}},
        options: {corrections: []},
        date: {monitoringEnd: '2024-01-01', monitoringDuration: 1, monitoringDurationUnit: 'months', calibrationDuration: 2, calibrationDurationUnit: 'months'}
    }
}

const editor = async ({selection, owner = true, chart = false, layer = false, section = false}) => {
    const initialState = sessionState({selection, tabs: [{id: ALERTS}]})
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
                    {section ? <SelectedSourceStatus section='reference' type={selection.type} id={selection.id}/> : null}
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

// The alerts shown in another recipe's map, their own editor closed unless asked for. `show` mounts what is shown now:
// layers of the alerts, and the editor, whose tab is opened and closed with it. The record is held while layers are
// shown, or while `held` - as a layer list naming them would.
const HOST = 'host-1'
let shown

const onAnotherMap = async ({selection, layers = [CHANGES], editor = false, unloaded, saving}) => {
    const initialState = sessionState({selection, tabs: [{id: HOST}], unloaded, saving})
    store = createStore((state = initialState, action) => action.reduce ? action.reduce(state) : state)
    initStore(store)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    shown = {layers: [], editor: false}
    await show({layers, editor})
}

const show = async next => {
    shown = {...shown, ...next}
    const tabs = [{id: HOST}, ...shown.editor ? [{id: ALERTS}] : []]
    await act(async () => {
        store.dispatch(set(['process', 'tabs'], tabs))
        root.render(
            <Provider store={store}>
                <SourceRuntimeProvider>
                    <RuntimeProbe/>
                    {shown.layers.length || shown.held ? <LayerSources/> : null}
                    <TabContext id={HOST} busyIn$={new Subject()}>
                        {shown.layers.map((layerConfig, index) => (
                            <RecipeImageLayer
                                key={index}
                                source={{id: `alerts-layer-${index}`, sourceConfig: {recipeId: ALERTS}}}
                                layerConfig={layerConfig}
                                map={{}}
                            />
                        ))}
                    </TabContext>
                    {shown.editor
                        ? (
                            <Recipe id={ALERTS}>
                                <SourceEvidenceSync observation={changeAlertsObservation}/>
                            </Recipe>
                        )
                        : null}
                </SourceRuntimeProvider>
            </Provider>
        )
    })
    await settled()
}

// What holds the alerts' record while their layers are shown, as the map's layer sources do.
const LayerSources = compose(({usingRecipe}) => {
    usingRecipe(ALERTS)
    return null
}, recipeAccess())

const CHANGES = {visualizationType: 'changes', mosaicType: 'latest', visParams: {type: 'continuous', bands: ['confidence']}}
const CHANGES_AGAIN = {...CHANGES, visParams: {...CHANGES.visParams, min: [0]}}

const EXPORTED_SOURCES = {dataSets: {LANDSAT: ['NDVI', 'NBR']}}

const storedRecords = ids => Object.fromEntries(RECORDS.filter(({id}) => ids.includes(id)).map(record => [record.id, record]))

const loaded = () => Object.keys(store.getState().process.loadedRecipes)

const without = (object, key) => Object.fromEntries(Object.entries(object).filter(([id]) => id !== key))

const settled = () => act(async () => {})

const answerHeldLoads = async () => {
    const held = fake.heldLoads
    fake.heldLoads = null
    act(() => held.forEach(answer => answer()))
    await settled()
}

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

// The observation whose evidence a submission now would be authorized on, if any. Updates are synchronous with the
// change, so an observation over records the session holds may already have read them anew.
const authorizedBy = () => decisionAtApply() === 'RETRIEVABLE' ? alertsRecipe().ui.sourceEvidence.observationId : null

const metadataReads = () => fake.calls.filter(([name]) => name === 'assetMetadata').length

// The messages shown, by type and text.
const messages = () => [...container.querySelectorAll('div')]
    .filter(element => /type-/.test(element.className))
    .map(element => ({type: element.className.match(/type-([a-z]+)/)[1], text: element.textContent}))

const layerMessages = () => messages()

const sectionMessage = () => messages()[0]?.type
