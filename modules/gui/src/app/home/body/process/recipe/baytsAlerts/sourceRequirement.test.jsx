import _ from 'lodash'
import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {Recipe, withRecipe} from '~/app/home/body/process/recipeContext'
import {SourceRuntimeProvider, withSourceRuntime} from '~/app/home/body/process/sourceRuntime/sourceRuntimeContext'
import {compose} from '~/compose'
import translations from '~/locale/en/translations.json'
import {selectFrom} from '~/stateUtils'
import {initStore} from '~/store'

// Whether BAYTS Alerts' reference suits what reads it, composed as its editor composes it - the evidence lifecycle, the
// REF panel and Retrieve - and as another map shows its layers, over a real store and source runtime. Earth Engine and
// storage are faked.

const fake = vi.hoisted(() => ({
    assets: {}, failing: new Set(), heldMetadata: null, cancelledMetadata: [], versions: {}, calls: [], stored: {}
}))
vi.mock('~/apiRegistry', async () => {
    const {Observable, of, throwError} = await import('rxjs')
    // The evidence's read of an asset; the asset picker's names the types it allows, and is never held or failed.
    const evidenceRead$ = asset => {
        fake.calls.push(['assetMetadata', asset])
        if (fake.heldMetadata) {
            return new Observable(subscriber => {
                let answered = false
                const answer = fake.assets[asset]
                fake.heldMetadata.push(() => {
                    answered = true
                    subscriber.next(answer)
                    subscriber.complete()
                })
                return () => answered || fake.cancelledMetadata.push(asset)
            })
        }
        return fake.failing.has(asset)
            ? throwError(() => new Error('Earth Engine unreachable'))
            : of(fake.assets[asset])
    }
    return {default: {
        gee: {
            assetMetadata$: ({asset, allowedTypes}) => allowedTypes ? of(fake.assets[asset]) : evidenceRead$(asset),
            datasets$: () => of({community: {datasets: [], matchingResults: 0}, gee: {datasets: [], matchingResults: 0}}),
            assetVersions$: ({ids}) => of({assets: ids.map(id => ({id, type: 'IMAGE', version: fake.versions[id] ?? 'v1'}))})
        },
        // Storage holds the recipes the session does.
        recipe: {
            load$: id => fake.stored[id] ? of(fake.stored[id]) : throwError(() => new Error(`Recipe ${id} not found`)),
            loadAll$: () => of(LISTING)
        }
    }}
})
vi.mock('~/translate', () => ({msg: (key, values) => values ? `${key} ${JSON.stringify(values)}` : key}))
vi.mock('~/widget/notifications', () => ({Notifications: {error: () => {}}}))
vi.mock('~/app/home/user/userDetails', () => ({userDetailsHint: () => {}}))
// The REF panel opens with the editor, and closes as it does when cancelled or applied.
vi.mock('~/widget/activation/activatable', async () => {
    const {useState} = await import('react')
    return {
        withActivatable: () => Component => props => {
            const [active, setActive] = useState(true)
            return active
                ? <Component {...props} activatable={{active, activate: () => setActive(true), deactivate: () => setActive(false)}}/>
                : null
        }
    }
})
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
// A tooltip's text is rendered where it is attached, to be read without hovering.
vi.mock('~/widget/tooltip', () => ({
    Tooltip: ({msg, disabled, children}) => msg && !disabled && typeof msg !== 'function'
        ? <span data-tooltip={JSON.stringify([msg].flat().filter(Boolean))}>{children}</span>
        : children
}))
// Constructing a preview layer is what requests a preview: the map mounts it and Earth Engine is asked for its tiles.
const previews = vi.hoisted(() => ({constructed: []}))
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
const {baytsAlertsObservation} = await import('./referenceObservation')
const {baytsAlertsRequirements} = await import('./sourceRequirement')
const {mapProducts} = await import('./bands')
const {Reference} = await import('./panels/reference/reference')
const {Preprocess} = await import('./panels/preprocess/preprocess')
const {Options: HistoricalOptions} = await import('../baytsHistorical/panels/options/options')
const {RetrieveButton} = await import('../retrieveButton')
const {withRetrieveOutput} = await import('../withRetrieveOutput')
const {retrieveDecision} = await import('../retrieveOutput')
const {RecipeImageLayer} = await import('../recipeImageLayer')
const {addRecipeImageLayer} = await import('../../recipeImageLayerRegistry')
const {recipeAccess} = await import('../../recipeAccess')
const {Toolbar} = await import('~/widget/toolbar/toolbar')
const {TabContext} = await import('~/widget/tabs/tabContext')
const {EventShield} = await import('~/widget/eventShield')
const {PortalContainer, PortalContext} = await import('~/widget/portal')
const {actionBuilder} = await import('~/action-builder')
const {Subject} = await import('rxjs')
const {IMAGE_OUTPUT} = await import('../recipeOutput')
const {
    CHECKING_SOURCE, selectedSourceStatusOfState, sourceProblemsOfState, UNAVAILABLE_SOURCE, UNSUITABLE_SOURCE
} = await import('../selectedSourceStatus')
const {requestGate} = await import('../sourceRequirements')

// BAYTS Alerts' own layer form is replaced by nothing: what a layer requests is what is observed.
addRecipeImageLayer('BAYTS_ALERTS', () => null)

registry.BAYTS_ALERTS = {sourceRequirements: baytsAlertsRequirements, sourceObservation: baytsAlertsObservation, mapProducts}
registry.BAYTS_HISTORICAL = {id: 'BAYTS_HISTORICAL'}
registry.MASKING = {id: 'MASKING'}
registry.RADAR_MOSAIC = {id: 'RADAR_MOSAIC'}
registry.ASSET_MOSAIC = {id: 'ASSET_MOSAIC'}

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const ALERTS = 'alerts-1'
const HOST = 'host-1'
const STATS_ASSET = 'users/x/historical'
const OTHER_ASSET = 'users/x/other-historical'

let root, container, store, runtime, retrieve

beforeEach(() => {
    fake.assets = {[STATS_ASSET]: statsAsset(ASCENDING), [OTHER_ASSET]: statsAsset(ASCENDING)}
    fake.failing = new Set()
    fake.heldMetadata = null
    fake.cancelledMetadata = []
    fake.versions = {}
    fake.calls = []
    fake.stored = Object.fromEntries(RECORDS.map(record => [record.id, record]))
    previews.constructed = []
})

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    container?.remove()
})

describe('a reference BAYTS Alerts can monitor against', () => {
    it.each([
        ['a BAYTS historical recipe', ref('historical-1')],
        ['a Masking over one', ref('masked-historical')],
        ['an asset mosaic over statistics', ref('stats-mosaic')],
        ['an asset with every statistic of its pass', ASSET]
    ])('is accepted, saying nothing in REF, and Retrieve can be opened and submitted, for %s', async (_case, selection) => {
        await editor({selection, actions: true})

        expect(referenceStatus()).toBe(null)
        expect(await opens('retrieve')).toBe(true)
        expect(decision()).toBe('RETRIEVABLE')
    })

    it('is accepted where another pass, which the alerts do not monitor, is incomplete', async () => {
        fake.assets[STATS_ASSET] = statsAsset([...ASCENDING, ['VV_mean_desc', 0]])

        await editor({selection: ASSET, actions: true})

        expect(referenceStatus()).toBe(null)
        expect(sourceProblems()).toEqual({})
        expect(decision()).toBe('RETRIEVABLE')
    })

    it('is judged by its statistics where the processing options it describes cannot be read, which then seed nothing', async () => {
        fake.assets[STATS_ASSET] = statsAsset(ASCENDING, {recipe_options: '{broken'})

        await editor({selection: ASSET, actions: true})

        expect(referenceStatus()).toBe(null)
        expect(decision()).toBe('RETRIEVABLE')
        expect(alertsRecipe().model.options).toEqual(HISTORICAL_OPTIONS)
    })

    it('is judged by its statistics where the passes its processing options state are malformed, which then seed nothing', async () => {
        fake.assets[STATS_ASSET] = statsAsset(ASCENDING, {recipe_options: JSON.stringify({orbits: 'ASCENDING', minObservations: 7})})

        await editor({selection: ASSET, actions: true})

        expect(referenceStatus()).toBe(null)
        expect(decision()).toBe('RETRIEVABLE')
        expect(alertsRecipe().model.options).toEqual(HISTORICAL_OPTIONS)
    })
})

describe('the passes the alerts monitor, set in PRC', () => {
    it('mark PRC where the reference does not hold one, holding back the alerts and Retrieve, and advise REF of it', async () => {
        fake.assets[STATS_ASSET] = statsAsset(DESCENDING)

        await editor({selection: ASSET, actions: true})

        expect(Object.keys(sourceProblems())).toEqual(['options'])
        expect(sourceProblems().options).toContain('process.source.historicalStats.passAbsent')
        expect(referenceStatus()).toMatchObject({state: null, advisories: [{message: expect.stringContaining('process.source.status.sectionsIncompatible')}]})
        expect(gate(IMAGE_OUTPUT)).toMatchObject({code: 'SOURCE_UNSUITABLE', section: PRC_SECTION})
        expect(decision()).toBe('BLOCKED')
    })

    it('mark PRC where they are saved malformed, holding back the alerts', async () => {
        await editor({selection: ASSET, actions: true, options: {...HISTORICAL_OPTIONS, orbits: 'ASCENDING'}})

        expect(Object.keys(sourceProblems())).toEqual(['options'])
        expect(sourceProblems().options).toContain('process.source.historicalStats.malformedPasses')
        expect(decision()).toBe('BLOCKED')
    })

    it('are seeded by a reference selected in REF that holds other passes, where it describes them', async () => {
        fake.assets[OTHER_ASSET] = statsAsset(DESCENDING, {recipe_options: JSON.stringify({orbits: ['DESCENDING']})})
        await editor({selection: ASSET, panel: 'reference'})

        await selectAsset(OTHER_ASSET)
        expect(applyEnabled()).toBe(true)
        await apply()

        expect(alertsRecipe().model.options.orbits).toEqual(['DESCENDING'])
        expect(sourceProblems()).toEqual({})
    })
})

describe('the passes offered in PRC', () => {
    it.each([
        ['ascending', ASCENDING, ['ASCENDING', 'DESCENDING'], ASCENDING_PASS, DESCENDING_PASS, 'ASCENDING'],
        ['descending', DESCENDING, ['ASCENDING'], DESCENDING_PASS, ASCENDING_PASS, 'DESCENDING']
    ])('are only the %s pass of a reference holding only that, chosen for the alerts once applied', async (_case, bands, saved, offered, refused, pass) => {
        fake.assets[STATS_ASSET] = statsAsset(bands)

        await editor({selection: ASSET, panel: 'options', options: {...HISTORICAL_OPTIONS, orbits: saved}})

        expect(choiceEnabled(offered)).toBe(true)
        expect(choiceEnabled(refused)).toBe(false)
        await apply()
        expect(alertsRecipe().model.options.orbits).toEqual([pass])
        expect(sourceProblems()).toEqual({})
        expect(gate(IMAGE_OUTPUT)).toBe(null)
        expect(metadataReads()).toBe(1)
    })

    it('are both passes of a reference holding both, keeping the one already chosen', async () => {
        fake.assets[STATS_ASSET] = statsAsset([...ASCENDING, ...DESCENDING])
        await editor({selection: ASSET, panel: 'options', options: {...HISTORICAL_OPTIONS, orbits: ['DESCENDING']}})
        expect([choiceEnabled(ASCENDING_PASS), choiceEnabled(DESCENDING_PASS)]).toEqual([true, true])

        await toggle(TERRAIN_CORRECTION)
        await apply()

        expect(alertsRecipe().model.options.orbits).toEqual(['DESCENDING'])
    })

    it('are what the reference supports where none are chosen, once that is established', async () => {
        fake.assets[STATS_ASSET] = statsAsset([...ASCENDING, ...DESCENDING])
        fake.heldMetadata = []
        await editor({selection: ASSET, panel: 'options', options: {...HISTORICAL_OPTIONS, orbits: []}})
        expect(applyEnabled()).toBe(false)

        await answerHeldReads()
        await apply()

        expect(alertsRecipe().model.options.orbits).toEqual(['ASCENDING', 'DESCENDING'])
    })

    it.each([
        ['being checked', () => fake.heldMetadata = []],
        ['unreadable', () => fake.failing.add(STATS_ASSET)]
    ])('are all offered, and none chosen, while the reference is %s', async (_case, arrange) => {
        fake.assets[STATS_ASSET] = statsAsset(DESCENDING)
        arrange()

        await editor({selection: ASSET, panel: 'options', options: {...HISTORICAL_OPTIONS, orbits: []}})

        expect([choiceEnabled(ASCENDING_PASS), choiceEnabled(DESCENDING_PASS)]).toEqual([true, true])
        expect(applyEnabled()).toBe(false)
    })

    it('are not chosen again once deliberately cleared, which is required, and holds back Apply of the panel\'s other edits', async () => {
        await editor({selection: ASSET, panel: 'options'})
        await toggle(TERRAIN_CORRECTION)
        expect(applyEnabled()).toBe(true)
        expect(errorsOf(ORBITS)).toEqual([])

        await toggle(ASCENDING_PASS)
        await settled()

        expect(errorsOf(ORBITS)).toEqual([expect.stringContaining(ORBITS_REQUIRED)])
        expect(_.get(translations, ORBITS_REQUIRED)).toEqual(expect.any(String))
        expect(applyEnabled()).toBe(false)
    })

    it('are what the reference supports where they were saved as something other than a list of passes', async () => {
        await editor({selection: ASSET, panel: 'options', options: {...HISTORICAL_OPTIONS, orbits: 'ASCENDING'}})

        await apply()

        expect(alertsRecipe().model.options.orbits).toEqual(['ASCENDING'])
        expect(sourceProblems()).toEqual({})
    })

    it('saved as something other than a list of passes are left so on Cancel', async () => {
        await editor({selection: ASSET, panel: 'options', options: {...HISTORICAL_OPTIONS, orbits: 'ASCENDING'}})

        await cancel()

        expect(alertsRecipe().model.options.orbits).toBe('ASCENDING')
        expect(Object.keys(sourceProblems())).toEqual(['options'])
    })

    it('follow the reference while PRC is open, when what it supports changes', async () => {
        fake.assets[STATS_ASSET] = statsAsset([...ASCENDING, ...DESCENDING])
        await editor({selection: ASSET, panel: 'options', options: {...HISTORICAL_OPTIONS, orbits: ['ASCENDING', 'DESCENDING']}})

        fake.assets[STATS_ASSET] = statsAsset(DESCENDING)
        await assetUpdated(STATS_ASSET)

        expect(choiceEnabled(ASCENDING_PASS)).toBe(false)
        await apply()
        expect(alertsRecipe().model.options.orbits).toEqual(['DESCENDING'])
    })

    it('leave the alerts\' passes as they were on Cancel', async () => {
        fake.assets[STATS_ASSET] = statsAsset(DESCENDING)
        await editor({selection: ASSET, panel: 'options'})

        await cancel()

        expect(alertsRecipe().model.options.orbits).toEqual(['ASCENDING'])
        expect(Object.keys(sourceProblems())).toEqual(['options'])
    })

    it('are offered as before in BAYTS Historical\'s own panel, whatever it computes', async () => {
        await editor({selection: ASSET, panel: 'historical'})

        await toggle(ASCENDING_PASS)
        expect(errorsOf(ORBITS)).toEqual([])
        await toggle(DESCENDING_PASS)
        await apply()

        expect(selectFrom(store.getState(), ['process.loadedRecipes', 'historical-1', 'model.options.orbits']))
            .toEqual(['DESCENDING'])
    })
})

describe('a reference it cannot monitor against', () => {
    it('marks REF, keeps the selection, and holds back Retrieve, submission included', async () => {
        await editor({selection: ref('masked-radar'), actions: true})

        expect(referenceStatus()).toMatchObject({state: UNSUITABLE_SOURCE})
        expect(alertsRecipe().model.reference).toEqual(ref('masked-radar'))
        expect(await opens('retrieve')).toBe(false)
        expect(decision()).toBe('BLOCKED')
    })
})

describe('a reference selected in REF', () => {
    it.each([
        ['missing a statistic', 'process.source.historicalStats.missingBand', false, () => answers(without(ASCENDING, 'VH_speckle_asc'))],
        ['with a statistic stored as an array', 'process.source.historicalStats.arrayBand', false, () => answers([...without(ASCENDING, 'VV_mean_asc'), ['VV_mean_asc', 1]])],
        ['whose ranks its metadata does not establish', 'process.source.historicalStats.undetermined', false, () => answers(ASCENDING.map(([name]) => [name, null]))],
        ['that cannot be read', 'process.source.status.assetUnavailable', true, () => fake.failing.add(OTHER_ASSET)]
    ])('is held back before Apply when %s, with that as its error, and the alerts keep their reference', async (_case, diagnostic, refresh, arrange) => {
        await editor({selection: ASSET, panel: 'reference'})
        arrange()

        await selectAsset(OTHER_ASSET)

        expect(applyEnabled()).toBe(false)
        expect(errorsOf(ASSET_INPUT).join('\n')).toContain(diagnostic)
        expect(offersRefresh(ASSET_INPUT)).toBe(refresh)
        expect(alertsRecipe().model.reference).toEqual(ASSET)
    })

    it('is refused before Apply where the recipe selected leads to no historical statistics, said on its input', async () => {
        await editor({selection: ref('historical-1'), panel: 'reference'})

        await selectRecipe('Masked radar')

        expect(applyEnabled()).toBe(false)
        expect(errorsOf(RECIPE_INPUT)).not.toEqual([])
        expect(alertsRecipe().model.reference).toEqual(ref('historical-1'))
    })

    it('is applied when it suits, replacing a saved reference that does not', async () => {
        await editor({selection: ref('masked-radar'), panel: 'reference'})

        await selectRecipe('Masked historical')
        await apply()

        expect(alertsRecipe().model.reference).toEqual(ref('masked-historical'))
        expect(referenceStatus()).toBe(null)
    })

    it('shows itself busy while it is checked, and is held back until it is known to suit', async () => {
        await editor({selection: ref('historical-1'), panel: 'reference'})
        fake.heldMetadata = []

        await selectAsset(OTHER_ASSET)

        expect(applyEnabled()).toBe(false)
        expect(errorsOf(ASSET_INPUT)).toEqual([])
        await answerHeldReads()
        expect(applyEnabled()).toBe(true)
    })

    it('is let go on Cancel, leaving the alerts\' reference and evidence as they were', async () => {
        await editor({selection: ref('masked-radar'), panel: 'reference'})
        const evidence = alertsRecipe().ui.sourceEvidence

        await selectRecipe('Masked historical')
        await cancel()

        expect(alertsRecipe().model.reference).toEqual(ref('masked-radar'))
        expect(alertsRecipe().ui.sourceEvidence).toBe(evidence)
        expect(referenceStatus()).toMatchObject({state: UNSUITABLE_SOURCE})
    })

    it('offers recipes that may provide historical statistics, whatever their type, and no others', async () => {
        await editor({selection: ref('historical-1'), panel: 'reference'})

        await openOptions(RECIPE_INPUT)

        expect(offered()).toEqual(expect.arrayContaining(['Historical', 'Masked historical', 'Masked radar', 'Statistics mosaic']))
        expect(offered()).not.toContain('Radar 2020')
    })
})

describe('the reference\'s evidence', () => {
    it('is read once for the editor, Retrieve and a layer of the alerts', async () => {
        await editor({selection: ASSET, actions: true})
        await showLayers([ALERT_LAYER])

        expect(metadataReads()).toBe(1)
    })

    it('is let go with the last watcher: its read is cancelled', async () => {
        fake.heldMetadata = []
        await onAnotherMap({selection: ASSET, layers: [ALERT_LAYER]})

        await act(async () => root.unmount())
        root = null

        expect(fake.cancelledMetadata).toEqual([STATS_ASSET])
    })

    it('that could not be read is read again on Refresh, and then suits', async () => {
        fake.failing.add(STATS_ASSET)
        await editor({selection: ASSET, panel: 'reference'})
        expect(referenceStatus()).toMatchObject({state: UNAVAILABLE_SOURCE})

        fake.failing.delete(STATS_ASSET)
        await refresh(ASSET_INPUT)

        expect(referenceStatus()).toBe(null)
    })

    it('read for a reference since replaced judges nothing and configures nothing', async () => {
        fake.heldMetadata = []
        fake.assets[STATS_ASSET] = statsAsset([], {recipe_options: JSON.stringify({minObservations: 99})})
        await editor({selection: ASSET})

        await replaceReference(ref('historical-1'))
        await answerHeldReads()

        expect(referenceStatus()).toBe(null)
        expect(alertsRecipe().model.options).toMatchObject({orbits: ['ASCENDING'], minObservations: 20})
    })
})

describe('alerts shown on another map with their editor closed', () => {
    it('are held while the layer\'s own watch checks the reference, and drawn once it is known to suit', async () => {
        fake.heldMetadata = []
        await onAnotherMap({selection: ASSET, layers: [ALERT_LAYER]})
        expect(gate(IMAGE_OUTPUT)).toMatchObject({wait: true})
        expect(previews.constructed).toEqual([])

        await answerHeldReads()

        expect(gate(IMAGE_OUTPUT)).toBe(null)
        expect(previews.constructed).toHaveLength(1)
    })

    it('are refused over a reference whose statistics do not suit, and drawn once they are corrected', async () => {
        fake.assets[STATS_ASSET] = statsAsset(without(ASCENDING, 'orbit_asc'))
        await onAnotherMap({selection: ASSET, layers: [ALERT_LAYER]})
        expect(gate(IMAGE_OUTPUT)).toMatchObject({code: 'SOURCE_UNSUITABLE', withdraw: true})
        expect(previews.constructed).toEqual([])

        fake.assets[STATS_ASSET] = statsAsset(ASCENDING)
        await assetUpdated(STATS_ASSET)

        expect(gate(IMAGE_OUTPUT)).toBe(null)
        expect(previews.constructed).toHaveLength(1)
    })

    it('show the radar observation over a reference whose statistics do not suit, which it does not read', async () => {
        await onAnotherMap({selection: ref('masked-radar'), layers: [FIRST_OBSERVATION_LAYER]})

        expect(previews.constructed).toHaveLength(1)
    })

    it('configure nothing, and the editor opened afterwards seeds the options once, reading nothing again', async () => {
        fake.assets[STATS_ASSET] = statsAsset(ASCENDING, {recipe_options: JSON.stringify({minObservations: 7})})
        await onAnotherMap({selection: ASSET, layers: [ALERT_LAYER]})
        const before = alertsRecipe().model
        expect(alertsRecipe().ui.sourceEvidence.status).toBe('OBSERVED')

        await showEditor()

        expect(before.options.minObservations).toBe(20)
        expect(alertsRecipe().model.options.minObservations).toBe(7)
        expect(metadataReads()).toBe(1)
    })
})

describe('Retrieve', () => {
    it('cannot be opened while the reference is being checked, and can once it is known to suit', async () => {
        fake.heldMetadata = []
        await editor({selection: ASSET, actions: true})

        expect(referenceStatus()).toMatchObject({state: CHECKING_SOURCE})
        expect(await opens('retrieve')).toBe(false)

        await answerHeldReads()

        expect(await opens('retrieve')).toBe(true)
    })
})

describe('a saved reference an older GUI described beside the selection', () => {
    it('is judged by what it is now, and replaced by a selection alone', async () => {
        const described = {...ASSET, bands: ['VV_stdDev'], startDate: '2021-01-01', endDate: '2021-01-01', visualizations: []}
        await editor({selection: described, panel: 'reference'})
        expect(referenceStatus()).toBe(null)

        await selectAsset(OTHER_ASSET)
        await apply()

        expect(alertsRecipe().model.reference).toEqual({type: 'ASSET', id: OTHER_ASSET})
    })
})

const STATISTICS = ['VV_mean', 'VV_std', 'VH_mean', 'VH_std', 'orbit', 'VV_speckle', 'VH_speckle']

// The statistics of a pass, as BAYTS Historical exports them: every one a scalar.
const ASCENDING = STATISTICS.map(statistic => [`${statistic}_asc`, 0])
const DESCENDING = STATISTICS.map(statistic => [`${statistic}_desc`, 0])

const without = (bands, name) => bands.filter(([band]) => band !== name)

const ASSET = {type: 'ASSET', id: STATS_ASSET}

function ref(id) {
    return {type: 'RECIPE_REF', id}
}

const HISTORICAL_OPTIONS = {orbits: ['ASCENDING'], minObservations: 20}

const RECORDS = [
    {
        id: 'historical-1', name: 'Historical', type: 'BAYTS_HISTORICAL',
        model: {dates: {fromDate: '2018-01-01', toDate: '2020-01-01'}, options: HISTORICAL_OPTIONS}
    },
    {id: 'masked-historical', name: 'Masked historical', type: 'MASKING', model: {imageToMask: ref('historical-1')}},
    {id: 'masked-radar', name: 'Masked radar', type: 'MASKING', model: {imageToMask: ref('radar-1')}},
    {id: 'radar-1', name: 'Radar 2020', type: 'RADAR_MOSAIC', model: {}},
    {id: 'stats-mosaic', name: 'Statistics mosaic', type: 'ASSET_MOSAIC', model: {assetDetails: {assetId: OTHER_ASSET}}}
].map(record => ({...record, revision: 1}))

const LISTING = [
    {id: ALERTS, name: 'Alerts', type: 'BAYTS_ALERTS', revision: 1},
    ...RECORDS.map(({id, name, type}) => ({id, name, type, revision: 1}))
]

// An image asset as /assetMetadata answers for it: each band's array rank on its type.
function statsAsset(bands, properties = {}) {
    return {
        type: 'Image',
        bandNames: bands.map(([name]) => name),
        bands: bands.map(([id, rank]) => ({
            id, crs: 'EPSG:4326', dimensions: [5015, 3093],
            data_type: {type: 'PixelType', precision: 'float', ...(rank === null ? {dimensions: null} : rank && {dimensions: rank})}
        })),
        properties
    }
}

const ALERT_LAYER = {
    visualizationType: 'alerts', previouslyConfirmed: 'exclude', minConfidence: 'high',
    visParams: {type: 'categorical', bands: ['flag']}
}
const FIRST_OBSERVATION_LAYER = {visualizationType: 'first', visParams: {type: 'continuous', bands: ['VV']}}

const sessionState = ({selection, options = HISTORICAL_OPTIONS, tabs}) => ({
    user: {currentUser: {googleTokens: {accessToken: 'token'}}},
    process: {
        loadedRecipes: {
            [ALERTS]: {
                id: ALERTS, type: 'BAYTS_ALERTS', revision: 1,
                model: {
                    reference: selection,
                    date: {monitoringEnd: '2024-01-01', monitoringDuration: 2, monitoringDurationUnit: 'months'},
                    options,
                    baytsAlertsOptions: {}
                },
                ui: {initialized: true}
            },
            [HOST]: {id: HOST, type: 'MOSAIC', revision: 1, model: {}, ui: {initialized: true}},
            ...Object.fromEntries(RECORDS.map(record => [record.id, record]))
        },
        recipes: LISTING,
        recipeListing: {checkedAt: Date.now()},
        saveStates: {},
        projects: [],
        tabs
    },
    assets: {user: [STATS_ASSET, OTHER_ASSET].map(id => ({id, updateTime: 'T1'})), other: []},
    dimensions: {width: 1024, height: 768}
})

const RuntimeProbe = compose(props => {
    runtime = props.sourceRuntime
    return null
}, withSourceRuntime())

const Probe = props => {
    retrieve = props
    return null
}
const RetrieveProbe = compose(Probe, withRetrieveOutput(), withRecipe())

// What holds the alerts' record while their layers are shown, as the map's layer sources do.
const LayerSources = compose(({usingRecipe}) => {
    usingRecipe(ALERTS)
    return null
}, recipeAccess())

let mounted

// The alerts as their editor shows them - its watch, REF and Retrieve - and as another map shows their layers.
const editor = async ({selection, panel = false, actions = false, options = HISTORICAL_OPTIONS}) => {
    await mount({selection, options, tabs: [{id: ALERTS}], shown: {owner: true, panel, actions, layers: []}})
}

const onAnotherMap = async ({selection, layers}) => {
    await mount({selection, tabs: [{id: HOST}], shown: {owner: false, panel: false, actions: false, layers}})
}

const mount = async ({selection, options, tabs, shown}) => {
    const initialState = sessionState({selection, options, tabs})
    store = createStore((state = initialState, action) => action.reduce ? action.reduce(state) : state)
    initStore(store)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    mounted = shown
    await render()
}

const showEditor = async () => {
    await act(async () => actionBuilder('OPEN_TAB').set('process.tabs', [{id: HOST}, {id: ALERTS}]).dispatch())
    mounted = {...mounted, owner: true}
    await render()
}

const showLayers = async layers => {
    mounted = {...mounted, layers}
    await render()
}

const render = async () => {
    await act(async () => root.render(
        <Provider store={store}>
            <SourceRuntimeProvider>
                <RuntimeProbe/>
                {mounted.layers.length ? <LayerSources/> : null}
                <Recipe id={HOST}>
                    <TabContext id={HOST} busyIn$={new Subject()}>
                        {mounted.layers.map((layerConfig, index) => (
                            <RecipeImageLayer
                                key={index}
                                source={{id: `alerts-layer-${index}`, sourceConfig: {recipeId: ALERTS}}}
                                layerConfig={layerConfig}
                                map={{}}
                            />
                        ))}
                    </TabContext>
                </Recipe>
                <Recipe id={ALERTS}>
                    {mounted.owner ? <SourceEvidenceSync observation={baytsAlertsObservation}/> : null}
                    {mounted.owner ? <RetrieveProbe/> : null}
                    {mounted.panel
                        ? (
                            <EventShield>
                                <PortalContainer/>
                                <PortalContainer id='panels'/>
                                <PortalContext id='panels'>
                                    {mounted.panel === 'reference' ? <Reference/> : null}
                                    {mounted.panel === 'options' ? <Preprocess/> : null}
                                    {mounted.panel === 'historical' ? <Recipe id='historical-1'><HistoricalOptions/></Recipe> : null}
                                </PortalContext>
                            </EventShield>
                        )
                        : null}
                    {mounted.actions
                        ? (
                            <>
                                <PortalContainer id='toolbar'/>
                                <PortalContext id='toolbar'>
                                    <Toolbar vertical>
                                        <span data-action='retrieve'><RetrieveButton/></span>
                                    </Toolbar>
                                </PortalContext>
                            </>
                        )
                        : null}
                </Recipe>
            </SourceRuntimeProvider>
        </Provider>
    ))
    await settled()
}

// Whether clicking a toolbar action opens it, as the user would.
const opens = async action => {
    opened.length = 0
    await act(async () => container.querySelector(`[data-action="${action}"] button`).click())
    return opened.includes(action)
}

const PRC_SECTION = 'process.baytsAlerts.panel.preprocess.button'
const ASCENDING_PASS = 'process.baytsHistorical.panel.options.form.orbits.ascending.label'
const DESCENDING_PASS = 'process.baytsHistorical.panel.options.form.orbits.descending.label'
const ORBITS = 'process.baytsHistorical.panel.options.form.orbits.label'
const ORBITS_REQUIRED = 'process.baytsHistorical.panel.options.form.orbits.required'
const TERRAIN_CORRECTION = 'process.baytsHistorical.panel.options.form.geometricCorrection.terrain.label'

const ASSET_INPUT = 'process.baytsAlerts.panel.reference.form.asset.label'
const RECIPE_INPUT = 'process.baytsAlerts.panel.reference.form.recipe.label'

// Selects an asset in REF as a user does: the kind of source beside the input's label, unless already chosen, then the
// asset, typed into the picker and chosen from what it offers.
const selectAsset = async id => {
    await chooseSourceType(ASSET_INPUT)
    const input = field(ASSET_INPUT).querySelector('input')
    await act(async () => input.click())
    await act(async () => type(input, id))
    await act(async () => option(id).click())
    await settled()
}

const selectRecipe = async name => {
    await chooseSourceType(RECIPE_INPUT)
    await openOptions(RECIPE_INPUT)
    await act(async () => type(field(RECIPE_INPUT).querySelector('input'), name))
    await act(async () => option(name).click())
    await settled()
}

const chooseSourceType = async label => {
    if (field(label)) {
        return
    }
    const kind = label === ASSET_INPUT ? 'process.sourceType.ASSET' : 'process.sourceType.RECIPE'
    await act(async () => panelButton(kind).click())
}

// Selects or deselects a choice of several, as clicking it does.
const toggle = label => act(async () => panelButton(label).click())

const openOptions = label => act(async () => field(label).querySelector('input').click())

const offered = () => [...document.querySelectorAll('[data-hook="option"]')].map(element => element.textContent)

// The other asset answering as given.
const answers = bands => fake.assets[OTHER_ASSET] = statsAsset(bands)

// The reference replaced as an applied edit replaces it.
const replaceReference = async reference => {
    await act(async () => actionBuilder('SET_REFERENCE').set(['process.loadedRecipes', ALERTS, 'model.reference'], reference).dispatch())
    await settled()
}

// An asset changed in storage: listed with a new update time, and reporting a new token.
const assetUpdated = async id => {
    fake.versions[id] = 'v2'
    await act(async () => actionBuilder('ASSET_UPDATED')
        .set('assets.user', [STATS_ASSET, OTHER_ASSET].map(asset => ({id: asset, updateTime: asset === id ? 'T2' : 'T1'})))
        .dispatch())
    await settled()
}

const refresh = label => act(async () => buttonNamed(field(label), 'process.source.status.refresh').click())

const type = (input, text) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, text)
    input.dispatchEvent(new Event('input', {bubbles: true}))
}

const option = label => [...document.querySelectorAll('[data-hook="option"]')].find(element => element.textContent === label)

const buttonNamed = (within, name) => [...within.querySelectorAll('button')].find(button => button.textContent === name)

const field = label => document.querySelector(`[data-label="${label}"]`)

// What a field's label says of it as errors: the tooltip of the icon marking them.
const errorsOf = label => {
    const tooltip = field(label).querySelector('[data-feedback="error"]')?.closest('[data-tooltip]')
    return tooltip ? JSON.parse(tooltip.dataset.tooltip) : []
}

const offersRefresh = label => buttonNamed(field(label), 'process.source.status.refresh') !== undefined

const panelButton = label => [...document.querySelectorAll('button')].find(button => button.textContent === label)

const choiceEnabled = label => !panelButton(label).disabled

// An unedited panel offers no Apply.
const applyEnabled = () => panelButton('button.apply')?.disabled === false

const apply = () => act(async () => panelButton('button.apply').click())

const cancel = () => act(async () => panelButton('button.cancel').click())

const alertsRecipe = () => selectFrom(store.getState(), ['process.loadedRecipes', ALERTS])

const referenceStatus = () =>
    selectedSourceStatusOfState(store.getState(), ALERTS, 'reference', id => runtime.evidenceOwnerOf(id))

// What the toolbar marks: the sections held back, and why.
const sourceProblems = () => sourceProblemsOfState(store.getState(), ALERTS, id => runtime.evidenceOwnerOf(id))

// Whether a new request for an operation over the alerts may start, read from the store as it stands.
const gate = operation =>
    requestGate({state: store.getState(), recipe: alertsRecipe(), operation, evidenceOwnerOf: id => runtime.evidenceOwnerOf(id), now: Date.now()})

// What a Retrieve submitted now decides, from the store as it stands.
const decision = () => {
    const {output, pending} = retrieve.readRetrieveOutput()
    return retrieveDecision({output, pending, names: output.bands.map(({name}) => name), destination: 'GEE'}).status
}

const metadataReads = () => fake.calls.filter(([name]) => name === 'assetMetadata').length

const settled = () => act(async () => {})

const answerHeldReads = async () => {
    const held = fake.heldMetadata
    fake.heldMetadata = null
    act(() => held.forEach(answer => answer()))
    await settled()
}
