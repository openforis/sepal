import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {of} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {actionBuilder} from '~/action-builder'
import {Recipe} from '~/app/home/body/process/recipeContext'
import {SourceRuntimeProvider, withSourceRuntime} from '~/app/home/body/process/sourceRuntime/sourceRuntimeContext'
import {selectFrom} from '~/stateUtils'
import {initStore} from '~/store'
import {EventShield} from '~/widget/eventShield'
import {PortalContainer, PortalContext} from '~/widget/portal'
import toolbarButtonStyles from '~/widget/toolbar/toolbarButton.module.css'
import {tooltipText} from '~/widget/tooltip.test.fixtures'

// What LandTrendr's change map needs of its Sources (type/landTrendr.js): data sets, one of which may hold imagery in its
// years, and an index the collection they configure can carry. Sources keep what was chosen shown and say what is wrong
// beside it; the Sources button is marked, and the image and Retrieve held, until it is repaired. The root, its toolbar
// and Sources panel, the store and the source runtime are real; Earth Engine is never asked for anything.

const fake = vi.hoisted(() => ({stored: {}, open: new Set(), english: false}))
vi.mock('~/apiRegistry', () => ({default: {
    gee: {
        bands$: () => of([]),
        assetVersions$: ({ids}) => of({assets: ids.map(id => ({id, type: 'IMAGE', version: 'v1'}))})
    },
    recipe: {load$: id => of(fake.stored[id]), loadAll$: () => of(LISTING), save$: () => of()}
}}))
// A message is its key and values, a message given no values reading as one given none, as the real one does; in English,
// the real one says it from the catalogue.
vi.mock('~/translate', async importOriginal => {
    const actual = await importOriginal()
    return {...actual, msg: (key, values, defaultMessage) => {
        if (fake.english) {
            return actual.msg(key, values, defaultMessage)
        }
        const text = [key].flat().join('.')
        return values && Object.keys(values).length ? `${text} ${JSON.stringify(values)}` : text
    }}
})
vi.mock('~/widget/notifications', () => ({Notifications: {error: () => {}}}))
vi.mock('~/app/home/user/userDetails', () => ({userDetailsHint: () => {}}))
// A tooltip's text is rendered where it is attached, to be read without hovering.
vi.mock('~/widget/tooltip', () => ({
    Tooltip: ({msg, disabled, children}) => !disabled && [msg].flat().map(tooltipText).some(line => typeof line === 'string')
        ? <span data-tooltip={JSON.stringify([msg].flat().map(tooltipText).filter(line => typeof line === 'string'))}>{children}</span>
        : children
}))
// The panels a test opens are open; no toolbar button is pressed.
vi.mock('~/widget/activation/activatable', () => ({
    withActivatable: ({id}) => Component => props => fake.open.has(id)
        ? <Component {...props} activatable={{active: true, activate: () => {}, deactivate: () => {}}}/>
        : null
}))
vi.mock('~/widget/activation/activator', () => ({
    withActivators: () => Component => props => <Component {...props} activator={{
        activatables: {button: {active: false, canActivate: true, toggle: () => {}}},
        updateActivatables: () => {}
    }}/>
}))
// The root's map and its layers: the toolbar is what is looked at.
vi.mock('~/app/home/map/map', async importOriginal => ({...await importOriginal(), Map: ({children}) => children}))
vi.mock('../aoi', async importOriginal => ({...await importOriginal(), Aoi: () => null}))
vi.mock('../recipeImageLayerSource', async importOriginal => ({...await importOriginal(), initializeLayers: () => {}}))

const {addRecipeType} = await import('~/app/home/body/process/recipeTypeRegistry')
const {default: landTrendr} = await import('./landTrendr')
const {mapProductGate, retrieveAvailability} = await import('../operationAvailability')
const {requestGate} = await import('../sourceRequirements')
const {msg, TranslationProvider} = await import('~/translate')

addRecipeType(landTrendr())
const Root = landTrendr().components.recipe

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root, container, store, runtime

beforeEach(() => {
    fake.open = new Set(['sources'])
    fake.english = false
})

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    container?.remove()
})

describe('a LandTrendr\'s Sources opened untouched', () => {
    it('mark and hold nothing when valid, offering the indexes its data sets compute', async () => {
        await open({dataSets: {LANDSAT: LANDSAT}, index: 'nbr'})

        expect(chosenOf(DATA_SETS)).toEqual(LANDSAT.map(dataSetLabel))
        expect(choicesOf(INDEX)).toEqual(INDEXES.map(label))
        expect(chosenOf(INDEX)).toEqual(['NBR'])
        expect(button('button.close')).toBeDefined()
        expect(inError(SOURCES)).toBe(false)
        expect(imageGate()).toBe(null)
        expect(retrieveGate()).toBe(null)
    })

    it('keep an index the data sets cannot compute chosen and explained, holding the image and Retrieve, not the annual mosaic', async () => {
        await open({dataSets: {SENTINEL_2: ['SENTINEL_2']}, index: 'ebbi'})
        const applied = model()

        expect(choicesOf(INDEX)).toEqual([...INDEXES.filter(index => index !== 'ebbi'), 'ebbi'].map(label))
        expect(chosenOf(INDEX)).toEqual(['EBBI'])
        expect(errorsOf(INDEX)).toEqual([thermalLacking()])
        expect(button('button.close')).toBeDefined()
        expect(inError(SOURCES)).toBe(true)
        expect(buttonTooltip(SOURCES)).toContain(thermalLacking())
        for (const gate of [imageGate(), retrieveGate()]) {
            expect(gate).toMatchObject({withdraw: true, section: SOURCES})
        }
        expect(annualMosaicGate()).toBe(null)
        expect(model()).toBe(applied)
    })

    it('keep data sets the dates exclude chosen, an unrelated edit applied keeping them', async () => {
        await open({dataSets: {LANDSAT: ['LANDSAT_9', 'LANDSAT_TM']}, index: 'nbr'}, {startYear: 1985, endYear: 1995})
        const applied = model()

        expect(chosenOf(DATA_SETS)).toEqual(['LANDSAT_9', 'LANDSAT_TM'].map(dataSetLabel))
        expect(errorsOf(DATA_SETS)).toEqual([])
        expect(button('button.close')).toBeDefined()
        await rerender()
        expect(model()).toBe(applied)

        await toggle(INDEX, 'NDVI')
        await press('button.apply')

        expect(model().sources).toMatchObject({dataSets: {LANDSAT: ['LANDSAT_9', 'LANDSAT_TM']}, index: 'ndvi'})
    })

    it('leave an unset index unset, said at once, holding the image until one is chosen', async () => {
        await open({dataSets: {LANDSAT: ['LANDSAT_8']}})
        const applied = model()

        expect(chosenOf(INDEX)).toEqual([])
        expect(errorsOf(INDEX)).toEqual([INDEX_REQUIRED])
        expect(button('button.close')).toBeDefined()
        expect(inError(SOURCES)).toBe(true)
        expect(retrieveGate()).toMatchObject({withdraw: true, section: SOURCES})
        expect(model()).toBe(applied)

        await toggle(INDEX, 'NBR')
        await press('button.apply')

        expect(model().sources.index).toBe('nbr')
        expect(inError(SOURCES)).toBe(false)
        expect(retrieveGate()).toBe(null)
    })

    it.each([
        ['as an empty object', {dataSets: {}, index: 'nbr'}],
        ['as empty lists', {dataSets: {LANDSAT: [], SENTINEL_2: []}, index: 'nbr'}],
        ['as null', {dataSets: null, index: 'nbr'}],
        ['not at all', {index: 'nbr'}]
    ])('keep the index of data sets saved %s, said once and held until one is chosen', async (_case, sources) => {
        await open(sources)
        const applied = model()

        expect(chosenOf(DATA_SETS)).toEqual([])
        expect(button('button.close')).toBeDefined()
        expect(model()).toBe(applied)

        expect(chosenOf(INDEX)).toEqual(['NBR'])
        expect(errorsOf(DATA_SETS)).toEqual([DATA_SETS_REQUIRED])
        expect(inError(SOURCES)).toBe(true)
        for (const gate of [imageGate(), retrieveGate()]) {
            expect(gate).toMatchObject({withdraw: true, section: SOURCES})
        }

        await toggle(DATA_SETS, dataSetLabel('LANDSAT_8'))
        expect(errorsOf(DATA_SETS)).toEqual([])
        await press('button.apply')

        expect(model().sources).toMatchObject({dataSets: {LANDSAT: ['LANDSAT_8']}, index: 'nbr'})
        expect(inError(SOURCES)).toBe(false)
        expect(imageGate()).toBe(null)
    })

    // Panels open one at a time: Dates are applied with Sources closed.
    it('leave a blank index as saved, said once to be missing and nothing else, until one is chosen', async () => {
        await open({dataSets: {LANDSAT: ['LANDSAT_8']}, index: ''})
        const applied = model()

        expect(choicesOf(INDEX)).toEqual(INDEXES.map(label))
        expect(chosenOf(INDEX)).toEqual([])
        expect(errorsOf(INDEX)).toEqual([INDEX_REQUIRED])
        expect(button('button.close')).toBeDefined()
        expect(model()).toBe(applied)

        await toggle(INDEX, 'NBR')
        await press('button.apply')

        expect(model().sources.index).toBe('nbr')
        expect(inError(SOURCES)).toBe(false)
    })

    it('keep data sets none of which may cover the years, said and held until Dates cover one', async () => {
        await open({dataSets: {LANDSAT: ['LANDSAT_9']}, index: 'nbr'}, {startYear: 2000, endYear: 2010})

        expect(chosenOf(DATA_SETS)).toEqual([dataSetLabel('LANDSAT_9')])
        expect(errorsOf(DATA_SETS)).toEqual([noOverlap(2000, 2010)])
        expect(retrieveGate()).toMatchObject({withdraw: true, section: SOURCES})

        await show([])
        await applyDates({startYear: 2000, endYear: 2022})
        await show(['sources'])

        expect(errorsOf(DATA_SETS)).toEqual([])
        expect(inError(SOURCES)).toBe(false)
        expect(retrieveGate()).toBe(null)
    })
})

describe('a LandTrendr\'s applied Dates', () => {
    it('may leave no data set chosen covering the years, which marks Sources', async () => {
        await open({dataSets: {LANDSAT: ['LANDSAT_9']}, index: 'nbr'}, {startYear: 2021, endYear: 2025}, [])
        expect(inError(SOURCES)).toBe(false)

        await applyDates({startYear: 2000, endYear: 2010})

        expect(model().dates).toEqual({startYear: 2000, endYear: 2010})
        expect(inError(SOURCES)).toBe(true)
        expect(buttonTooltip(SOURCES)).toContain(noOverlap(2000, 2010))
    })
})

describe('editing a LandTrendr\'s Sources', () => {
    it('keeps the index while the data sets are emptied, saying only that they are required, and judges it once they are chosen', async () => {
        await open({dataSets: {LANDSAT: ['LANDSAT_8']}, index: 'ndvi'})

        await toggle(DATA_SETS, dataSetLabel('LANDSAT_8'))

        expect(chosenOf(INDEX)).toEqual(['NDVI'])
        expect(errorsOf(INDEX)).toEqual([])
        expect(errorsOf(DATA_SETS)).toEqual([DATA_SETS_REQUIRED])

        await toggle(DATA_SETS, dataSetLabel('LANDSAT_8'))

        expect(chosenOf(INDEX)).toEqual(['NDVI'])
        expect(errorsOf(DATA_SETS)).toEqual([])
    })

    it('keeps an index another data set cannot compute, refusing Apply and Enter until the data set is removed', async () => {
        await open({dataSets: {LANDSAT: ['LANDSAT_8']}, index: 'ebbi'})
        const applied = model()

        await toggle(DATA_SETS, dataSetLabel('SENTINEL_2'))

        expect(chosenOf(INDEX)).toEqual(['EBBI'])
        expect(errorsOf(INDEX)).toEqual([thermalLacking({removable: true})])
        expect(button('button.apply').disabled).toBe(true)
        await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true})))
        await act(async () => document.querySelector('form').dispatchEvent(new Event('submit', {bubbles: true, cancelable: true})))
        await settled()
        expect(model()).toBe(applied)
        expect(imageGate()).toBe(null)

        await toggle(DATA_SETS, dataSetLabel('SENTINEL_2'))

        expect(chosenOf(INDEX)).toEqual(['EBBI'])
        expect(errorsOf(INDEX)).toEqual([])
    })

    // Execution intersects the bands of every data set chosen before it filters scenes by date.
    it('judges the index over a data set the dates exclude, repaired by removing it', async () => {
        await open({dataSets: {LANDSAT: ['LANDSAT_TM'], SENTINEL_2: ['SENTINEL_2']}, index: 'ebbi'}, {startYear: 1985, endYear: 1995})
        expect(errorsOf(INDEX)).toEqual([thermalLacking({removable: true})])

        await toggle(DATA_SETS, dataSetLabel('SENTINEL_2'))
        await press('button.apply')

        expect(model().sources).toMatchObject({dataSets: {LANDSAT: ['LANDSAT_TM']}, index: 'ebbi'})
        expect(inError(SOURCES)).toBe(false)
        expect(retrieveGate()).toBe(null)
    })

    it('is repaired by another index, its Cancel otherwise leaving the model as applied', async () => {
        await open({dataSets: {SENTINEL_2: ['SENTINEL_2']}, index: 'ebbi'})
        const applied = model()

        await toggle(INDEX, 'NBR')
        expect(errorsOf(INDEX)).toEqual([])
        await press('button.cancel')
        expect(model()).toBe(applied)

        await toggle(INDEX, 'NBR')
        await press('button.apply')

        expect(model().sources.index).toBe('nbr')
        expect(inError(SOURCES)).toBe(false)
    })
})

describe('a native band saved as a LandTrendr\'s index', () => {
    it('stays usable where the data sets carry it', async () => {
        await open({dataSets: {LANDSAT: ['LANDSAT_8']}, index: 'swir1'})

        expect(chosenOf(INDEX)).toEqual(['SWIR1'])
        expect(errorsOf(INDEX)).toEqual([])
        expect(retrieveGate()).toBe(null)
    })

    it('is refused without inputs to name where they cannot', async () => {
        await open({dataSets: {SENTINEL_2: ['SENTINEL_2']}, index: 'thermal'})

        expect(chosenOf(INDEX)).toEqual(['THERMAL'])
        expect(errorsOf(INDEX)).toEqual([unsupported('THERMAL')])
        expect(retrieveGate()).toMatchObject({withdraw: true, section: SOURCES})
    })
})

// The index table's declared inputs, as the shared finding names them, said in the catalogue's words.
describe('what LandTrendr\'s Sources say of an index the data sets cannot compute, in English', () => {
    it('names the input and the data set lacking it, and suggests removing that data set where the rest can run', async () => {
        fake.english = true
        await open({dataSets: {LANDSAT: ['LANDSAT_8'], SENTINEL_2: ['SENTINEL_2']}, index: 'ebbi'})

        expect(errorsOf(msg(INDEX))).toEqual([
            'EBBI requires the Thermal band, which Sentinel-2 does not provide. Remove Sentinel-2, or choose another index.'
        ])
    })

    it('suggests another index or data sets providing the input where removing the one lacking it leaves none', async () => {
        fake.english = true
        await open({dataSets: {SENTINEL_2: ['SENTINEL_2']}, index: 'ebbi'})

        expect(errorsOf(msg(INDEX))).toEqual([
            'EBBI requires the Thermal band, which Sentinel-2 does not provide. Choose another index or data sets that provide it.'
        ])
    })

    // Processing might repair one native band and data sets another, so neither is offered.
    it('says a native band they cannot provide without a cause, offering another index', async () => {
        fake.english = true
        await open({dataSets: {SENTINEL_2: ['SENTINEL_2']}, index: 'thermal'})

        expect(errorsOf(msg(INDEX))).toEqual(['The selected data sets don\'t provide THERMAL. Choose another index.'])
    })
})

describe('the indexes LandTrendr offers', () => {
    it.each([
        ['Landsat', {LANDSAT: LANDSAT}, INDEXES],
        ['Landsat 8 Tier 2', {LANDSAT: ['LANDSAT_8_T2']}, INDEXES],
        ['Sentinel-2', {SENTINEL_2: ['SENTINEL_2']}, INDEXES.filter(index => index !== 'ebbi')],
        ['Landsat 8 and Sentinel-2', {LANDSAT: ['LANDSAT_8'], SENTINEL_2: ['SENTINEL_2']}, INDEXES.filter(index => index !== 'ebbi')]
    ])('are the indexes %s computes, as before, and no other band', async (_case, dataSets, indexes) => {
        await open({dataSets, index: 'nbr'})

        expect(choicesOf(INDEX)).toEqual(indexes.map(label))
    })
})

const ID = 'landtrendr-1'
const SOURCES = 'process.landTrendr.panel.sources.button'
const DATA_SETS = 'process.landTrendr.panel.sources.form.dataSets.label'
const INDEX = 'process.landTrendr.panel.sources.form.index.label'
const LISTING = [{id: ID, name: 'LandTrendr', type: 'LANDTRENDR', revision: 1}]
const LANDSAT = ['LANDSAT_9', 'LANDSAT_8', 'LANDSAT_7', 'LANDSAT_TM']
const INDEXES = ['ndvi', 'ndmi', 'ndwi', 'mndwi', 'ndfi', 'evi', 'evi2', 'savi', 'nbr', 'mvi', 'ui', 'ndbi', 'ibi', 'nbi', 'ebbi', 'bui', 'kndvi']

const INDEX_REQUIRED = 'process.landTrendr.panel.sources.form.index.required'
const DATA_SETS_REQUIRED = 'process.landTrendr.panel.sources.form.dataSets.required'
const unsupported = index => `process.landTrendr.panel.sources.form.index.unsupported ${JSON.stringify({index})}`
// EBBI's thermal input, which Sentinel-2 lacks, in the words suggesting its removal where `removable`.
const thermalLacking = ({removable} = {}) => {
    const facts = {index: 'EBBI', bands: 'bands.thermal', count: 1, dataSets: 'sources.dataSets.SENTINEL_2.name', dataSetCount: 1}
    return removable
        ? `process.landTrendr.panel.sources.form.index.removeDataSets ${JSON.stringify({...facts, removable: facts.dataSets})}`
        : `process.landTrendr.panel.sources.form.index.missingInputs ${JSON.stringify(facts)}`
}
const noOverlap = (startYear, endYear) => `process.source.dataSets.noPeriodOverlap ${JSON.stringify({startYear, endYear})}`

const label = index => index.toUpperCase()
const dataSetLabel = dataSet => `sources.dataSets.${dataSet}.label`

// Over Landsat surface reflectance, with the options and LandTrendr settings a new recipe starts with.
const landTrendrRecipe = (sources, dates) => ({
    id: ID,
    type: 'LANDTRENDR',
    title: 'LandTrendr',
    revision: 1,
    model: {
        aoi: {type: 'POLYGON', path: [[0, 0], [0, 1], [1, 1]]},
        dates,
        sources: {cloudPercentageThreshold: 75, ...sources},
        options: {corrections: ['SR'], cloudBuffer: 0},
        landTrendrOptions: {maxSegments: 6}
    },
    ui: {initialized: true}
})

const model = () => selectFrom(store.getState(), ['process.loadedRecipes', ID, 'model'])

const applied = () => selectFrom(store.getState(), ['process.loadedRecipes', ID])

const gateArgs = () => ({state: store.getState(), recipe: applied(), evidenceOwnerOf: id => runtime.evidenceOwnerOf(id), heldFor: key => runtime.heldFor(key), now: Date.now()})

const retrieveGate = () => retrieveAvailability(gateArgs()).gate

const imageGate = () => requestGate({...gateArgs(), operation: 'IMAGE_OUTPUT'})

const annualMosaicGate = () => mapProductGate({...gateArgs(), product: {name: 'ANNUAL_MOSAIC', parameters: {year: 2020}}})

const field = label => document.querySelector(`[data-label="${label}"]`)

// The choices a field offers, by name: its buttons but the one marking its errors.
const choiceButtons = label => [...field(label).querySelectorAll('button')].filter(button => !button.closest('[data-feedback]'))

const choicesOf = label => choiceButtons(label).map(({textContent}) => textContent)

const chosenOf = label => choiceButtons(label)
    .filter(({className}) => /_highlight_/.test(className))
    .map(({textContent}) => textContent)

// What a field's label says of it as errors: the tooltip of the icon marking them.
const errorsOf = label => {
    const tooltip = field(label)?.querySelector('[data-feedback="error"]')?.closest('[data-tooltip]')
    return tooltip ? JSON.parse(tooltip.dataset.tooltip) : []
}

const button = label => [...document.querySelectorAll('button')].find(button => button.textContent === label)

const inError = label => button(label).classList.contains(classOf(toolbarButtonStyles, 'error'))

// What a section's toolbar button says of it.
const buttonTooltip = label => [...document.querySelectorAll('[data-tooltip]')]
    .filter(element => element.contains(button(label)) || button(label).contains(element))
    .flatMap(element => JSON.parse(element.dataset.tooltip))
    .join(' | ')

const classOf = (styles, name) => {
    if (!styles[name]) {
        throw new Error(`No ${name} class to look for`)
    }
    return styles[name].split(' ')[0]
}

const press = async label => {
    await act(async () => button(label).click())
    await settled()
}

const toggle = async (label, choice) => {
    await act(async () => choiceButtons(label).find(({textContent}) => textContent === choice).click())
    await settled()
}

// Dates as their panel's Apply commits them.
const applyDates = async dates => {
    await act(async () => actionBuilder('APPLY_DATES').set(['process.loadedRecipes', ID, 'model.dates'], dates).dispatch())
    await settled()
}

// A store change the panel renders again for, unrelated to its fields.
const rerender = async () => {
    await act(async () => actionBuilder('UNRELATED').set(['process', 'unrelated'], Date.now()).dispatch())
    await settled()
}

const RuntimeProbe = withSourceRuntime()(({sourceRuntime}) => {
    runtime = sourceRuntime
    return null
})

// The panels open now, the recipe's root rendered again over the session as it stands.
const show = async panels => {
    fake.open = new Set(panels)
    await act(async () => root.render(tree()))
    await settled()
}

const tree = () => fake.english
    ? <TranslationProvider>{recipeTree()}</TranslationProvider>
    : recipeTree()

const recipeTree = () => (
    <Provider store={store}>
        <SourceRuntimeProvider>
            <RuntimeProbe/>
            <PortalContainer/>
            <PortalContainer id='test-portal'/>
            <PortalContext id='test-portal'>
                <EventShield>
                    <Recipe id={ID}>
                        <Root/>
                    </Recipe>
                </EventShield>
            </PortalContext>
        </SourceRuntimeProvider>
    </Provider>
)

async function open(sources, dates = {startYear: 2000, endYear: 2025}, panels = ['sources']) {
    const recipe = landTrendrRecipe(sources, dates)
    fake.stored = {[ID]: recipe}
    const initialState = {
        dimensions: {width: 1024, height: 768},
        user: {currentUser: {googleTokens: {accessToken: 'token'}}},
        process: {
            loadedRecipes: {[ID]: recipe},
            recipes: LISTING,
            recipeListing: {checkedAt: Date.now()},
            saveStates: {},
            projects: [],
            tabs: [{id: ID}]
        }
    }
    store = createStore((state = initialState, action) => action.reduce ? action.reduce(state) : state)
    initStore(store)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await show(panels)
}

async function settled() {
    for (let i = 0; i < 8; i++) {
        await act(async () => {})
    }
}
