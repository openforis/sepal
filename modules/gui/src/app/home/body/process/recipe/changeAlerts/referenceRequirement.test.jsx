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
import widgetStyles from '~/widget/widget.module.css'

// Whether Change Alerts' reference authorizes Retrieve, composed as its editor composes it: the evidence lifecycle
// mounted beside a Retrieve, over a real store and source runtime. Earth Engine and storage are faked.

const fake = vi.hoisted(() => ({
    assets: {}, failing: new Set(), heldMetadata: null, failingPicker: new Set(), heldPickerMetadata: null, versions: {},
    heldVersions: null, missingVersions: new Set(), calls: [], segmentRequests: [], stored: {}, heldLoads: null,
    failingLoads: new Set(), segmentBands: [], observationBands: [], graphs: [], heldObservations: null,
    cancelledObservations: []
}))
vi.mock('~/apiRegistry', async () => {
    const {Observable, of, throwError} = await import('rxjs')
    const read$ = (asset, {held, failing}) => {
        if (held) {
            return new Observable(subscriber => {
                held.push(() => {
                    subscriber.next(fake.assets[asset])
                    subscriber.complete()
                })
            })
        }
        return failing.has(asset)
            ? throwError(() => new Error('Earth Engine unreachable'))
            : of(fake.assets[asset])
    }
    return {default: {
        gee: {
            // The asset picker's read - for the date representation it prefills - names the types it allows; the evidence's
            // does not. They are told apart, and held or failed apart.
            assetMetadata$: ({asset, allowedTypes}) => {
                if (allowedTypes) {
                    fake.calls.push(['pickerMetadata', asset])
                    return read$(asset, {held: fake.heldPickerMetadata, failing: fake.failingPicker})
                }
                fake.calls.push(['assetMetadata', asset])
                return read$(asset, {held: fake.heldMetadata, failing: fake.failing})
            },
            datasets$: () => of({community: {datasets: [], matchingResults: 0}, gee: {datasets: [], matchingResults: 0}}),
            bands$: ({asset}) => {
                fake.calls.push(['bands', asset])
                return throwError(() => new Error('Unexpected band request'))
            },
            // A pixel's segments as Earth Engine answers for them: the segment bands and, per band asked for, its fit.
            loadCCDCSegments$: ({recipe, bands}) => {
                fake.segmentRequests.push(recipe)
                fake.segmentBands.push(...bands)
                return of({
                    tStart: [2018], tEnd: [2024], tBreak: [0], numObs: [100], changeProb: [0],
                    ...Object.fromEntries(bands.flatMap(band => [
                        [`${band}_coefs`, [[0.1, 0, 0, 0, 0, 0, 0, 0]]], [`${band}_rmse`, [0.1]], [`${band}_magnitude`, [0]]
                    ]))
                })
            },
            loadTimeSeriesObservations$: ({bands}) => {
                fake.observationBands.push(...bands)
                if (!fake.heldObservations) {
                    return of([])
                }
                return new Observable(subscriber => {
                    let answered = false
                    fake.heldObservations.push(() => {
                        answered = true
                        subscriber.next([])
                        subscriber.complete()
                    })
                    return () => answered || fake.cancelledObservations.push(...bands)
                })
            },
            assetVersions$: ({ids}) => {
                fake.calls.push(['assetVersions', ids])
                const answer = () => ({assets: ids.map(id => fake.missingVersions.has(id)
                    ? {id, failure: {kind: 'DEFINITIVE', code: 'NOT_FOUND'}}
                    : {id, type: 'IMAGE', version: fake.versions[id] ?? 'v1'})})
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
// The editor's panels open with it, and close as they do when cancelled or applied; how they get opened is not what
// this exercises.
const panelActivations = vi.hoisted(() => ({}))
vi.mock('~/widget/activation/activatable', async () => {
    const {useState} = await import('react')
    return {
        withActivatable: ({id} = {}) => Component => props => {
            const [active, setActive] = useState(true)
            panelActivations[id] = () => setActive(true)
            return active
                ? <Component {...props} activatable={{active, activate: () => setActive(true), deactivate: () => setActive(false)}}/>
                : null
        }
    }
})
// Filled in once the modules registering these are imported: importing them from within the mock would never resolve.
// The map area menu's own activators open the visualization editor; nothing here opens it.
// A toolbar action's activator opens its panel: what it opens is recorded.
const opened = vi.hoisted(() => [])
vi.mock('~/widget/activation/activator', () => ({
    withActivators: (...ids) => Component => props => {
        const activatables = Object.fromEntries(ids
            .filter(id => id && typeof id === 'object' && !Array.isArray(id))
            .flatMap(Object.entries)
            .map(([key, idOf]) => [key, {active: false, canActivate: true, toggle: () => opened.push(idOf(props))}]))
        return <Component {...props} activator={{activatables}}/>
    }
}))
const registry = vi.hoisted(() => ({}))
vi.mock('~/app/home/body/process/recipeTypeRegistry', () => ({getRecipeType: type => registry[type]}))
vi.mock('../ccdc/ccdcRecipe', () => ({getAllVisualizations: () => []}))
vi.mock('~/app/home/user/userDetails', () => ({userDetailsHint: () => {}}))
// A tooltip's text is rendered where it is attached, to be read without hovering.
vi.mock('~/widget/tooltip', () => ({
    Tooltip: ({msg, disabled, children}) => msg && !disabled && typeof msg !== 'function'
        ? <span data-tooltip={JSON.stringify([msg].flat().filter(Boolean))}>{children}</span>
        : children
}))
// The graph renderer is the chart's output boundary: what it is given to draw is recorded.
vi.mock('../ccdc/ccdcGraph', () => ({
    CCDCGraph: props => {
        fake.graphs.push(props)
        return null
    }
}))
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
const {referenceRequirements} = await import('./referenceRequirement')
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
const {VisualizationSelector} = await import('~/app/home/map/imageLayerSource/visualizationSelector')
const {MapAreaContext} = await import('~/app/home/map/mapAreaContext')
const {Reference} = await import('./panels/reference/reference')
const {Sources} = await import('./panels/sources/sources')
const {EventShield} = await import('~/widget/eventShield')
const {ChartPixelButton} = await import('../chartPixelButton')
const {RetrieveButton} = await import('../retrieveButton')
const {MapContext} = await import('~/app/home/map/mapContext')
const {Toolbar} = await import('~/widget/toolbar/toolbar')
const {observedBands} = await import('./monitoringData')

// Change Alerts' own layer form is replaced by one that reports the layer it is given to draw, and shows the selector
// every layer form shows, where a layer says what is known of its sources.
addRecipeImageLayer('CHANGE_ALERTS', ({layer, source, recipe}) => {
    previews.shown = layer
    return (
        <MapAreaContext mapArea={{area: 'center', updateLayerConfig: () => {}}}>
            <VisualizationSelector source={source} recipe={recipe}/>
        </MapAreaContext>
    )
})

registry.CHANGE_ALERTS = {sourceRequirements: referenceRequirements, sourceObservation: changeAlertsObservation, mapProducts, observedBands}
registry.CCDC = {id: 'CCDC', describeSegments$}

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const ALERTS = 'alerts-1'
const SEGMENTS_ASSET = 'users/x/segments'
const RADAR_ASSET = 'users/x/radar-segments'
const RED_EDGE_ASSET = 'users/x/red-edge-segments'
const CIRRUS_ASSET = 'users/x/cirrus-segments'
const UNMONITORABLE_ASSET = 'users/x/canopy-height-segments'

let root, container, store, retrieve, runtime

beforeEach(() => {
    fake.assets = {[SEGMENTS_ASSET]: segmentsAsset(VALID_BANDS)}
    fake.segmentRequests = []
    previews.constructed = []
    previews.shown = undefined
    fake.failing = new Set()
    fake.heldMetadata = null
    fake.failingPicker = new Set()
    fake.heldPickerMetadata = null
    fake.versions = {}
    fake.heldVersions = null
    fake.missingVersions = new Set()
    fake.calls = []
    fake.stored = {}
    fake.heldLoads = null
    fake.failingLoads = new Set()
    fake.segmentBands = []
    fake.observationBands = []
    fake.graphs = []
    fake.heldObservations = null
    fake.cancelledObservations = []
    selecting.listener = null
    selecting.charted = []
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
    it('say on the layer\'s selector which recipe cannot be rendered, and which of its sections to review', async () => {
        await onAnotherMap({selection: ref('masking-mosaic')})

        expect(previews.constructed).toEqual([])
        expect(errorsOf(LAYER_SELECTOR)).toEqual([expect.stringContaining('map.layerSource.held')])
        expect(errorsOf(LAYER_SELECTOR)[0]).toContain('Alerts')
        expect(errorsOf(LAYER_SELECTOR)[0]).toContain('process.changeAlerts.panel.reference.button')
        expect(errorsOf(LAYER_SELECTOR)[0]).not.toContain('process.source.status')
    })

    it('say so when no reference is selected', async () => {
        await onAnotherMap({selection: {}})

        expect(errorsOf(LAYER_SELECTOR)).toEqual([expect.stringContaining('map.layerSource.held')])
    })

    it('stop saying it, and are drawn, once a suitable reference is selected', async () => {
        await onAnotherMap({selection: ref('masking-mosaic')})

        await act(async () => store.dispatch(set(['process', 'loadedRecipes', ALERTS, 'model', 'reference'], ref('masking-ccdc'))))
        await settled()

        expect(errorsOf(LAYER_SELECTOR)).toEqual([])
        expect(previews.constructed).toHaveLength(1)
    })

    it('show the selector busy while the reference is checked, explaining why, and keep it mounted throughout', async () => {
        fake.heldMetadata = []
        await onAnotherMap({selection: {type: 'ASSET', id: SEGMENTS_ASSET}})
        const selector = field(LAYER_SELECTOR)
        expect(isBusy(LAYER_SELECTOR)).toBe(true)
        expect(explanationOf(LAYER_SELECTOR)).toEqual([expect.stringContaining('map.layerSource.checkingSection')])
        expect(errorsOf(LAYER_SELECTOR)).toEqual([])

        await answerHeldReads()

        expect(isBusy(LAYER_SELECTOR)).toBe(false)
        expect(isChecking(LAYER_SELECTOR)).toBe(false)
        expect(field(LAYER_SELECTOR)).toBe(selector)
    })

    // The mosaics resolve the reference through its provider chain alone, which an asset selected directly satisfies.
    it('say nothing for a product of theirs the requirement does not hold, which is drawn', async () => {
        fake.assets[SEGMENTS_ASSET] = segmentsAsset([['ndvi_rmse', 1]])
        const MOSAIC = {visualizationType: 'monitoring', mosaicType: 'latest', visParams: {type: 'rgb', bands: ['red', 'green', 'blue']}}

        await onAnotherMap({selection: {type: 'ASSET', id: SEGMENTS_ASSET}, layers: [MOSAIC]})

        expect(errorsOf(LAYER_SELECTOR)).toEqual([])
        expect(isBusy(LAYER_SELECTOR)).toBe(false)
        expect(gate('COLLECTION_MOSAIC')).toBe(null)
        expect(previews.constructed).toHaveLength(1)
    })
})

// In the recipe's own map, what holds a layer back is said by the section that holds it, on its fields and toolbar.
describe('alerts shown in their own editor while their reference holds them', () => {
    it('leave the layer\'s selector without the section\'s diagnosis', async () => {
        await editor({selection: ref('masking-mosaic'), layer: true})

        expect(previews.constructed).toEqual([])
        expect(Object.keys(sourceProblems())).toContain('reference')
        expect(errorsOf(LAYER_SELECTOR)).toEqual([])
    })
})

// REF judged as it is edited, in the editor's own panel, before it is applied: by the requirements the reference the
// alerts hold is judged by, and without touching the alerts. What it finds is said on the input the reference is
// selected in.
describe('a reference edited in REF', () => {
    const ASSET = {type: 'ASSET', id: SEGMENTS_ASSET}

    beforeEach(() => {
        fake.assets[RADAR_ASSET] = segmentsAsset(VALID_BANDS)
    })

    it('is refused before Apply when it cannot supply segments, said on its input, and the alerts keep their reference', async () => {
        await editor({selection: ASSET, panels: ['reference']})

        await selectRecipe('Forest mask')
        await apply()

        expect(errorsOf(RECIPE_INPUT)).toEqual([expect.stringContaining('process.source.status.notAProducer')])
        expect(applyEnabled()).toBe(false)
        expect(committedReference()).toMatchObject(ASSET)
    })

    it('is applied when it suits, even where the reference the alerts hold does not', async () => {
        await editor({selection: ref('masking-mosaic'), panels: ['reference']})
        expect(errorsOf(RECIPE_INPUT)).toEqual([expect.stringContaining('process.source.status.notAProducer')])

        await selectAsset(SEGMENTS_ASSET)
        expect(errorsOf(ASSET_INPUT)).toEqual([])
        await apply()

        expect(committedReference()).toMatchObject(ASSET)
    })

    it('shows itself busy while it is checked, explaining why, and is held back until it is known to suit', async () => {
        await editor({selection: ASSET, panels: ['reference']})
        fake.heldMetadata = []

        await selectAsset(RADAR_ASSET)
        await apply()

        expect(isBusy(ASSET_INPUT)).toBe(true)
        expect(explanationOf(ASSET_INPUT)).toEqual(['process.source.status.checking'])
        expect(committedReference()).toMatchObject(ASSET)
        await answerHeldReads()
        expect(isBusy(ASSET_INPUT)).toBe(false)
        expect(isChecking(ASSET_INPUT)).toBe(false)
        expect(applyEnabled()).toBe(true)
    })

    it.each([
        ['when it cannot be read', 'process.source.status.assetUnavailable', true, () => fake.failing.add(RADAR_ASSET)],
        [
            'when its metadata does not establish the layout', 'process.source.segments.undetermined', false,
            () => fake.assets[RADAR_ASSET] = segmentsAsset(VALID_BANDS.map(([name]) => [name, null]))
        ]
    ])('is held back %s, with that as its error', async (_case, diagnostic, refresh, arrange) => {
        await editor({selection: ASSET, panels: ['reference']})
        arrange()

        await selectAsset(RADAR_ASSET)
        await apply()

        expect(errorsOf(ASSET_INPUT)).toContainEqual(expect.stringContaining(diagnostic))
        expect(offersRefresh(ASSET_INPUT)).toBe(refresh)
        expect(committedReference()).toMatchObject(ASSET)
    })

    // The asset picker reads the asset too, and prefills its date representation from what it reads: the edit changes
    // again while the reference is checked.
    it('settles once its date representation is prefilled while it is checked, replacing a recipe the alerts held', async () => {
        await editor({selection: ref('masking-ccdc'), panels: ['reference']})
        fake.heldVersions = []
        fake.heldPickerMetadata = []

        await selectAsset(RADAR_ASSET)
        await answerPickerReads()
        answerVersions()
        await settled()

        expect(isBusy(ASSET_INPUT)).toBe(false)
        expect(isChecking(ASSET_INPUT)).toBe(false)
        await apply()
        expect(committedReference()).toEqual({type: 'ASSET', id: RADAR_ASSET, dateFormat: 1})
    })

    it('counts only the reference last chosen, whatever answers late', async () => {
        const LAST = 'users/x/other-segments'
        fake.assets['users/x/scalars'] = segmentsAsset(VALID_BANDS.map(([name]) => [name, 0]))
        fake.assets[LAST] = segmentsAsset(VALID_BANDS)
        await editor({selection: ASSET, panels: ['reference']})
        fake.heldMetadata = []
        await selectAsset('users/x/scalars')
        await selectAsset(LAST)

        await answerHeldReads()
        expect(errorsOf(ASSET_INPUT)).toEqual([])
        await apply()

        expect(committedReference()).toMatchObject({type: 'ASSET', id: LAST})
    })

    it('is let go on Cancel: what answers later reaches neither the panel nor the alerts', async () => {
        await editor({selection: ASSET, panels: ['reference']})
        const evidence = alertsRecipe().ui.sourceEvidence
        fake.heldMetadata = []
        await selectAsset(RADAR_ASSET)

        await cancel()
        await answerHeldReads()

        expect(committedReference()).toMatchObject(ASSET)
        expect(alertsRecipe().ui.sourceEvidence).toBe(evidence)
    })

    it('is refused at Apply once what it was read on has moved, at that very moment', async () => {
        await editor({selection: ASSET, panels: ['reference']})
        await selectAsset(RADAR_ASSET)
        fake.heldMetadata = []

        act(() => {
            replaceCredentials()
            panelButton('button.apply').click()
        })

        expect(committedReference()).toMatchObject(ASSET)
    })

    // The token the edit's evidence was read at is learned after it answered; a token that differs from it is a change.
    it('is refused at Apply once its asset\'s token changes, before the source runtime has reacted to it', async () => {
        await editor({selection: ASSET, panels: ['reference']})
        fake.heldVersions = []
        await selectAsset(RADAR_ASSET)
        answerVersions()
        await settled()
        expect(applyEnabled()).toBe(true)

        act(() => beforeTheRuntimeReacts(
            () => tokenRead(RADAR_ASSET, 'v2'),
            () => panelButton('button.apply').click()
        ))

        expect(committedReference()).toMatchObject(ASSET)
    })

    it('leaves the alerts, their evidence and their drawing as they are until it is applied', async () => {
        await editor({selection: ASSET, panels: ['reference'], layer: true})
        const {model, ui: {sourceEvidence}} = alertsRecipe()
        const drawn = previews.shown

        await selectAsset(RADAR_ASSET)

        expect(alertsRecipe().model).toBe(model)
        expect(alertsRecipe().ui.sourceEvidence).toBe(sourceEvidence)
        expect(previews.shown).toBe(drawn)
        expect(previews.constructed).toEqual([drawn])
    })

    // The configured date representation is part of the selection: evidence read for one is not the other's.
    it('is read again for another date representation of the same asset, and not for the one the alerts hold', async () => {
        await editor({selection: {...ASSET, dateFormat: 1}, panels: ['reference']})
        const reads = metadataReads()

        await chooseDateFormat('unixTimeMillis')
        expect(metadataReads()).toBe(reads + 1)
        expect(errorsOf(ASSET_INPUT)).toEqual([])

        await chooseDateFormat('fractionalYears')
        expect(metadataReads()).toBe(reads + 1)
        expect(errorsOf(ASSET_INPUT)).toEqual([])
    })

    it.each([
        ['could not be read', 'assetUnavailable', fake => fake.failing],
        ['was found missing', 'assetMissing', fake => fake.missingVersions]
    ])('that %s is read again on Refresh, beside its label, and the reference the alerts hold is not', async (_case, diagnostic, failures) => {
        await editor({selection: ASSET, panels: ['reference']})
        failures(fake).add(RADAR_ASSET)
        await selectAsset(RADAR_ASSET)
        expect(errorsOf(ASSET_INPUT)).toEqual([expect.stringContaining(`process.source.status.${diagnostic}`)])
        const committedReads = metadataReads(SEGMENTS_ASSET)

        failures(fake).delete(RADAR_ASSET)
        await refresh(ASSET_INPUT)

        expect(errorsOf(ASSET_INPUT)).toEqual([])
        expect(metadataReads(SEGMENTS_ASSET)).toBe(committedReads)
        await apply()
        expect(committedReference()).toMatchObject({type: 'ASSET', id: RADAR_ASSET})
    })

    it('whose records could not be read is read again on Refresh, and the reference the alerts hold is not', async () => {
        fake.failingLoads = new Set(['masking-ccdc'])
        await editor({selection: ASSET, panels: ['reference'], unloaded: ['masking-ccdc', 'ccdc-1']})
        await selectRecipe('Masked CCDC')
        expect(errorsOf(RECIPE_INPUT)).toEqual([expect.stringContaining('process.source.status.unavailable')])
        const committedReads = metadataReads(SEGMENTS_ASSET)

        fake.failingLoads.clear()
        fake.stored = storedRecords(['masking-ccdc', 'ccdc-1'])
        await refresh(RECIPE_INPUT)

        expect(errorsOf(RECIPE_INPUT)).toEqual([])
        expect(metadataReads(SEGMENTS_ASSET)).toBe(committedReads)
    })

    // What the input's own constraints and the asset picker say come first; what the requirements say follows.
    it('says the asset picker\'s own error first, for an asset it could not load', async () => {
        await editor({selection: ASSET, panels: ['reference']})
        fake.failingPicker.add(RADAR_ASSET)
        fake.failing.add(RADAR_ASSET)

        await selectAsset(RADAR_ASSET)

        expect(errorsOf(ASSET_INPUT)).toEqual([
            'widget.assetInput.loadError',
            expect.stringContaining('process.source.status.assetUnavailable')
        ])
        expect(applyEnabled()).toBe(false)
    })
})

// The reference supplies segments; which of their measures the alerts monitor, and in what data, are settings of Sources,
// judged there and said on the setting to change. A reference no monitoring data Sources offers observes is refused in
// REF; one only other monitoring settings observe is applied, and REF says, once, which sections then need attention.
describe('a reference replaced by one that fits other measures', () => {
    beforeEach(() => {
        fake.assets[RADAR_ASSET] = segmentsAsset(RADAR_BANDS)
    })

    it('is refused in REF where no monitoring data Sources offers observes any of its measures', async () => {
        fake.assets[UNMONITORABLE_ASSET] = segmentsAsset([...SEGMENT_BANDS, ...measureBands('canopyHeight')])
        await editor({selection: {type: 'ASSET', id: SEGMENTS_ASSET}, panels: ['reference']})

        await selectAsset(UNMONITORABLE_ASSET)

        expect(errorsOf(ASSET_INPUT)).toEqual([expect.stringContaining('process.source.segments.noMonitorableMeasure')])
        expect(warningsOf(ASSET_INPUT)).toEqual([])
        expect(applyEnabled()).toBe(false)
    })

    it('is applied in REF while Sources monitors other data, advising once that Sources needs attention', async () => {
        await editor({selection: {type: 'ASSET', id: SEGMENTS_ASSET}, panels: ['reference']})

        await selectAsset(RADAR_ASSET)
        expect(errorsOf(ASSET_INPUT)).toEqual([])
        expect(warningsOf(ASSET_INPUT)).toEqual([expect.stringContaining('process.source.status.sectionsIncompatible')])
        expect(warningsOf(ASSET_INPUT)[0]).toContain(SOURCES_SECTION)
        expect(warningsOf(ASSET_INPUT)[0]).not.toContain('process.source.segments')
        await apply()

        expect(committedReference()).toMatchObject({type: 'ASSET', id: RADAR_ASSET})
        expect(gate('IMAGE_OUTPUT')).toMatchObject({code: 'SOURCE_UNSUITABLE', section: SOURCES_SECTION})
        expect(Object.keys(sourceProblems())).toEqual(['sources'])
    })

    // Sources' fields say nothing of it; its toolbar button is marked, saying which setting to change.
    it('leaves Sources marked, saying to choose a monitoring type that observes one of its measures', async () => {
        await editor({selection: {type: 'ASSET', id: RADAR_ASSET}, panels: ['sources']})

        expect(sourceProblems().sources).toContain('process.source.segments.noAvailableMeasure')
        expect(gate('IMAGE_OUTPUT')).toMatchObject({code: 'SOURCE_UNSUITABLE', section: SOURCES_SECTION})
    })

    // The band chosen for other data is no longer offered once the type changes, so none is chosen.
    it('holds Sources\' Apply back while no band is chosen, as a required choice does', async () => {
        await editor({selection: {type: 'ASSET', id: RADAR_ASSET}, panels: ['sources']})

        await chooseButton(RADAR_TYPE)

        expect(applyEnabled()).toBe(false)
    })

    it('says to choose other data sets, where others of the type observe one of its measures', async () => {
        fake.assets[RED_EDGE_ASSET] = segmentsAsset([...SEGMENT_BANDS, ...measureBands('redEdge1')])

        await editor({selection: {type: 'ASSET', id: RED_EDGE_ASSET}, panels: ['sources']})

        expect(sourceProblems().sources).toContain('process.source.segments.noObservedMeasure')
    })

    // Landsat observes cirrus top of atmosphere, and no optical data set does corrected to surface reflectance: other
    // data sets cannot help, the correction set in pre-processing can.
    it('says the same where only the processing the data sets are set to keeps them from observing its measures', async () => {
        fake.assets[CIRRUS_ASSET] = segmentsAsset([...SEGMENT_BANDS, ...measureBands('cirrus')])
        await editor({selection: {type: 'ASSET', id: CIRRUS_ASSET}, panels: ['sources']})
        await act(async () => store.dispatch(set(['process', 'loadedRecipes', ALERTS, 'model', 'sources', 'band'], 'cirrus')))
        expect(sourceProblems()).toEqual({})

        await act(async () => store.dispatch(set(['process', 'loadedRecipes', ALERTS, 'model', 'options', 'corrections'], ['SR'])))

        expect(sourceProblems().sources).toContain('process.source.segments.noObservedMeasure')
    })

    it('is repaired in Sources by a type and band that observe it, judged from its evidence, and then needs no attention', async () => {
        await editor({selection: {type: 'ASSET', id: RADAR_ASSET}, panels: ['sources']})
        const reads = metadataReads()
        expect(referenceStatus().advisories).toHaveLength(1)

        await chooseButton(RADAR_TYPE)
        await chooseButton('VV')
        await apply()

        expect(metadataReads()).toBe(reads)
        expect(alertsRecipe().model.sources).toMatchObject({dataSetType: 'RADAR', band: 'VV'})
        expect(sourceProblems()).toEqual({})
        expect(referenceStatus()).toBe(null)
        expect(gate('IMAGE_OUTPUT')).toBe(null)
    })
})

// The segment chart plots more of each segment than the alerts read. What it cannot plot gates the chart, and is said
// in REF as a warning beside - never instead of - what the alerts need.
describe('a reference the alerts can use but a segment chart cannot plot', () => {
    it('is accepted, with the chart\'s problem a warning in REF, and gates the chart alone', async () => {
        fake.assets[SEGMENTS_ASSET] = segmentsAsset(SLICEABLE_ONLY_BANDS)

        await editor({selection: {type: 'ASSET', id: SEGMENTS_ASSET}, panels: ['reference']})

        expect(errorsOf(ASSET_INPUT)).toEqual([])
        expect(warningsOf(ASSET_INPUT)).toEqual([expect.stringContaining('process.source.operation.PIXEL_SEGMENTS')])
        expect(applyEnabled()).toBe(true)
        expect(sourceProblems()).toEqual({})
        expect(gate('IMAGE_OUTPUT')).toBe(null)
        expect(gate('COLLECTION_MOSAIC')).toBe(null)
        expect(gate('PIXEL_SEGMENTS')).toMatchObject({code: 'SOURCE_UNSUITABLE'})
    })

    it('says the chart\'s problem apart from a refusal of the reference itself, which alone holds REF back', async () => {
        fake.assets['users/x/scalar-beside'] = segmentsAsset([...SLICEABLE_ONLY_BANDS, ['ndvi_intercept', 0]])
        await editor({selection: {type: 'ASSET', id: SEGMENTS_ASSET}, panels: ['reference']})

        await selectAsset('users/x/scalar-beside')
        await apply()

        expect(errorsOf(ASSET_INPUT)[0]).toContain('process.source.segments.incompatible')
        expect(warningsOf(ASSET_INPUT)).toEqual([expect.stringContaining('process.source.operation.PIXEL_SEGMENTS')])
        expect(committedReference()).toMatchObject({type: 'ASSET', id: SEGMENTS_ASSET})
    })
})

describe('the band a segment chart plots', () => {
    it('is replaced by one it can plot once the one charted can no longer be, which is not requested again', async () => {
        fake.assets[SEGMENTS_ASSET] = segmentsAsset([...SEGMENT_BANDS, ...measureBands('ndvi'), ...measureBands('nbr')])
        await editor({selection: {type: 'ASSET', id: SEGMENTS_ASSET}, chart: true})
        expect(fake.segmentBands.at(-1)).toBe('ndvi')
        fake.segmentBands = []
        fake.observationBands = []

        fake.assets[SEGMENTS_ASSET] = segmentsAsset([...SEGMENT_BANDS, ['ndvi_coefs', 2], ['ndvi_rmse', 1], ...measureBands('nbr')])
        await act(async () => replaceCredentials())
        await settled()

        expect(fake.segmentBands).toEqual(['nbr'])
        expect(fake.observationBands).toEqual(['nbr'])
    })

    // Charted for NDVI over optical monitoring, then read again to have segments for VV alone.
    it('settles as having none to chart once no band it can plot is observed, letting go of what it read', async () => {
        fake.heldObservations = []
        await editor({selection: {type: 'ASSET', id: SEGMENTS_ASSET}, chart: true})
        expect(fake.graphs.at(-1)).toMatchObject({band: 'ndvi'})
        fake.assets[SEGMENTS_ASSET] = segmentsAsset([...SEGMENT_BANDS, ...measureBands('VV')])
        fake.graphs = []

        await act(async () => replaceCredentials())
        await settled()

        expect(fake.cancelledObservations).toEqual(['ndvi'])
        expect(fake.graphs.filter(({band}) => !band)).toEqual([])
        expect(chartText()).toContain('process.ccdc.chartPixel.noChartableBand')
        fake.graphs = []
        await act(async () => fake.heldObservations.forEach(answer => answer()))
        expect(fake.graphs).toEqual([])
    })

    it('charts again once a band it can plot is observed again', async () => {
        await editor({selection: {type: 'ASSET', id: SEGMENTS_ASSET}, chart: true})
        fake.assets[SEGMENTS_ASSET] = segmentsAsset([...SEGMENT_BANDS, ...measureBands('VV')])
        await act(async () => replaceCredentials())
        await settled()
        fake.segmentBands = []

        fake.assets[SEGMENTS_ASSET] = segmentsAsset(VALID_BANDS)
        await act(async () => replaceCredentials())
        await settled()

        expect(fake.segmentBands).toEqual(['ndvi'])
        expect(fake.graphs.at(-1)).toMatchObject({band: 'ndvi'})
        expect(chartText()).not.toContain('process.ccdc.chartPixel.noChartableBand')
    })
})

describe('the chart and Retrieve actions', () => {
    it('cannot be opened while the reference is being checked, and can once it is known to suit', async () => {
        fake.heldMetadata = []
        await editor({selection: {type: 'ASSET', id: SEGMENTS_ASSET}, actions: true})

        expect(await opens('chart')).toBe(false)
        expect(await opens('retrieve')).toBe(false)

        await answerHeldReads()

        expect(await opens('chart')).toBe(true)
        expect(await opens('retrieve')).toBe(true)
    })

    it('cannot be reached from the keyboard while the reference is being checked, and can once it is known to suit', async () => {
        fake.heldMetadata = []
        await editor({selection: {type: 'ASSET', id: SEGMENTS_ASSET}, actions: true})

        expect(reachesByKeyboard('chart')).toBe(false)
        expect(reachesByKeyboard('retrieve')).toBe(false)

        await answerHeldReads()

        expect(reachesByKeyboard('chart')).toBe(true)
        expect(reachesByKeyboard('retrieve')).toBe(true)
    })

    it('let go of a pixel being chosen for the chart once the chart can no longer be opened', async () => {
        await editor({selection: {type: 'ASSET', id: SEGMENTS_ASSET}, actions: true})
        await opens('chart')

        fake.heldMetadata = []
        await act(async () => replaceCredentials())
        await settled()
        await clickMap()

        expect(selecting.charted).toEqual([])
    })

    it('offer no coordinates for a long press held past the moment the chart can no longer be opened', async () => {
        await editor({selection: {type: 'ASSET', id: SEGMENTS_ASSET}, actions: true})
        vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']})
        try {
            startTouchPress('chart')

            fake.heldMetadata = []
            await act(async () => replaceCredentials())
            await settled()
            act(() => vi.advanceTimersByTime(LONG_PRESS_MS))

            expect(offersCoordinates()).toBe(false)
        } finally {
            vi.useRealTimers()
        }
    })

    it('cannot be opened over a reference that cannot supply segments, and can once a suitable one is selected', async () => {
        await editor({selection: ref('masking-mosaic'), actions: true})

        expect(await opens('chart')).toBe(false)
        expect(await opens('retrieve')).toBe(false)

        await act(async () => store.dispatch(set(['process', 'loadedRecipes', ALERTS, 'model', 'reference'], ref('masking-ccdc'))))
        await settled()

        expect(await opens('chart')).toBe(true)
        expect(await opens('retrieve')).toBe(true)
    })

    it('hold back only the chart over segments the alerts can use but a chart cannot plot', async () => {
        fake.assets[SEGMENTS_ASSET] = segmentsAsset(SLICEABLE_ONLY_BANDS)

        await editor({selection: {type: 'ASSET', id: SEGMENTS_ASSET}, actions: true})

        expect(await opens('chart')).toBe(false)
        expect(await opens('retrieve')).toBe(true)
    })

    it('hold back only Retrieve while Sources monitors a measure the reference lacks, which the chart does not plot', async () => {
        await editor({selection: {type: 'ASSET', id: SEGMENTS_ASSET}, actions: true})

        await act(async () => store.dispatch(set(['process', 'loadedRecipes', ALERTS, 'model', 'sources', 'band'], 'nbr')))
        await settled()

        expect(await opens('retrieve')).toBe(false)
        expect(await opens('chart')).toBe(true)
    })

    // NDVI the alerts monitor, but only VV, which optical monitoring does not observe, plotted.
    it('hold back the chart while the monitoring data observes no measure it can plot, until one is', async () => {
        fake.assets[SEGMENTS_ASSET] = segmentsAsset([...SEGMENT_BANDS, ['ndvi_coefs', 2], ['ndvi_rmse', 1], ...measureBands('VV')])
        await editor({selection: {type: 'ASSET', id: SEGMENTS_ASSET}, actions: true})

        expect(await opens('chart')).toBe(false)
        expect(await opens('retrieve')).toBe(true)

        fake.assets[SEGMENTS_ASSET] = segmentsAsset(VALID_BANDS)
        await act(async () => replaceCredentials())
        await settled()

        expect(await opens('chart')).toBe(true)
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

// Saved while its reference fitted none of the monitoring configured, and opened afresh. Replacing the reference in REF
// lets go of the replacement's records as the panel closes - they were read for the edit - just as the alerts begin
// observing it.
describe('a saved recipe whose reference no longer suits its monitoring, repaired in REF', () => {
    it('settles once a suitable reference is applied, and REF opens again without waiting', async () => {
        fake.stored = storedRecords(['ccdc-radar', 'ccdc-optical'])
        await editor({selection: ref('ccdc-radar'), panels: ['reference'], unloaded: ['ccdc-radar', 'ccdc-optical']})
        expect(Object.keys(sourceProblems())).toEqual(['sources'])
        await selectRecipe('Optical CCDC')
        fake.heldLoads = []

        await apply()
        expect(referenceStatus()?.state).toBe(CHECKING_SOURCE)
        await answerHeldLoads()

        expect(committedReference()).toEqual(ref('ccdc-optical'))
        expect(referenceStatus()).toBe(null)
        expect(sourceProblems()).toEqual({})
        expect(gate('IMAGE_OUTPUT')).toBe(null)
        await reopen('reference')
        expect(isBusy(RECIPE_INPUT)).toBe(false)
        expect(isChecking(RECIPE_INPUT)).toBe(false)
        expect(errorsOf(RECIPE_INPUT)).toEqual([])
        expect(warningsOf(RECIPE_INPUT)).toEqual([])
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

const SEGMENT_BANDS = [['tStart', 1], ['tEnd', 1], ['tBreak', 1], ['numObs', 1], ['changeProb', 1]]

// A measure as segments carry it: its coefficients, RMSE and magnitude.
const measureBands = name => [[`${name}_coefs`, 2], [`${name}_rmse`, 1], [`${name}_magnitude`, 1]]

// Segments of a radar CCDC: everything the alerts and the chart read, for VV alone.
const RADAR_BANDS = [...SEGMENT_BANDS, ...measureBands('VV')]

// What the alerts read, and nothing more the chart plots.
const SLICEABLE_ONLY_BANDS = [['tStart', 1], ['tEnd', 1], ['ndvi_coefs', 2], ['ndvi_rmse', 1]]

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
        id: 'ccdc-radar', name: 'Radar CCDC', type: 'CCDC',
        model: {
            sources: {dataSets: {SENTINEL_1: ['SENTINEL_1']}},
            options: {},
            ccdcOptions: {dateFormat: 1},
            dates: {startDate: '2017-01-01', endDate: '2021-01-01'}
        }
    },
    {
        id: 'ccdc-optical', name: 'Optical CCDC', type: 'CCDC',
        model: {
            sources: {dataSets: {LANDSAT: ['LANDSAT_9']}},
            options: {corrections: []},
            ccdcOptions: {dateFormat: 1},
            dates: {startDate: '2017-01-01', endDate: '2021-01-01'}
        }
    },
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
            id, crs: 'EPSG:4326', dimensions: [5015, 3093],
            data_type: {type: 'PixelType', precision: 'double', ...(rank === null ? {dimensions: null} : rank && {dimensions: rank})}
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
            [HOST]: {id: HOST, type: 'MOSAIC', revision: 1, model: {}, ui: {initialized: true}},
            ...Object.fromEntries(RECORDS.filter(({id}) => !unloaded.includes(id)).map(record => [record.id, record])),
            ...saving
        },
        recipes: LISTING.map(summary => saving[summary.id] ? {...summary, revision: 2} : summary),
        recipeListing: {checkedAt: Date.now()},
        saveStates: Object.fromEntries(Object.keys(saving).map(id => [id, {status: 'SAVING', revision: 2, model: saving[id].model}])),
        projects: [],
        tabs
    },
    assets: {user: [SEGMENTS_ASSET, RADAR_ASSET, 'users/x/other-segments'].map(id => ({id, updateTime: 'T1'})), other: []},
    dimensions: {width: 1024, height: 768}
})

function alertsModel(selection) {
    return {
        reference: selection,
        sources: {dataSetType: 'OPTICAL', dataSets: {LANDSAT: ['LANDSAT_9']}, band: 'ndvi'},
        options: {corrections: []},
        date: {monitoringEnd: '2024-01-01', monitoringDuration: 1, monitoringDurationUnit: 'months', calibrationDuration: 2, calibrationDurationUnit: 'months'}
    }
}

const editor = async ({selection, owner = true, chart = false, layer = false, actions = false, panels = [], unloaded}) => {
    const initialState = sessionState({selection, tabs: [{id: ALERTS}], unloaded})
    store = createStore((state = initialState, action) => action.reduce ? action.reduce(state) : state)
    store.subscribe(() => firstListener())
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
                    {panels.length
                        ? (
                            <EventShield>
                                <PortalContainer/>
                                <PortalContainer id='panels'/>
                                <PortalContext id='panels'>
                                    {panels.map(id => <SectionPanel key={id} id={id}/>)}
                                </PortalContext>
                            </EventShield>
                        )
                        : null}
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
                    {actions
                        ? (
                            <MapContext map={SELECTING_MAP}>
                                {/* Where the chart's coordinate drawer floats. */}
                                <PortalContainer/>
                                <PortalContainer id='toolbar'/>
                                <PortalContext id='toolbar'>
                                    <Toolbar vertical>
                                        <span data-action='chart'><ChartPixelButton onPixelSelected={latLng => selecting.charted.push(latLng)}/></span>
                                        <span data-action='retrieve'><RetrieveButton/></span>
                                    </Toolbar>
                                </PortalContext>
                            </MapContext>
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

// Starting a pixel selection is what opening the chart does; the pixel then clicked is the one charted.
const selecting = {listener: null, charted: []}
const SELECTING_MAP = {
    addOneShotClickListener: listener => {
        opened.push('chart')
        selecting.listener = listener
        return {remove: () => selecting.listener = null}
    },
    enterInteractionMode: () => ({remove: () => {}})
}

const clickMap = () => act(async () => selecting.listener?.({lat: 1, lng: 2}))

// Whether clicking a toolbar action opens it, as the user would.
const opens = async action => {
    opened.length = 0
    await act(async () => actionButton(action).click())
    return opened.includes(action)
}

// Whether a keyboard user can reach a toolbar action to activate it: what cannot take focus, Enter cannot press.
const reachesByKeyboard = action => {
    const button = actionButton(action)
    act(() => button.focus())
    const reached = document.activeElement === button
    act(() => button.blur())
    return reached
}

const actionButton = action => container.querySelector(`[data-action="${action}"] button`)

// A touch held on an action for longer than a long press takes.
const LONG_PRESS_MS = 1000
const startTouchPress = action => act(() => actionButton(action).dispatchEvent(
    new PointerEvent('pointerdown', {bubbles: true, pointerType: 'touch', clientX: 10, clientY: 10})
))

// Whether coordinates to chart can be entered: a long press on the chart offers a search for them.
const offersCoordinates = () => Boolean(document.querySelector('input[type="search"]'))

// The editor's own REF and Sources panels, opened as their buttons open them.
const SECTION_PANELS = {reference: Reference, sources: Sources}

const SectionPanel = ({id}) => {
    const Panel = SECTION_PANELS[id]
    return <Panel/>
}

const ASSET_INPUT = 'process.changeAlerts.panel.reference.form.asset.label'
const RECIPE_INPUT = 'widget.recipeInput.label'
const RADAR_TYPE = 'process.changeAlerts.panel.sources.form.dataSetTypes.RADAR'
const SOURCES_SECTION = 'process.changeAlerts.panel.sources.button'

// Selects an asset in REF as a user does: the kind of reference in its header, unless already chosen, then the asset,
// typed into the picker and chosen from what it offers.
const selectAsset = async id => {
    await chooseReferenceType('asset')
    const input = field(ASSET_INPUT).querySelector('input')
    await act(async () => input.click())
    await act(async () => type(input, id))
    await act(async () => option(id).click())
    await settled()
}

const selectRecipe = async name => {
    await chooseReferenceType('recipe')
    const input = field(RECIPE_INPUT).querySelector('input')
    await act(async () => input.click())
    await act(async () => type(input, name))
    await act(async () => option(name).click())
    await settled()
}

// A panel opened again, as its toolbar button opens it.
const reopen = async id => {
    await act(async () => panelActivations[id]())
    await settled()
}

const chooseReferenceType = async kind => {
    if (field(kind === 'asset' ? ASSET_INPUT : RECIPE_INPUT)) {
        return
    }
    const header = [...document.querySelectorAll('button')].find(button =>
        /^process\.changeAlerts\.panel\.reference\.(recipe\.title|asset\.title|title)$/.test(button.textContent))
    await act(async () => header.click())
    await act(async () => option(`process.changeAlerts.panel.reference.${kind}.label`).click())
}

const chooseDateFormat = key => chooseButton(`process.ccdc.panel.dates.form.dateFormat.${key}.label`)

const chooseButton = label => act(async () => panelButton(label).click())

const refresh = label => act(async () => buttonNamed(field(label), 'process.source.status.refresh').click())

const type = (input, text) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, text)
    input.dispatchEvent(new Event('input', {bubbles: true}))
}

// An option a list offers, as the element choosing it.
const option = label => [...document.querySelectorAll('[data-hook="option"]')].find(element => element.textContent === label)

const buttonNamed = (within, name) => [...within.querySelectorAll('button')].find(button => button.textContent === name)

// The field a label names.
const field = label => container.querySelector(`[data-label="${label}"]`)

// What a field's label says of it: its errors, warnings or tooltip, as the tooltip of the icon marking them.
const saidOf = (label, kind) => {
    const tooltip = field(label).querySelector(`[data-feedback="${kind}"]`)?.closest('[data-tooltip]')
    return tooltip ? JSON.parse(tooltip.dataset.tooltip) : []
}

const errorsOf = label => saidOf(label, 'error')

const warningsOf = label => saidOf(label, 'warning')

// What the label naming a field explains of it, a check it waits for included.
const explanationOf = label => saidOf(label, 'tooltip')

// Whether its label explains a check the field waits for, by the message saying so.
const isChecking = label => explanationOf(label).some(line => /checking/i.test(line))

// Whether the field shows itself busy, by the state its widget renders.
const isBusy = label => field(label).querySelector(`.${widgetStyles.busy}`) !== null

const offersRefresh = label => buttonNamed(field(label), 'process.source.status.refresh') !== undefined

const applyEnabled = () => !panelButton('button.apply').disabled

const panelButton = label => [...document.querySelectorAll('button')].find(button => button.textContent === label)

const apply = () => act(async () => panelButton('button.apply').click())

const cancel = () => act(async () => panelButton('button.cancel').click())

const committedReference = () => alertsRecipe().model.reference

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
                    <Recipe id={HOST}>
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
                    </Recipe>
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

const answerPickerReads = async () => {
    const held = fake.heldPickerMetadata
    fake.heldPickerMetadata = null
    act(() => held.forEach(answer => answer()))
    await settled()
}

const answerHeldReads = async () => {
    const held = fake.heldMetadata
    fake.heldMetadata = null
    act(() => held.forEach(answer => answer()))
    await settled()
}

// Does `during` when the store first notifies of what `change` does, before any listener that subscribed after the
// editor's store was created - the source runtime's among them - is told of it.
let firstListener = () => {}

const beforeTheRuntimeReacts = (change, during) => {
    firstListener = () => {
        firstListener = () => {}
        during()
    }
    try {
        change()
    } finally {
        firstListener = () => {}
    }
}

// A token read for an asset, recorded as the source runtime records one.
const tokenRead = (assetId, version) => store.dispatch(set(['process', 'assetEvidence', 'assets', assetId, 'version'], version))

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

const sourceProblems = () =>
    sourceProblemsOfState(store.getState(), ALERTS, id => runtime.evidenceOwnerOf(id))

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

const metadataReads = asset => fake.calls.filter(([name, id]) => name === 'assetMetadata' && (!asset || id === asset)).length

// What the chart panel says, besides its graph.
const chartText = () => container.textContent

// The selector choosing what a layer shows, in the map area menu.
const LAYER_SELECTOR = 'map.visualizationSelector.label'
