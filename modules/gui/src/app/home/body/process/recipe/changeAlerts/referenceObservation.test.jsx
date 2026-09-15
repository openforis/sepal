import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {firstValueFrom, of, Subject, throwError} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {Recipe} from '~/app/home/body/process/recipeContext'
import {selectFrom} from '~/stateUtils'
import {initStore} from '~/store'

// Mounts the real lifecycle and observation against a Redux store; remote reads and presentation are faked.
const assetMetadata$ = vi.fn()
const loadRecipe$ = vi.fn()
vi.mock('~/apiRegistry', () => ({default: {
    gee: {assetMetadata$: (...args) => assetMetadata$(...args)},
    recipe: {load$: (...args) => loadRecipe$(...args)}
}}))
vi.mock('~/translate', () => ({msg: key => key}))
vi.mock('~/widget/notifications', () => ({Notifications: {error: () => {}}}))
vi.mock('~/widget/form/assetCombo', () => ({FormAssetCombo: () => null}))
vi.mock('~/sources', () => ({getAvailableBands: ({dataSets}) => dataSets.map(dataSet => dataSet.toLowerCase())}))
vi.mock('../ccdc/ccdcRecipe', () => ({getAllVisualizations: recipe => recipe.model.templates || []}))
vi.mock('~/app/home/body/process/recipeTypeRegistry', async () => {
    const {describeSegments$} = await import('../ccdc/segmentDescription')
    const {describeSegmentsAsset$} = await import('../ccdc/segmentsAsset')
    return {
        getRecipeType: type => ({
            CCDC: {describeSegments$},
            ASSET_MOSAIC: {describeSegments$: ({recipe}) => describeSegmentsAsset$(recipe.model.assetDetails.assetId)}
        })[type]
    }
})

const {SourceEvidenceSync} = await import('../sourceEvidenceSync')
const {changeAlertsObservation} = await import('./referenceObservation')
const {baseBandsOf} = await import('./referenceEvidence')

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const ALERTS = 'alerts-1'
const MASKING = 'masking-1'
const CCDC = 'ccdc-1'
const SEGMENTS_ASSET = 'users/x/segments'
const WRAPPED_ASSET = 'masking-over-asset'
const ASSET_MOSAIC = 'asset-mosaic-1'

let root, container, store

beforeEach(() => {
    assetMetadata$.mockReset()
    loadRecipe$.mockReset()
    loadRecipe$.mockReturnValue(throwError(() => new Error('Recipe not found')))
})

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    container?.remove()
    vi.restoreAllMocks()
})

describe('selecting a recipe as the reference', () => {
    it.each([CCDC, MASKING])('observes %s without replacing or decorating the selected reference', id => {
        const selection = {type: 'RECIPE_REF', id}

        sync({selection})

        expect(reference()).toEqual(selection)
        expect(baseBandsOf(alertsRecipe()).map(({name}) => name)).toEqual(['red', 'nir'])
    })

    it('does not reset the monitoring configuration the user has chosen', () => {
        sync({
            selection: {type: 'RECIPE_REF', id: MASKING},
            sources: {band: 'nir', dataSetType: 'OPTICAL', cloudPercentageThreshold: 42}
        })

        expect(sources()).toMatchObject({
            band: 'nir',
            dataSetType: 'OPTICAL',
            cloudPercentageThreshold: 42,
            dataSets: {LANDSAT: ['RED', 'NIR']}
        })
    })
})

describe('the producer of a selected recipe', () => {
    it('supplies refreshed datasets and corrections when it changes', async () => {
        sync({selection: {type: 'RECIPE_REF', id: MASKING}})

        await update(CCDC, {
            sources: {dataSets: {SENTINEL_1: ['SENTINEL_1']}},
            options: {corrections: []}
        })

        expect(sources().dataSets).toEqual({SENTINEL_1: ['SENTINEL_1']})
        expect(alertsRecipe().model.options).toEqual({corrections: []})
        expect(baseBandsOf(alertsRecipe()).map(({name}) => name)).toEqual(['sentinel_1'])
    })

    it('is the asset a wrapper leads to, whose exported configuration seeds monitoring', async () => {
        assetMetadata$.mockReturnValue(of(assetMetadata({
            dateFormat: 2,
            recipe_sources: JSON.stringify({dataSets: {SENTINEL_1: ['SENTINEL_1']}}),
            recipe_options: JSON.stringify({corrections: ['SPECKLE']})
        })))

        sync({selection: {type: 'RECIPE_REF', id: WRAPPED_ASSET}})
        await settled()

        expect(sources().dataSets).toEqual({SENTINEL_1: ['SENTINEL_1']})
        expect(alertsRecipe().model.options).toEqual({corrections: ['SPECKLE']})
        expect(baseBandsOf(alertsRecipe()).map(({name}) => name)).toEqual(['red'])
        expect(reference()).toEqual({type: 'RECIPE_REF', id: WRAPPED_ASSET})
    })
})

describe('an observation repeated for another reason', () => {
    it('leaves monitoring settings the user has edited alone', async () => {
        sync({selection: {type: 'RECIPE_REF', id: MASKING}})
        await settled()

        await update(ALERTS, {
            sources: {...sources(), dataSets: {LANDSAT: ['SWIR1']}},
            options: {corrections: []}
        })
        await update(CCDC, {dates: {startDate: '2016-01-01', endDate: '2021-01-01'}})

        expect(sources().dataSets).toEqual({LANDSAT: ['SWIR1']})
        expect(alertsRecipe().model.options).toEqual({corrections: []})
    })
})

describe('an asset re-exported under the same selection', () => {
    it('refreshes monitoring settings and keeps a corrected date representation', async () => {
        assetStates({dateFormat: 2, recipe_sources: JSON.stringify({dataSets: {LANDSAT: ['RED']}})})
        sync({selection: {type: 'ASSET', id: SEGMENTS_ASSET}})
        await settled()
        expect(reference().dateFormat).toBe(2)
        await update(ALERTS, {reference: {type: 'ASSET', id: SEGMENTS_ASSET, dateFormat: 0}})

        assetStates({dateFormat: 2, recipe_sources: JSON.stringify({dataSets: {SENTINEL_1: ['SENTINEL_1']}})})
        await reExport()

        expect(sources().dataSets).toEqual({SENTINEL_1: ['SENTINEL_1']})
        expect(reference().dateFormat).toBe(0)
    })

    it('does not restore settings the user edited when only its date representation changed', async () => {
        assetStates({dateFormat: 2, recipe_sources: JSON.stringify({dataSets: {LANDSAT: ['RED']}})})
        sync({selection: {type: 'ASSET', id: SEGMENTS_ASSET}})
        await settled()
        await update(ALERTS, {sources: {dataSets: {LANDSAT: ['NIR']}, band: 'nir'}})

        assetStates({dateFormat: 1, recipe_sources: JSON.stringify({dataSets: {LANDSAT: ['RED']}})})
        await reExport()

        expect(sources()).toEqual({dataSets: {LANDSAT: ['NIR']}, band: 'nir'})
    })
})

describe('a consumer whose own configuration has lost a dependency', () => {
    it('can initialize a newly selected source despite obsolete monitoring dependencies', async () => {
        sync({
            selection: {type: 'RECIPE_REF', id: 'missing-reference'},
            sources: {classification: 'deleted-1', dataSets: {LANDSAT: ['SWIR1']}}
        })
        await settled()
        expect(alertsRecipe().ui.sourceEvidence.status).toBe('UNAVAILABLE')

        await update(ALERTS, {reference: {type: 'RECIPE_REF', id: CCDC}})

        expect(alertsRecipe().ui.sourceEvidence.status).toBe('OBSERVED')
        expect(sources().dataSets).toEqual({LANDSAT: ['RED', 'NIR']})
    })
})

describe('a source that could not be read and then can', () => {
    it('leaves monitoring settings the user edited since the last answer alone', async () => {
        const exported = {
            recipe_sources: JSON.stringify({dataSets: {LANDSAT: ['RED']}}),
            recipe_options: JSON.stringify({corrections: ['SR']})
        }
        assetStates(exported)
        sync({selection: {type: 'ASSET', id: SEGMENTS_ASSET}})
        await settled()
        expect(sources().dataSets).toEqual({LANDSAT: ['RED']})
        await update(ALERTS, {
            sources: {...sources(), dataSets: {LANDSAT: ['NIR']}},
            options: {corrections: []}
        })

        assetMetadata$.mockReturnValue(throwError(() => new Error('asset unavailable')))
        await reExport()
        expect(alertsRecipe().ui.sourceEvidence.status).toBe('UNAVAILABLE')

        assetStates(exported)
        await reExport()

        expect(alertsRecipe().ui.sourceEvidence.status).toBe('OBSERVED')
        expect(sources().dataSets).toEqual({LANDSAT: ['NIR']})
        expect(alertsRecipe().model.options).toEqual({corrections: []})
    })

    it('reads the date representation the recovered asset states', async () => {
        assetMetadata$.mockReturnValue(throwError(() => new Error('asset unavailable')))
        sync({selection: {type: 'ASSET', id: SEGMENTS_ASSET}})
        await settled()
        expect(alertsRecipe().ui.sourceEvidence.status).toBe('UNAVAILABLE')
        expect(reference().dateFormat).toBeUndefined()

        assetStates({dateFormat: 2})
        await reExport()

        expect(alertsRecipe().ui.sourceEvidence.status).toBe('OBSERVED')
        expect(reference().dateFormat).toBe(2)
    })
})

describe('a source that cannot be read', () => {
    it('leaves the monitoring configuration as the user left it', async () => {
        assetMetadata$.mockReturnValue(throwError(() => new Error('asset unavailable')))

        sync({
            selection: {type: 'ASSET', id: SEGMENTS_ASSET},
            sources: {band: 'nir', dataSets: {LANDSAT: ['NIR']}}
        })
        await settled()

        expect(alertsRecipe().ui.sourceEvidence.status).toBe('UNAVAILABLE')
        expect(sources()).toEqual({band: 'nir', dataSets: {LANDSAT: ['NIR']}})
        expect(reference()).toEqual({type: 'ASSET', id: SEGMENTS_ASSET})
    })
})

describe('a response for a selection that has been replaced', () => {
    it('does not configure the recipe that moved on', async () => {
        const held = new Subject()
        assetMetadata$.mockReturnValue(held)
        sync({selection: {type: 'ASSET', id: SEGMENTS_ASSET}})
        await settled()

        await update(ALERTS, {reference: {type: 'RECIPE_REF', id: MASKING}})
        await act(async () => {
            held.next(assetMetadata({
                dateFormat: 2,
                recipe_sources: JSON.stringify({dataSets: {SENTINEL_1: ['SENTINEL_1']}})
            }))
            held.complete()
        })

        expect(sources().dataSets).toEqual({LANDSAT: ['RED', 'NIR']})
        expect(reference()).toEqual({type: 'RECIPE_REF', id: MASKING})
    })
})

describe('selecting a segments asset as the reference', () => {
    it('reads the segment description and monitoring settings from the same asset response', async () => {
        const exported = {dataSets: {LANDSAT: ['RED']}}
        assetMetadata$
            .mockReturnValueOnce(of(assetMetadata({recipe_sources: JSON.stringify(exported)})))
            .mockReturnValue(of(assetMetadata({recipe_sources: JSON.stringify({dataSets: {LANDSAT: ['NIR']}})})))
        const recipe = {model: {reference: {type: 'ASSET', id: SEGMENTS_ASSET}}}

        const evidence = await firstValueFrom(changeAlertsObservation.observe$({
            recipe, graph: {recipes: [], edges: []}, recipesById: new Map()
        }))

        expect(evidence.segments.baseBands.map(({name}) => name)).toEqual(['red'])
        expect(evidence.monitoring.sources).toEqual(exported)
        expect(assetMetadata$).toHaveBeenCalledTimes(1)
    })

    it('reads its date representation from the asset', () => {
        assetMetadata$.mockReturnValue(of(assetMetadata({dateFormat: 2})))

        sync({selection: {type: 'ASSET', id: SEGMENTS_ASSET}})

        expect(reference().dateFormat).toBe(2)
    })

    it('reads a zero representation as the asset stating one', () => {
        assetMetadata$.mockReturnValue(of(assetMetadata({dateFormat: 0})))

        sync({selection: {type: 'ASSET', id: SEGMENTS_ASSET, dateFormat: 1}})

        expect(reference().dateFormat).toBe(0)
    })

    it('keeps a correction applied to the asset already selected', async () => {
        assetMetadata$.mockReturnValue(of(assetMetadata({dateFormat: 2})))
        sync({selection: {type: 'ASSET', id: SEGMENTS_ASSET}})
        await settled()
        expect(reference().dateFormat).toBe(2)

        await update(ALERTS, {reference: {type: 'ASSET', id: SEGMENTS_ASSET, dateFormat: 0}})

        expect(reference().dateFormat).toBe(0)
    })

    it('keeps what was configured beside the reference when the asset states none', () => {
        assetMetadata$.mockReturnValue(of(assetMetadata({})))

        sync({selection: {type: 'ASSET', id: SEGMENTS_ASSET, dateFormat: 1}})

        expect(reference().dateFormat).toBe(1)
    })
})

const settled = () => act(async () => {})

const assetStates = properties => assetMetadata$.mockReturnValue(of(assetMetadata(properties)))

let assetVersion = 0
const reExport = () => act(async () => store.dispatch({
    type: 'ASSET_RE_EXPORTED',
    reduce: state => ({
        ...state,
        assets: {user: [{id: SEGMENTS_ASSET, updateTime: `v${++assetVersion}`}], other: []}
    })
}))

const update = (id, model) => act(async () => store.dispatch({
    type: 'UPDATE_RECORD',
    reduce: state => ({
        ...state,
        process: {
            ...state.process,
            loadedRecipes: {
                ...state.process.loadedRecipes,
                [id]: {
                    ...state.process.loadedRecipes[id],
                    model: {...state.process.loadedRecipes[id].model, ...model}
                }
            }
        }
    })
}))

const alertsRecipe = () => selectFrom(store.getState(), ['process.loadedRecipes', ALERTS])

const reference = () => alertsRecipe().model.reference

const sources = () => alertsRecipe().model.sources

const sync = ({selection, sources = {}}) => {
    const initialState = {
        process: {
            loadedRecipes: {
                [ALERTS]: {
                    id: ALERTS,
                    type: 'CHANGE_ALERTS',
                    model: {reference: selection, sources, options: {}}
                },
                [MASKING]: {
                    id: MASKING,
                    type: 'MASKING',
                    model: {imageToMask: {type: 'RECIPE_REF', id: CCDC}}
                },
                [CCDC]: ccdcRecipe(),
                [WRAPPED_ASSET]: {
                    id: WRAPPED_ASSET,
                    type: 'MASKING',
                    model: {imageToMask: {type: 'RECIPE_REF', id: ASSET_MOSAIC}}
                },
                [ASSET_MOSAIC]: {
                    id: ASSET_MOSAIC,
                    type: 'ASSET_MOSAIC',
                    model: {assetDetails: {assetId: SEGMENTS_ASSET}}
                }
            },
            recipes: [],
            projects: [],
            tabs: []
        },
        assets: {user: [{id: SEGMENTS_ASSET, updateTime: 'v0'}], other: []}
    }
    store = createStore((state = initialState, action) => action.reduce ? action.reduce(state) : state)
    initStore(store)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => root.render(
        <Provider store={store}>
            <Recipe id={ALERTS}>
                <SourceEvidenceSync observation={changeAlertsObservation}/>
            </Recipe>
        </Provider>
    ))
}

const ccdcRecipe = () => ({
    id: CCDC,
    type: 'CCDC',
    model: {
        sources: {dataSets: {LANDSAT: ['RED', 'NIR']}},
        options: {corrections: ['SR']},
        ccdcOptions: {dateFormat: 1},
        dates: {startDate: '2015-01-01', endDate: '2021-01-01'},
        templates: [{id: 'v-red'}]
    }
})

const assetMetadata = properties => ({
    bandNames: ['red_coefs', 'red_rmse', 'tStart', 'tEnd'],
    properties: {startDate: '2015-01-01', endDate: '2021-01-01', ...properties}
})
