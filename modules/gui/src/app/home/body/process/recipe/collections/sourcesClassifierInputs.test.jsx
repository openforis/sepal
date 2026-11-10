import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {of} from 'rxjs'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {Recipe} from '~/app/home/body/process/recipeContext'
import {SourceRuntimeProvider} from '~/app/home/body/process/sourceRuntime/sourceRuntimeContext'
import {initStore} from '~/store'
import {EventShield} from '~/widget/eventShield'
import {PortalContainer, PortalContext} from '~/widget/portal'

// Time Series and CCDC Sources drafts judged, before Apply, by whether their collection's images can feed the classifier
// of the Classification they select (collectionClassifierRequirements.js, outputCandidate.js). Wherever the shared rule
// locates the finding - at the data sets where another collection would feed it, otherwise at the classification - it
// is said beside the Classification, the dependency whose bands are missing. Sources open on More, where the
// Classification is chosen, while one is selected. The real panels, form and requirements run over a real store and
// source runtime; recipe reads are the substitutes.

const loadRecipe$ = vi.fn()
vi.mock('~/apiRegistry', () => ({default: {
    gee: {assetVersions$: ({ids}) => of({assets: ids.map(id => ({id, type: 'IMAGE', version: 'v1'}))})},
    recipe: {load$: (...args) => loadRecipe$(...args), save$: () => of()}
}}))
vi.mock('~/translate', () => ({msg: (key, args) => [key, ...(args ? Object.values(args) : [])].join(' ')}))
vi.mock('~/widget/notifications', () => ({Notifications: {error: () => {}}}))
vi.mock('~/widget/form/assetCombo', () => ({FormAssetCombo: () => null}))
vi.mock('~/widget/tooltip', () => ({
    Tooltip: ({msg, children}) => msg ? <><span data-message>{[msg].flat().join(' ')}</span>{children}</> : children
}))
vi.mock('~/widget/activation/activatable', () => ({
    withActivatable: () => Component => props => (
        <Component {...props} activatable={{active: true, activate: () => {}, deactivate: () => {}}}/>
    )
}))
// Filled in once the declarations are imported: importing them from within the mock would never resolve.
const registry = vi.hoisted(() => ({}))
vi.mock('~/app/home/body/process/recipeTypeRegistry', () => ({getRecipeType: type => registry[type]}))

const {Sources: TimeSeriesSources} = await import('../timeSeries/panels/sources/sources')
const {Sources: CcdcSources} = await import('../ccdc/panels/sources/sources')
const {Sources: PhenologySources} = await import('../phenology/panels/sources/sources')
const {collectionClassifierRequirements} = await import('./collectionClassifierRequirements')
registry.TIME_SERIES = {id: 'TIME_SERIES', sourceRequirements: collectionClassifierRequirements({id: 'sources', label: 'process.timeSeries.panel.sources.button'})}
registry.CCDC = {id: 'CCDC', sourceRequirements: collectionClassifierRequirements({id: 'sources', label: 'process.ccdc.panel.sources.button'})}
registry.PHENOLOGY = {id: 'PHENOLOGY', sourceRequirements: collectionClassifierRequirements({id: 'sources', label: 'process.phenology.panel.sources.button'})}
registry.CLASSIFICATION = {id: 'CLASSIFICATION'}

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root, container, store

afterEach(async () => {
    await act(async () => root?.unmount())
    container?.remove()
})

// `radarBand`: what else a radar collection needs chosen - a CCDC's breakpoint band.
for (const {recipeType, Sources, classificationLabel, extraSources, radarBand} of [
    {recipeType: 'TIME_SERIES', Sources: TimeSeriesSources, classificationLabel: 'process.timeSeries.panel.sources.form.classification.label', extraSources: {}},
    {recipeType: 'CCDC', Sources: CcdcSources, classificationLabel: 'process.ccdc.panel.sources.form.classification.label', extraSources: {breakpointBands: ['ndvi']}, radarBand: 'VV'}
]) {
    const open = (sources = {}) => mount({recipeType, Sources, sources: {...extraSources, ...sources}})
    const classificationMessages = () => messagesOf(classificationLabel)
    const select = id => selectIn(classificationLabel, id)

    describe(`${recipeType} Sources`, () => {
        it('open on More while a Classification is selected, and toggle Less and More as before', async () => {
            await open({classification: OPTICAL_BANDS})
            expect(button('button.less')).toBeDefined()
            expect(classificationField(classificationLabel)).not.toBe(null)

            await press('button.less')
            expect(button('button.more')).toBeDefined()
            expect(classificationField(classificationLabel)).toBe(null)

            await press('button.more')
            expect(classificationField(classificationLabel)).not.toBe(null)
        })

        it('open on Less while no Classification is selected', async () => {
            await open()

            expect(button('button.more')).toBeDefined()
            expect(classificationField(classificationLabel)).toBe(null)
        })

        it('explain, beside the Classification, the radar collection the Classification\'s optical bands cannot be fed by, and are repaired by optical again', async () => {
            await open({classification: OPTICAL_BANDS})

            await press('process.ccdc.panel.sources.form.dataSetTypes.RADAR')

            expect(classificationMessages()).toContainEqual(expect.stringContaining('classifierInputs.dataSets'))
            expect(dataSetMessages()).toEqual([])
            expect(button('button.apply').disabled).toBe(true)

            await press('process.ccdc.panel.sources.form.dataSetTypes.OPTICAL')
            expect(classificationMessages()).toEqual([])
            expect(dataSetFieldMessages()).not.toContain('fieldValidation.notEmpty')
        })

        it('keep what was applied on Cancel', async () => {
            await open({classification: OPTICAL_BANDS})
            await press('process.ccdc.panel.sources.form.dataSetTypes.RADAR')

            await press('button.cancel')

            expect(savedSources()).toMatchObject({classification: OPTICAL_BANDS, dataSets: {LANDSAT: ['LANDSAT_8']}})
        })

        it('refuse Apply for a Classification no collection can feed, saying so beside it, until another is selected', async () => {
            await open()
            await press('button.more')

            await select(RADAR_STATISTICS)
            expect(classificationMessages()).toContainEqual(expect.stringContaining('classifierInputs.classification'))
            expect(button('button.apply').disabled).toBe(true)

            await select(OPTICAL_BANDS)
            expect(classificationMessages()).toEqual([])
            await press('button.apply')
            expect(savedSources().classification).toBe(OPTICAL_BANDS)
        })

        it('are repaired by a collection that can feed the Classification selected, which Apply saves', async () => {
            await open()
            await press('button.more')
            await select(RADAR_POLARISATIONS)
            expect(classificationMessages()).toContainEqual(expect.stringContaining('classifierInputs.dataSets'))
            expect(button('button.apply').disabled).toBe(true)

            await press('process.ccdc.panel.sources.form.dataSetTypes.RADAR')
            radarBand && await press(radarBand)

            expect(classificationMessages()).toEqual([])
            await press('button.apply')
            expect(savedSources()).toMatchObject({classification: RADAR_POLARISATIONS, dataSets: {SENTINEL_1: ['SENTINEL_1']}})
        })

        it('show a saved Classification the images cannot feed on opening, saying why beside it', async () => {
            await open({classification: RADAR_STATISTICS})

            expect(classificationMessages()).toContainEqual(expect.stringContaining('classifierInputs.classification'))
            expect(button('button.apply')).toBeUndefined()
        })
    })
}

// What the message beside the Classification says is the repair the shared rule names (classifierInputsMessage): a
// correction to turn off in PRC, data sets that replace the selection, a data set the dates exclude, or nothing that can
// be chosen as processed now - judged for the years the recipe's dates cover.
for (const {recipeType, Sources, classificationLabel, extraSources, radarSources, prefix} of [
    {recipeType: 'TIME_SERIES', Sources: TimeSeriesSources, classificationLabel: 'process.timeSeries.panel.sources.form.classification.label', extraSources: {}, radarSources: {}, prefix: 'ccdc'},
    {recipeType: 'CCDC', Sources: CcdcSources, classificationLabel: 'process.ccdc.panel.sources.form.classification.label', extraSources: {breakpointBands: ['ndvi']}, radarSources: {breakpointBands: ['VV']}, prefix: 'ccdc'},
    {recipeType: 'PHENOLOGY', Sources: PhenologySources, classificationLabel: 'process.phenology.panel.sources.form.classification.label', extraSources: {band: 'ndvi'}, radarSources: {band: 'VV'}, prefix: 'phenology'}
]) {
    const open = (sources = {}, model) => mount({recipeType, Sources, sources: {...extraSources, ...sources}, model})
    const classificationMessages = () => messagesOf(classificationLabel)
    const select = id => selectIn(classificationLabel, id)

    describe(`${recipeType} Sources, telling what repairs a Classification its images cannot feed`, () => {
        it('say turning SR off in PRC repairs it, and accept it once that correction is applied', async () => {
            await open()
            await press('button.more')
            await select(PAN)
            expect(classificationMessages()).toEqual(['process.source.classifierInputs.reflectance.TOA pan'])
            expect(button('button.apply').disabled).toBe(true)
            await close()

            await open({}, {options: {corrections: []}})
            await press('button.more')
            await select(PAN)

            expect(classificationMessages()).toEqual([])
            await press('button.apply')
            expect(savedSources().classification).toBe(PAN)
        })

        it('suggest no correction that would supply only some of what it reads', async () => {
            await open()
            await press('button.more')

            await select(PAN_RED_EDGE)

            expect(classificationMessages()).toEqual(['process.source.classifierInputs.classification pan, redEdge1'])
        })

        it('tell to choose only the data sets that feed it, which a selection holding another is repaired by', async () => {
            await open({dataSets: {LANDSAT: ['LANDSAT_8'], SENTINEL_2: ['SENTINEL_2']}, classification: RED_EDGE})
            expect(classificationMessages()).toEqual(['process.source.classifierInputs.dataSets redEdge1 sources.dataSets,SENTINEL_2,label'])

            await press('sources.dataSets,LANDSAT_8,label')

            expect(classificationMessages()).toEqual([])
            await press('button.apply')
            expect(savedSources().dataSets).toEqual({SENTINEL_2: ['SENTINEL_2']})
        })

        it('explain the data set that feeds it as having no imagery for the dates, which cannot be chosen, until another Classification is', async () => {
            await open({dataSets: {LANDSAT: ['LANDSAT_TM']}, classification: RED_EDGE}, {dates: datesOf(1990, 1995)})
            expect(classificationMessages()).toEqual(['process.source.classifierInputs.unavailable redEdge1 sources.dataSets,SENTINEL_2,label 1990-1995'])
            expect(button('sources.dataSets,SENTINEL_2,label').disabled).toBe(true)

            await select(OPTICAL_BANDS)

            expect(classificationMessages()).toEqual([])
            await press('button.apply')
            expect(savedSources().classification).toBe(OPTICAL_BANDS)
        })

        it('say no data set that can be chosen feeds it as processed now, for a radar collection keeping SR', async () => {
            await open({dataSetType: 'RADAR', dataSets: {SENTINEL_1: ['SENTINEL_1']}, classification: PAN, ...radarSources})

            expect(classificationMessages()).toEqual(['process.source.classifierInputs.classification red, nir, pan'])
            expect(button(`process.${prefix}.panel.sources.form.dataSetTypes.RADAR`)).toBeDefined()
        })
    })
}

// Whole years, as each type's dates state them.
const datesOf = (fromYear, toYear) => ({startDate: `${fromYear}-01-01`, endDate: `${toYear + 1}-01-01`, fromYear, toYear})

async function close() {
    await act(async () => root.unmount())
    container.remove()
    root = null
}

const ID = 'recipe-1'
const OPTICAL_BANDS = 'classification-optical-bands'
const RADAR_STATISTICS = 'classification-radar-statistics'
const RADAR_POLARISATIONS = 'classification-radar-polarisations'
const PAN = 'classification-pan'
const PAN_RED_EDGE = 'classification-pan-red-edge'
const RED_EDGE = 'classification-red-edge'

const classificationOver = (id, included) => ({
    id,
    type: 'CLASSIFICATION',
    model: {
        legend: {entries: [{value: 1, label: 'Forest'}, {value: 2, label: 'Non-forest'}]},
        classifier: {type: 'RANDOM_FOREST'},
        inputImagery: {images: [{imageId: 'i-1', type: 'ASSET', id: `users/x/${id}`, bandSetSpecs: [{id: 'b', type: 'IMAGE_BANDS', included}]}]}
    }
})

const CLASSIFICATIONS = [
    classificationOver(OPTICAL_BANDS, ['red', 'nir']),
    classificationOver(RADAR_STATISTICS, ['VV_mean', 'VH_med']),
    classificationOver(RADAR_POLARISATIONS, ['VV', 'VH']),
    classificationOver(PAN, ['red', 'nir', 'pan']),
    classificationOver(PAN_RED_EDGE, ['red', 'pan', 'redEdge1']),
    classificationOver(RED_EDGE, ['red', 'nir', 'redEdge1'])
]

async function mount({recipeType, Sources, sources, model}) {
    loadRecipe$.mockImplementation(id => of(CLASSIFICATIONS.find(record => record.id === id)))
    const initialState = {
        dimensions: {width: 1024, height: 768},
        user: {currentUser: {googleTokens: {accessToken: 'token'}}},
        process: {
            loadedRecipes: {
                [ID]: {
                    id: ID,
                    type: recipeType,
                    model: {
                        dates: {startDate: '2020-01-01', endDate: '2021-01-01'},
                        sources: {dataSetType: 'OPTICAL', dataSets: {LANDSAT: ['LANDSAT_8']}, assets: [], ...sources},
                        options: {corrections: ['SR']},
                        opticalPreprocess: {corrections: ['SR']},
                        ...model
                    },
                    ui: {initialized: true}
                },
                ...Object.fromEntries(CLASSIFICATIONS.map(record => [record.id, record]))
            },
            recipes: CLASSIFICATIONS.map(({id}) => ({id, name: id, type: 'CLASSIFICATION', revision: 1})),
            recipeListing: {checkedAt: Date.now()},
            saveStates: {},
            projects: [],
            tabs: []
        }
    }
    store = createStore((state = initialState, action) => action.reduce ? action.reduce(state) : state)
    initStore(store)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => root.render(
        <Provider store={store}>
            <SourceRuntimeProvider>
                <PortalContainer/>
                <PortalContainer id='test-portal'/>
                <PortalContext id='test-portal'>
                    <EventShield>
                        <Recipe id={ID}>
                            <Sources/>
                        </Recipe>
                    </EventShield>
                </PortalContext>
            </SourceRuntimeProvider>
        </Provider>
    ))
    await settled()
}

async function settled() {
    for (let i = 0; i < 8; i++) {
        await act(async () => {})
    }
}

const savedSources = () => store.getState().process.loadedRecipes[ID].model.sources

const button = label => [...document.querySelectorAll('button')].find(button => button.textContent === label)

const press = async label => {
    expect(button(label), `no button ${label}`).toBeDefined()
    await act(async () => button(label).click())
    await settled()
}

const classificationField = label => document.querySelector(`[data-label="${label}"]`)

const selectIn = async (label, id) => {
    const input = document.querySelector(`[data-label="${label}"] input`)
    await act(async () => input.click())
    const option = [...document.querySelectorAll('li')].map(item => item.firstElementChild).find(item => item?.textContent === id)
    expect(option, `no option for ${id}`).toBeDefined()
    await act(async () => option.click())
    await settled()
}

const messagesOf = label => [...document.querySelectorAll(`[data-label="${label}"] [data-message]`)].map(({textContent}) => textContent)
    .filter(message => message.includes('classifierInputs'))

const dataSetMessages = () => messagesOf('process.ccdc.panel.sources.form.dataSets.label')

// What the data sets' own control says, whatever it is.
const dataSetFieldMessages = () => [...document.querySelectorAll('[data-label="process.ccdc.panel.sources.form.dataSets.label"] [data-message]')]
    .map(({textContent}) => textContent)
