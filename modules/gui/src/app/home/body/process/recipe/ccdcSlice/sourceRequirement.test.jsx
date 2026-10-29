import React, {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {Recipe} from '~/app/home/body/process/recipeContext'
import {SourceRuntimeProvider, withSourceRuntime} from '~/app/home/body/process/sourceRuntime/sourceRuntimeContext'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {initStore} from '~/store'

// Whether CCDC Slice's source suits what reads it, composed as its editor composes it: the evidence lifecycle, the
// source panel, the toolbar's actions and the chart, over a real store and source runtime. Earth Engine and storage
// are faked.

const fake = vi.hoisted(() => ({
    assets: {}, failing: new Set(), heldMetadata: null, cancelledMetadata: [], versions: {}, calls: [],
    segmentBands: [], heldSegments: null, cancelledSegments: [], graphs: [], stored: {}, heldLoads: null
}))
vi.mock('~/apiRegistry', async () => {
    const {Observable, of, throwError} = await import('rxjs')
    // The evidence's read of an asset; the asset picker's names the types it allows, and is never held or failed.
    const evidenceRead$ = asset => {
        fake.calls.push(['assetMetadata', asset])
        if (fake.heldMetadata) {
            return new Observable(subscriber => {
                let answered = false
                fake.heldMetadata.push(() => {
                    answered = true
                    fake.failing.has(asset)
                        ? subscriber.error(new Error('Earth Engine unreachable'))
                        : subscriber.next(fake.assets[asset])
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
            // A pixel's segments as Earth Engine answers for them: the segment bands and, per band asked for, its fit.
            loadCCDCSegments$: ({bands}) => {
                fake.segmentBands.push(...bands)
                const answer = {
                    tStart: [2018], tEnd: [2024], tBreak: [0], numObs: [100], changeProb: [0],
                    ...Object.fromEntries(bands.flatMap(band => [
                        [`${band}_coefs`, [[0.1, 0, 0, 0, 0, 0, 0, 0]]], [`${band}_rmse`, [0.1]], [`${band}_magnitude`, [0]]
                    ]))
                }
                if (!fake.heldSegments) {
                    return of(answer)
                }
                return new Observable(subscriber => {
                    let answered = false
                    fake.heldSegments.push(() => {
                        answered = true
                        subscriber.next(answer)
                        subscriber.complete()
                    })
                    return () => answered || fake.cancelledSegments.push(...bands)
                })
            },
            assetVersions$: ({ids}) => of({assets: ids.map(id => ({id, type: 'IMAGE', version: fake.versions[id] ?? 'v1'}))})
        },
        // Storage holds the recipes the session does.
        recipe: {
            load$: id => {
                fake.calls.push(['load', id])
                if (!fake.stored[id]) {
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
vi.mock('~/app/home/user/userDetails', () => ({userDetailsHint: () => {}}))
// The source panel opens with the editor, and closes as it does when cancelled or applied.
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
vi.mock('../ccdc/ccdcRecipe', () => ({getAllVisualizations: () => []}))
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

const {SourceEvidenceSync} = await import('../sourceEvidenceSync')
const {sliceObservation} = await import('./sliceObservation')
const {sliceRequirements} = await import('./sourceRequirement')
const {describeSegments$, segmentBandLabels} = await import('../ccdc/segmentDescription')
const {Source} = await import('./panels/source/source')
const {CHART_OPERATIONS, ChartPixel} = await import('./panels/chartPixel')
const {ChartPixelButton} = await import('../chartPixelButton')
const {RetrieveButton} = await import('../retrieveButton')
const {MapContext} = await import('~/app/home/map/mapContext')
const {Toolbar} = await import('~/widget/toolbar/toolbar')
const {EventShield} = await import('~/widget/eventShield')
const {PortalContainer, PortalContext} = await import('~/widget/portal')
const {actionBuilder} = await import('~/action-builder')
const {IMAGE_OUTPUT} = await import('../recipeOutput')
const {CHECKING_SOURCE, selectedSourceStatusOfState, UNSUITABLE_SOURCE} = await import('../selectedSourceStatus')
const {requestGate} = await import('../sourceRequirements')

registry.CCDC_SLICE = {sourceRequirements: sliceRequirements, sourceObservation: sliceObservation}
registry.CCDC = {id: 'CCDC', describeSegments$, segmentBandLabels}
registry.MASKING = {id: 'MASKING'}
registry.MOSAIC = {id: 'MOSAIC'}

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const SLICE = 'slice-1'
const SEGMENTS_ASSET = 'users/x/segments'
const OTHER_ASSET = 'users/x/other-segments'

let root, container, store, runtime

beforeEach(() => {
    fake.assets = {[SEGMENTS_ASSET]: segmentsAsset(VALID_BANDS), [OTHER_ASSET]: segmentsAsset(VALID_BANDS)}
    fake.failing = new Set()
    fake.heldMetadata = null
    fake.cancelledMetadata = []
    fake.versions = {}
    fake.calls = []
    fake.segmentBands = []
    fake.heldSegments = null
    fake.cancelledSegments = []
    fake.graphs = []
    fake.stored = Object.fromEntries(RECORDS.map(record => [record.id, record]))
    fake.heldLoads = null
})

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    container?.remove()
})

describe('a source CCDC Slice can slice', () => {
    it.each([
        ['a CCDC recipe', ref('ccdc-1')],
        ['a Masking over CCDC', ref('masking-ccdc')],
        ['an asset with every measure complete', ASSET]
    ])('is accepted, saying nothing in SRC and holding back no operation, for %s', async (_case, selection) => {
        await editor({selection, actions: true})

        expect(sourceStatus()).toBe(null)
        expect(retrieveGate()).toBe(null)
        expect(await opens('retrieve')).toBe(true)
        expect(await opens('chart')).toBe(true)
    })

    it('is checked with the editor closed, where only an operation over the slice watches it', async () => {
        await editor({selection: ASSET, owner: false, watching: [IMAGE_OUTPUT]})

        expect(retrieveGate()).toBe(null)
        expect(metadataReads()).toBe(1)
    })
})

describe('a source CCDC Slice cannot slice', () => {
    it('marks SRC, keeps the selection, and holds back Retrieve and the chart', async () => {
        await editor({selection: ref('masking-mosaic'), actions: true})

        expect(sourceStatus()).toMatchObject({state: UNSUITABLE_SOURCE})
        expect(sliceRecipe().model.source).toEqual(ref('masking-mosaic'))
        expect(retrieveGate()).toMatchObject({code: 'SOURCE_UNSUITABLE'})
        expect(await opens('retrieve')).toBe(false)
        expect(await opens('chart')).toBe(false)
    })

    // NDVI complete; NBR without its magnitude, which a slice reads and the chart of NDVI does not.
    it('holds back only Retrieve where a measure is incomplete beside one the chart can plot', async () => {
        fake.assets[SEGMENTS_ASSET] = segmentsAsset([...VALID_BANDS, ['nbr_coefs', 2], ['nbr_rmse', 1]])

        await editor({selection: ASSET, actions: true})

        expect(sourceStatus()).toMatchObject({state: UNSUITABLE_SOURCE})
        expect(await opens('retrieve')).toBe(false)
        expect(await opens('chart')).toBe(true)
    })
})

describe('a source selected in SRC', () => {
    it.each([
        ['missing a band', 'process.source.segments.missingBand', false, () => answers(without(VALID_BANDS, 'changeProb'))],
        ['with a band of the wrong rank', 'process.source.segments.wrongDimensions', false, () => answers([...without(VALID_BANDS, 'ndvi_coefs'), ['ndvi_coefs', 1]])],
        ['whose ranks its metadata does not establish', 'process.source.segments.undetermined', false, () => answers(VALID_BANDS.map(([name]) => [name, null]))],
        ['that cannot be read', 'process.source.status.assetUnavailable', true, () => fake.failing.add(OTHER_ASSET)]
    ])('is held back before Apply when %s, with that as its error, and the slice keeps its source', async (_case, diagnostic, refresh, arrange) => {
        await editor({selection: ASSET, panel: true})
        arrange()

        await selectAsset(OTHER_ASSET)

        expect(applyEnabled()).toBe(false)
        expect(errorsOf(ASSET_INPUT).join('\n')).toContain(diagnostic)
        expect(offersRefresh(ASSET_INPUT)).toBe(refresh)
        expect(sliceRecipe().model.source).toEqual(ASSET)
    })

    it('is refused before Apply where the recipe selected cannot supply segments, said on its input', async () => {
        await editor({selection: ref('ccdc-1'), panel: true})

        await selectRecipe('Forest mask')

        expect(applyEnabled()).toBe(false)
        expect(errorsOf(RECIPE_INPUT)).not.toEqual([])
        expect(sliceRecipe().model.source).toEqual(ref('ccdc-1'))
    })

    it('is applied when it suits, replacing a saved source that does not', async () => {
        await editor({selection: ref('masking-mosaic'), panel: true})

        await selectRecipe('Masked CCDC')
        await apply()

        expect(sliceRecipe().model.source).toMatchObject(ref('masking-ccdc'))
        expect(sourceStatus()).toBe(null)
    })

    it('shows itself busy while it is checked, and is held back until it is known to suit', async () => {
        await editor({selection: ref('ccdc-1'), panel: true})
        fake.heldMetadata = []

        await selectAsset(OTHER_ASSET)

        expect(applyEnabled()).toBe(false)
        expect(errorsOf(ASSET_INPUT)).toEqual([])
        await answerHeldReads()
        expect(applyEnabled()).toBe(true)
    })

    it('is let go on Cancel, leaving the slice\'s source and evidence as they were', async () => {
        await editor({selection: ref('masking-mosaic'), panel: true})
        const evidence = sliceRecipe().ui.sourceEvidence

        await selectRecipe('Masked CCDC')
        await cancel()

        expect(sliceRecipe().model.source).toEqual(ref('masking-mosaic'))
        expect(sliceRecipe().ui.sourceEvidence).toBe(evidence)
        expect(sourceStatus()).toMatchObject({state: UNSUITABLE_SOURCE})
    })

    it('offers recipes that may provide segments, whatever their type, and no others', async () => {
        await editor({selection: ref('ccdc-1'), panel: true})

        await chooseSourceType(RECIPE_INPUT)
        await openOptions(RECIPE_INPUT)

        expect(offered()).toEqual(expect.arrayContaining(['CCDC', 'Masked CCDC', 'Forest mask']))
        expect(offered()).not.toContain('Sentinel 2021')
    })
})

describe('the source\'s evidence', () => {
    it('is read once for the editor, the chart and an operation watching it', async () => {
        await editor({selection: ASSET, chart: true, watching: [IMAGE_OUTPUT]})

        expect(metadataReads()).toBe(1)
    })

    it('is let go with the last watcher: its read is cancelled', async () => {
        fake.heldMetadata = []
        await editor({selection: ASSET, owner: false, watching: [IMAGE_OUTPUT]})

        await act(async () => root.unmount())
        root = null

        expect(fake.cancelledMetadata).toEqual([SEGMENTS_ASSET])
    })

    it('that could not be read is read again on Refresh, and then suits', async () => {
        fake.failing.add(SEGMENTS_ASSET)
        await editor({selection: ASSET, panel: true})
        expect(retrieveGate()).toMatchObject({code: 'SOURCE_UNAVAILABLE'})

        fake.failing.delete(SEGMENTS_ASSET)
        await refresh(ASSET_INPUT)

        expect(retrieveGate()).toBe(null)
    })
})

describe('the source the saved layers were styled for', () => {
    it('is recorded once the slice is first observed, with its editor closed', async () => {
        await editor({selection: ASSET, owner: false, watching: [IMAGE_OUTPUT]})

        expect(sliceRecipe().ui.savedLayerSource).toBe(`ASSET:${SEGMENTS_ASSET}`)
    })

    it('is not recorded again, and nothing is read again, when the editor opens after a map observed the slice', async () => {
        await editor({selection: ASSET, owner: false, watching: [IMAGE_OUTPUT]})
        const recorded = sliceRecipe().ui

        await showEditor()

        expect(sliceRecipe().ui.savedLayerSource).toBe(recorded.savedLayerSource)
        expect(sliceRecipe().ui.sourceEvidence).toBe(recorded.sourceEvidence)
        expect(metadataReads()).toBe(1)
    })

    it('is never replaced once recorded', async () => {
        await editor({selection: ASSET, savedLayerSource: `ASSET:${OTHER_ASSET}`})

        expect(sliceRecipe().ui.savedLayerSource).toBe(`ASSET:${OTHER_ASSET}`)
    })
})

describe('the chart and Retrieve actions', () => {
    it('cannot be opened while the source is being checked, and can once it is known to suit', async () => {
        fake.heldMetadata = []
        await editor({selection: ASSET, actions: true})

        expect(sourceStatus()).toMatchObject({state: CHECKING_SOURCE})
        expect(await opens('chart')).toBe(false)
        expect(await opens('retrieve')).toBe(false)

        await answerHeldReads()

        expect(await opens('chart')).toBe(true)
        expect(await opens('retrieve')).toBe(true)
    })
})

describe('the segment chart', () => {
    it('requests nothing while the source is being checked, and charts a band the source has once it suits', async () => {
        fake.heldMetadata = []
        await editor({selection: ASSET, chart: true})

        expect(fake.segmentBands).toEqual([])

        await answerHeldReads()

        expect(fake.segmentBands).toEqual(['ndvi'])
        expect(fake.graphs.at(-1)).toMatchObject({band: 'ndvi'})
    })

    it('replaces a band the source no longer has before requesting, letting go of what was read for the old one', async () => {
        fake.heldSegments = []
        await editor({selection: ASSET, chart: true})
        expect(fake.segmentBands).toEqual(['ndvi'])

        await replaceSource({type: 'ASSET', id: OTHER_ASSET}, segmentsAsset(RADAR_BANDS))

        expect(fake.cancelledSegments).toEqual(['ndvi'])
        expect(fake.segmentBands).toEqual(['ndvi', 'VV'])
        await answerHeldSegments()
        expect(fake.graphs.map(({band}) => band)).toEqual(['VV'])
    })

    it('withdraws what it drew once the source no longer suits, and charts again once one does', async () => {
        await editor({selection: ASSET, chart: true})

        await replaceSource(ref('masking-mosaic'))

        expect(chartText()).toContain('process.source.status.withheld')
        expect(fake.segmentBands).toEqual(['ndvi'])

        await replaceSource({type: 'ASSET', id: OTHER_ASSET})

        expect(chartText()).not.toContain('process.source.status.withheld')
        expect(fake.segmentBands).toEqual(['ndvi', 'ndvi'])
        expect(fake.graphs.at(-1)).toMatchObject({band: 'ndvi'})
    })

    it('takes its samples once, and again once the asset reports a new token, though nothing described changed', async () => {
        await editor({selection: ASSET, chart: true})
        expect(fake.segmentBands).toEqual(['ndvi'])

        await assetUpdated(SEGMENTS_ASSET)

        expect(fake.segmentBands).toEqual(['ndvi', 'ndvi'])
    })
})

// /ccdc/loadSegments builds a recipe source as that recipe's own image, over its own AOI (PIXEL_SEGMENTS of CCDC_SLICE),
// so the chart is held to what running it needs - the source's own requirements and those of what it builds - beside
// what its segments need. A Masking needs its mask; the CCDC it masks needs nothing more here.
describe('the segment chart over a recipe it builds as that recipe\'s own image', () => {
    it('is closed once the source can no longer run, letting go of its request, and offered again once it can', async () => {
        fake.heldSegments = []
        await editor({selection: ref('masking-ccdc'), chart: true, actions: true})
        expect(fake.segmentBands).toEqual(['ndvi'])

        await editRecord('masking-ccdc', {imageMask: null})

        expect(sliceRecipe().ui.chartPixel).toBe(null)
        expect(fake.cancelledSegments).toEqual(['ndvi'])
        await answerHeldSegments()
        expect(fake.graphs).toEqual([])
        expect(await opens('chart')).toBe(false)

        await editRecord('masking-ccdc', {imageMask: ref('mosaic-1')})

        expect(await opens('chart')).toBe(true)
    })

    it('lets go of its request while what the source builds is read, and requests once it can run', async () => {
        fake.heldSegments = []
        fake.stored['mosaic-2'] = {id: 'mosaic-2', name: 'Sentinel 2022', type: 'MOSAIC', model: {}, revision: 1}
        await editor({selection: ref('masking-ccdc'), chart: true})
        fake.heldLoads = []

        await editRecord('masking-ccdc', {imageMask: ref('mosaic-2')})

        expect(fake.cancelledSegments).toEqual(['ndvi'])
        expect(fake.segmentBands).toEqual(['ndvi'])
        await answerHeldLoads()
        expect(fake.segmentBands).toEqual(['ndvi', 'ndvi'])
    })

    // A CCDC parameter changes the segments, not the bands they are described by.
    it('reads again once what the source builds changes, though nothing it describes does, letting go of what it read', async () => {
        fake.heldSegments = []
        await editor({selection: ref('masking-ccdc'), chart: true})

        await editRecord('ccdc-1', {ccdcOptions: {dateFormat: 1, minObservations: 8}})

        expect(fake.cancelledSegments).toEqual(['ndvi'])
        expect(fake.segmentBands).toEqual(['ndvi', 'ndvi'])
    })

    it('waits for an edit to what the source builds to be saved, then reads once', async () => {
        await editor({selection: ref('masking-ccdc'), chart: true})

        await saveEdit('ccdc-1', {ccdcOptions: {dateFormat: 1, minObservations: 8}})
        expect(fake.segmentBands).toEqual(['ndvi'])

        await saved('ccdc-1')
        expect(fake.segmentBands).toEqual(['ndvi', 'ndvi'])
    })

    it('reads nothing again for a title, layout, ui or unrelated recipe', async () => {
        await editor({selection: ref('masking-ccdc'), chart: true})

        await act(async () => actionBuilder('UNRELATED')
            .set(['process.loadedRecipes', 'ccdc-1', 'title'], 'Renamed')
            .set(['process.loadedRecipes', 'ccdc-1', 'layers'], {areas: {center: {}}})
            .set(['process.loadedRecipes', 'ccdc-1', 'ui'], {initialized: true})
            .set(['process.loadedRecipes', 'other-1'], {id: 'other-1', type: 'MOSAIC', model: {}})
            .dispatch())
        await settled()

        expect(fake.segmentBands).toEqual(['ndvi'])
    })

    it('reads nothing again for a source selected in SRC and cancelled', async () => {
        await editor({selection: ref('masking-ccdc'), chart: true, panel: true})

        await selectRecipe('CCDC')
        await cancel()

        expect(sliceRecipe().model.source).toEqual(ref('masking-ccdc'))
        expect(fake.segmentBands).toEqual(['ndvi'])
    })
})

// Which bands the chart offers is the source's to say (pixelChartAvailability); how they are labelled is the producer's
// (segmentBandLabels), from the records the chart's operation resolved. A band is chosen, requested and plotted by name.
describe('the segment chart\'s band choices', () => {
    it('are labelled as the CCDC labels them, and the band chosen is requested and plotted by name', async () => {
        await editor({selection: ref('ccdc-classified'), chart: true})

        const choices = await bandChoices()
        expect(choices).toEqual(expect.arrayContaining(['ndvi', 'blue', REGRESSION, FOREST, WATER]))
        expect(choices).not.toContain('regression')
        expect(choices).not.toContain('probability_1')

        await chooseBand(FOREST)

        expect(fake.segmentBands.at(-1)).toBe('probability_1')
        expect(fake.graphs.at(-1)).toMatchObject({band: 'probability_1'})
    })

    it('name a probability band by its class as the Classification labels it now, keeping the band chosen', async () => {
        await editor({selection: ref('ccdc-classified'), chart: true})
        await chooseBand(FOREST)

        await editRecord('classification-1', {legend: legend('Primary forest', 'Water')})

        const choices = await bandChoices()
        expect(choices).toContain(PRIMARY_FOREST)
        expect(choices).not.toContain(FOREST)
        expect(chosenBandLabel()).toBe(PRIMARY_FOREST)
        expect(fake.segmentBands.at(-1)).toBe('probability_1')
        expect(fake.graphs.at(-1)).toMatchObject({band: 'probability_1'})
    })

    it('keep bands apart whose classes are labelled alike', async () => {
        await editor({selection: ref('ccdc-classified'), chart: true})
        await editRecord('classification-1', {legend: legend('Forest', 'Forest')})

        expect((await bandChoices()).filter(choice => choice === FOREST)).toHaveLength(2)

        await chooseBand(FOREST, 1)

        expect(fake.segmentBands.at(-1)).toBe('probability_2')
        expect(fake.graphs.at(-1)).toMatchObject({band: 'probability_2'})
    })

    // `constructor` is a name an object inherits a value for, so no label is found for it either.
    it.each(['probability_1', 'constructor'])('are named as an asset names its bands, in its order, with no recipe read for them: %s', async band => {
        fake.assets[SEGMENTS_ASSET] = segmentsAsset([...VALID_BANDS, ...measureBands(band)])
        await editor({selection: ASSET, chart: true})

        expect(await bandChoices()).toEqual(['ndvi', band])

        await chooseBand(band)

        expect(chosenBandLabel()).toBe(band)
        expect(fake.segmentBands.at(-1)).toBe(band)
        expect(fake.graphs.at(-1)).toMatchObject({band})
        expect(fake.calls.filter(([call, id]) => call === 'load' && id !== SLICE)).toEqual([])
    })
})

const REGRESSION = 'process.classification.bands.regression'
const probabilityOf = label => `process.classification.bands.probability ${JSON.stringify({class: label})}`
const FOREST = probabilityOf('Forest')
const WATER = probabilityOf('Water')
const PRIMARY_FOREST = probabilityOf('Primary forest')

const ASSET = {type: 'ASSET', id: SEGMENTS_ASSET, dateFormat: 1}

const SEGMENT_BANDS = [['tStart', 1], ['tEnd', 1], ['tBreak', 1], ['numObs', 1], ['changeProb', 1]]

// A measure as segments carry it: its coefficients, RMSE and magnitude.
const measureBands = name => [[`${name}_coefs`, 2], [`${name}_rmse`, 1], [`${name}_magnitude`, 1]]

const VALID_BANDS = [...SEGMENT_BANDS, ...measureBands('ndvi')]
const RADAR_BANDS = [...SEGMENT_BANDS, ...measureBands('VV')]

const without = (bands, name) => bands.filter(([band]) => band !== name)

function ref(id) {
    return {type: 'RECIPE_REF', id}
}

const RECORDS = [
    {id: 'masking-ccdc', name: 'Masked CCDC', type: 'MASKING', model: {imageToMask: ref('ccdc-1'), imageMask: ref('mosaic-1')}},
    {id: 'masking-mosaic', name: 'Forest mask', type: 'MASKING', model: {imageToMask: ref('mosaic-1'), imageMask: ref('mosaic-1')}},
    {id: 'mosaic-1', name: 'Sentinel 2021', type: 'MOSAIC', model: {}},
    // Described from its configuration, so what a Classification over it is trained on is known.
    {
        id: 'mosaic-s2', name: 'Sentinel 2023', type: 'MOSAIC',
        model: {
            dates: {targetDate: '2023-07-01', seasonStart: '2023-01-01', seasonEnd: '2024-01-01', yearsBefore: 0, yearsAfter: 0},
            sources: {dataSets: {SENTINEL_2: ['SENTINEL_2']}, cloudPercentageThreshold: 100},
            compositeOptions: {corrections: ['SR'], compose: 'MEDIAN'}
        }
    },
    {
        id: 'ccdc-classified', name: 'Classified CCDC', type: 'CCDC',
        model: {
            sources: {dataSets: {LANDSAT: ['LANDSAT_9']}, classification: 'classification-1'},
            options: {corrections: []},
            ccdcOptions: {dateFormat: 1},
            dates: {startDate: '2017-01-01', endDate: '2021-01-01'}
        }
    },
    {
        id: 'classification-1', name: 'Land cover', type: 'CLASSIFICATION',
        model: {
            inputImagery: {images: [{imageId: 'i-1', type: 'RECIPE_REF', id: 'mosaic-s2', bandSetSpecs: [{id: 'b', type: 'IMAGE_BANDS', class: 'IMAGE_BANDS', included: ['red', 'nir']}]}]},
            legend: legend('Forest', 'Water'),
            classifier: {type: 'RANDOM_FOREST'},
            trainingData: {dataSets: [{dataSetId: 'collected', type: 'COLLECTED', name: 'Collected', referenceData: [{x: 1, y: 1, class: 1}, {x: 2, y: 2, class: 2}]}]}
        }
    },
    {
        id: 'ccdc-1', name: 'CCDC', type: 'CCDC',
        model: {
            sources: {dataSets: {LANDSAT: ['LANDSAT_9']}},
            options: {corrections: []},
            ccdcOptions: {dateFormat: 1},
            dates: {startDate: '2017-01-01', endDate: '2021-01-01'}
        }
    }
].map(record => ({...record, revision: 1}))

// A Classification's legend: a class for each label, valued from 1.
function legend(...labels) {
    return {entries: labels.map((label, index) => ({id: `class-${index + 1}`, value: index + 1, label, color: '#000000'}))}
}

const LISTING = [
    {id: SLICE, name: 'Slice', type: 'CCDC_SLICE', revision: 1},
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

const RuntimeProbe = compose(props => {
    runtime = props.sourceRuntime
    return null
}, withSourceRuntime())

// What watches the slice for an operation over it with its editor closed, as a layer or a Retrieve does.
class _OperationWatch extends React.Component {
    render() {
        return null
    }

    componentDidMount() {
        const {operation, sourceRuntime} = this.props
        this.watch = sourceRuntime.watchEvidence$({recipeId: SLICE, operation}).subscribe()
    }

    componentWillUnmount() {
        this.watch.unsubscribe()
    }
}
const OperationWatch = compose(_OperationWatch, withSourceRuntime())

const sessionState = ({selection, savedLayerSource}) => ({
    user: {currentUser: {googleTokens: {accessToken: 'token'}}},
    process: {
        loadedRecipes: {
            [SLICE]: {
                id: SLICE, type: 'CCDC_SLICE', revision: 1,
                model: {
                    source: selection,
                    date: {dateType: 'SINGLE', date: '2020-06-01'},
                    options: {gapStrategy: 'INTERPOLATE', harmonics: 3}
                },
                ui: {initialized: true, ...(savedLayerSource && {savedLayerSource})}
            },
            ...Object.fromEntries(RECORDS.map(record => [record.id, record]))
        },
        recipes: LISTING,
        recipeListing: {checkedAt: Date.now()},
        saveStates: {},
        projects: [],
        tabs: [{id: SLICE}]
    },
    assets: {user: [SEGMENTS_ASSET, OTHER_ASSET].map(id => ({id, updateTime: 'T1'})), other: []},
    dimensions: {width: 1024, height: 768}
})

let mounted

// The slice as its editor shows it - the editor's watch (`owner`), its source panel, its toolbar's actions and its chart
// at a pixel - beside whatever else watches it for an operation over it.
const editor = async ({selection, savedLayerSource, owner = true, panel = false, actions = false, chart = false, watching = []}) => {
    const initialState = sessionState({selection, savedLayerSource})
    store = createStore((state = initialState, action) => action.reduce ? action.reduce(state) : state)
    initStore(store)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    mounted = {owner, panel, actions, chart, watching}
    await render()
    if (chart) {
        act(() => actionBuilder('CHART_PIXEL').set(['process.loadedRecipes', SLICE, 'ui.chartPixel'], {lat: 0, lng: 0}).dispatch())
    }
    await settled()
}

// The editor opened beside what is already shown.
const showEditor = async () => {
    mounted = {...mounted, owner: true}
    await render()
    await settled()
}

const render = () => act(async () => root.render(
    <Provider store={store}>
        <SourceRuntimeProvider>
            <RuntimeProbe/>
            {mounted.watching.map(operation => <OperationWatch key={operation} operation={operation}/>)}
            <Recipe id={SLICE}>
                {mounted.owner ? <SourceEvidenceSync observation={sliceObservation}/> : null}
                {mounted.panel
                    ? (
                        <EventShield>
                            <PortalContainer/>
                            <PortalContainer id='panels'/>
                            <PortalContext id='panels'>
                                <Source/>
                            </PortalContext>
                        </EventShield>
                    )
                    : null}
                {mounted.actions
                    ? (
                        <MapContext map={SELECTING_MAP}>
                            <PortalContainer/>
                            <PortalContainer id='toolbar'/>
                            <PortalContext id='toolbar'>
                                <Toolbar vertical>
                                    <span data-action='chart'><ChartPixelButton operations={CHART_OPERATIONS} onPixelSelected={() => {}}/></span>
                                    <span data-action='retrieve'><RetrieveButton/></span>
                                </Toolbar>
                            </PortalContext>
                        </MapContext>
                    )
                    : null}
                {mounted.chart
                    ? (
                        <EventShield>
                            <PortalContainer/>
                            <PortalContainer id='chart-panel'/>
                            <PortalContext id='chart-panel'>
                                <ChartPixel/>
                            </PortalContext>
                        </EventShield>
                    )
                    : null}
            </Recipe>
        </SourceRuntimeProvider>
    </Provider>
))

// Starting a pixel selection is what opening the chart does.
const SELECTING_MAP = {
    addOneShotClickListener: () => {
        opened.push('chart')
        return {remove: () => {}}
    },
    enterInteractionMode: () => ({remove: () => {}})
}

// Whether clicking a toolbar action opens it, as the user would.
const opens = async action => {
    opened.length = 0
    await act(async () => container.querySelector(`[data-action="${action}"] button`).click())
    return opened.includes(action)
}

const ASSET_INPUT = 'process.ccdcSlice.panel.source.form.asset.label'
const RECIPE_INPUT = 'process.ccdcSlice.panel.source.form.recipe.label'

// Selects an asset in SRC as a user does: the kind of source beside the input's label, unless already chosen, then the
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

const openOptions = label => act(async () => field(label).querySelector('input').click())

const offered = () => [...document.querySelectorAll('[data-hook="option"]')].map(element => element.textContent)

// The source the slice is configured with, replaced as an applied edit replaces it; an asset now answering as given.
const replaceSource = async (source, metadata) => {
    if (metadata) {
        fake.assets[source.id] = metadata
    }
    await act(async () => actionBuilder('SET_SOURCE').set(['process.loadedRecipes', SLICE, 'model.source'], source).dispatch())
    await settled()
}

const refresh = label => act(async () => buttonNamed(field(label), 'process.source.status.refresh').click())

// The other asset answering as given.
const answers = bands => fake.assets[OTHER_ASSET] = segmentsAsset(bands)

// An asset changed in storage: listed with a new update time, and reporting a new token.
const assetUpdated = async id => {
    fake.versions[id] = 'v2'
    await act(async () => actionBuilder('ASSET_UPDATED')
        .set('assets.user', [SEGMENTS_ASSET, OTHER_ASSET].map(asset => ({id: asset, updateTime: asset === id ? 'T2' : 'T1'})))
        .dispatch())
    await settled()
}

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

const applyEnabled = () => !panelButton('button.apply').disabled

const apply = () => act(async () => panelButton('button.apply').click())

const cancel = () => act(async () => panelButton('button.cancel').click())

const chartText = () => container.textContent

const sliceRecipe = () => selectFrom(store.getState(), ['process.loadedRecipes', SLICE])

const sourceStatus = () =>
    selectedSourceStatusOfState(store.getState(), SLICE, 'source', id => runtime.evidenceOwnerOf(id))

// Why a Retrieve of the slice may not be submitted now, as far as its source decides that.
const retrieveGate = () => requestGate({
    state: store.getState(), recipe: sliceRecipe(), operation: IMAGE_OUTPUT, evidenceOwnerOf: id => runtime.evidenceOwnerOf(id), now: Date.now()
})

const metadataReads = () => fake.calls.filter(([name]) => name === 'assetMetadata').length

const settled = () => act(async () => {})

const answerHeldReads = async () => {
    const held = fake.heldMetadata
    fake.heldMetadata = null
    act(() => held.forEach(answer => answer()))
    await settled()
}

const answerHeldLoads = async () => {
    const held = fake.heldLoads
    fake.heldLoads = null
    act(() => held.forEach(answer => answer()))
    await settled()
}

// An edit to a recipe closed while its save is still settling; then the save storage acknowledges, its revision adopted.
const saveEdit = async (id, changes) => {
    const model = {...sliceRecordOf(id).model, ...changes}
    await act(async () => actionBuilder('EDIT')
        .set(['process.loadedRecipes', id, 'model'], model)
        .set(['process.saveStates', id], {status: 'SAVING', revision: 1})
        .dispatch())
    await settled()
}

const saved = async id => {
    const record = {...sliceRecordOf(id), revision: 2}
    fake.stored[id] = record
    await act(async () => actionBuilder('SAVED')
        .set(['process.loadedRecipes', id], record)
        .set(['process.saveStates', id], {status: 'SAVED', revision: 2, model: record.model})
        .set('process.recipes', LISTING.map(summary => summary.id === id ? {...summary, revision: 2} : summary))
        .dispatch())
    await settled()
}

const sliceRecordOf = id => selectFrom(store.getState(), ['process.loadedRecipes', id])

// A recipe the slice's source reads, edited in this session.
const editRecord = async (id, model) => {
    await act(async () => actionBuilder('EDIT_RECORD').assign(['process.loadedRecipes', id, 'model'], model).dispatch())
    await settled()
}

// The chart's band choices, as its band selector offers them once opened.
const bandChoices = async () => {
    await act(async () => bandSelector().click())
    const choices = offered()
    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true})))
    return choices
}

// A band chosen in the chart's band selector by the label it is offered under; `nth` of several offered alike.
const chooseBand = async (label, nth = 0) => {
    await act(async () => bandSelector().click())
    await act(async () => [...document.querySelectorAll('[data-hook="option"]')].filter(element => element.textContent === label)[nth].click())
    await settled()
}

const bandSelector = () => document.getElementById('chart-panel').querySelector('input')

// What the band selector shows as chosen while closed: its placeholder.
const chosenBandLabel = () => bandSelector().placeholder

const answerHeldSegments = async () => {
    const held = fake.heldSegments
    fake.heldSegments = null
    act(() => held.forEach(answer => answer()))
    await settled()
}
