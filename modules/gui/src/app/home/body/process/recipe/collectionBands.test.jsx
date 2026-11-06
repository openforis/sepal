import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {NEVER, Observable, of} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {collectionMeasures} from '#sepal/recipe/collectionBands'
import {IMAGE_OUTPUT, PIXEL_OBSERVATIONS, PIXEL_SEGMENTS} from '#sepal/recipe/output/readiness'
import {Recipe} from '~/app/home/body/process/recipeContext'
import {SourceRuntimeProvider, withSourceRuntime} from '~/app/home/body/process/sourceRuntime/sourceRuntimeContext'
import {selectFrom} from '~/stateUtils'
import {initStore} from '~/store'
import {EventShield} from '~/widget/eventShield'
import {PortalContainer, PortalContext} from '~/widget/portal'
import toolbarButtonStyles from '~/widget/toolbar/toolbarButton.module.css'
import {tooltipText} from '~/widget/tooltip.test.fixtures'

// A band of the images CCDC's Sources break on, or Phenology's analyse, must be one the configured collection carries
// (collectionBands.js). Chosen, it stays chosen, shown and explained beside the field until the user changes it; a Sources
// draft keeping it cannot be committed, while a PRC Apply leaving it uncarried is allowed, marking SRC and holding what
// builds from it. The roots, toolbars, Sources and PRC panels, the store and the source runtime are real; recipe reads
// answer from stored records, Earth Engine with CCDC's segment bands, and no chart request completes.

const fake = vi.hoisted(() => ({stored: {}, listing: [], open: new Set()}))
vi.mock('~/apiRegistry', () => ({default: {
    gee: {
        bands$: () => of(['tStart', 'tEnd', 'tBreak', 'numObs', 'changeProb', 'ndvi_coefs', 'ndvi_rmse', 'ndvi_magnitude']),
        assetVersions$: ({ids}) => of({assets: ids.map(id => ({id, type: 'IMAGE', version: 'v1'}))}),
        loadCCDCSegments$: () => new Observable(),
        loadTimeSeriesObservations$: () => new Observable()
    },
    recipe: {load$: id => fake.stored[id] ? of(fake.stored[id]) : NEVER, loadAll$: () => of(fake.listing), save$: () => of()}
}}))
vi.mock('~/translate', () => ({msg: (key, values) => {
    const text = [key].flat().join('.')
    return values ? `${text} ${JSON.stringify(values)}` : text
}}))
vi.mock('~/widget/notifications', () => ({Notifications: {error: () => {}}}))
vi.mock('~/app/home/user/userDetails', () => ({userDetailsHint: () => {}}))
vi.mock('~/widget/form/assetCombo', () => ({FormAssetCombo: () => null}))
// A tooltip's text is rendered where it is attached, to be read without hovering.
vi.mock('~/widget/tooltip', () => ({
    Tooltip: ({msg, disabled, children}) => !disabled && [msg].flat().map(tooltipText).some(line => typeof line === 'string')
        ? <span data-tooltip={JSON.stringify([msg].flat().map(tooltipText).filter(line => typeof line === 'string'))}>{children}</span>
        : children
}))
// The panels the test opens are open; no toolbar button is pressed.
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
// The roots' maps and their layers: the toolbars are what is looked at.
vi.mock('~/app/home/map/map', async importOriginal => ({...await importOriginal(), Map: ({children}) => children}))
vi.mock('./aoi', async importOriginal => ({...await importOriginal(), Aoi: () => null}))
vi.mock('./recipeImageLayerSource', async importOriginal => ({...await importOriginal(), initializeLayers: () => {}}))

const {addRecipeType} = await import('~/app/home/body/process/recipeTypeRegistry')
const {default: ccdc} = await import('./ccdc/ccdc')
const {breakDetectionOptions, defaultModel: ccdcDefaults} = await import('./ccdc/ccdcRecipe')
const {default: phenology} = await import('./phenology/phenology')
const {defaultModel: phenologyDefaults} = await import('./phenology/phenologyRecipe')
const {mapProductGate, pixelOperationsAvailability, retrieveAvailability} = await import('./operationAvailability')
const {requestGate} = await import('./sourceRequirements')

addRecipeType(ccdc())
addRecipeType(phenology())

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root, container, store, runtime

beforeEach(() => {
    fake.open = new Set()
})

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    container?.remove()
})

const TYPES = [
    {
        type: 'CCDC',
        Root: ccdc().components.recipe,
        field: 'breakpointBands',
        form: 'process.ccdc.panel.sources.form',
        src: 'process.ccdc.panel.sources.button',
        chosen: bands => bands,
        // Its breakpoint bands are fitted by its image, its pixel segments and its count; its pixel observations fit none.
        heldGates: () => [retrieveGate(), operationGate(IMAGE_OUTPUT), operationGate(PIXEL_SEGMENTS), countGate()],
        freeGates: () => [operationGate(PIXEL_OBSERVATIONS)],
        replace: async (field, band, replacement) => {
            await toggle(field, band)
            await toggle(field, replacement)
        }
    },
    {
        type: 'PHENOLOGY',
        Root: phenology().components.recipe,
        field: 'band',
        form: 'process.phenology.panel.sources.form',
        src: 'process.changeAlerts.panel.sources.button',
        // Of the bands a scenario names, the last.
        chosen: bands => bands.at(-1),
        heldGates: () => [retrieveGate(), operationGate(IMAGE_OUTPUT)],
        freeGates: () => [],
        replace: (field, _band, replacement) => toggle(field, replacement)
    }
]

describe.each(TYPES)('the bands of the images $type Sources offer', t => {
    it.each([
        ['Landsat 8 top of atmosphere', {}, [], 'blue'],
        ['Landsat 8 surface reflectance', {}, ['SR'], 'blue'],
        ['Landsat 8 surface reflectance with BRDF correction', {}, ['SR', 'BRDF'], 'blue'],
        ['Sentinel-1', {dataSetType: 'RADAR', dataSets: {SENTINEL_1: ['SENTINEL_1']}}, ['SR'], 'VV']
    ])('are, over %s, those the collection carries with the processing applied', async (_case, sources, corrections, band) => {
        await open(t, {chosen: [band], sources, corrections, panels: ['sources']})

        expect(choicesOf(bandsOf(t)).sort()).toEqual(collectionMeasures(applied().model).sort())
    })
})

describe.each(TYPES)('a $type saved choosing a band its collection does not carry', t => {
    it('opens unedited, the band shown chosen and explained, SRC marked and what builds from it held', async () => {
        await open(t, {chosen: ['ndvi', 'thermal2'], corrections: ['SR'], panels: ['sources']})

        expect(chosenOf(bandsOf(t))).toContain('thermal2')
        expect(errorsOf(bandsOf(t))).toEqual([unsupported(t, ['thermal2'])])
        expect(button('button.close').disabled).toBe(false)
        expect(inError(t.src)).toBe(true)
        expect(buttonTooltip(t.src)).toContain(unsupported(t, ['thermal2']))
        t.heldGates().forEach(gate => expect(gate).toMatchObject({withdraw: true, section: t.src}))
        t.freeGates().forEach(gate => expect(gate).toBe(null))
        expect(applied().model).toBe(fake.stored[idOf(t)].model)
    })

    it('stays chosen, the model unchanged, as Sources render again over More and a session read completing', async () => {
        await open(t, {chosen: ['ndvi', 'thermal2'], corrections: ['SR'], panels: ['sources']})
        const model = applied().model

        await press('button.more')
        await act(async () => store.dispatch({type: 'LISTING_CHECKED', reduce: state => ({
            ...state, process: {...state.process, recipeListing: {checkedAt: Date.now() + 1}}
        })}))
        await settled()

        expect(chosenOf(bandsOf(t))).toContain('thermal2')
        expect(errorsOf(bandsOf(t))).toEqual([unsupported(t, ['thermal2'])])
        expect(applied().model).toBe(model)
    })

    it('refuses Apply and Enter for a Sources draft keeping it, whatever else the draft changes', async () => {
        await open(t, {chosen: ['ndvi', 'thermal2'], corrections: ['SR'], panels: ['sources']})
        const model = applied().model

        await toggle(dataSetsOf(t), 'sources.dataSets.LANDSAT_7.label')

        expect(errorsOf(bandsOf(t))).toEqual([unsupported(t, ['thermal2'])])
        expect(button('button.apply').disabled).toBe(true)
        await submitByKeyboard()

        expect(applied().model).toBe(model)
        expect(chosenOf(bandsOf(t))).toContain('thermal2')
    })

    it('is repaired by choosing a band the collection carries, which clears the explanation, SRC and what was held', async () => {
        await open(t, {chosen: ['ndvi', 'thermal2'], corrections: ['SR'], panels: ['sources']})

        await t.replace(bandsOf(t), 'thermal2', 'thermal')

        expect(errorsOf(bandsOf(t))).toEqual([])
        await press('button.apply')
        expect(applied().model.sources[t.field]).toEqual(t.chosen(t.type === 'CCDC' ? ['ndvi', 'thermal'] : ['thermal']))
        expect(inError(t.src)).toBe(false)
        t.heldGates().forEach(gate => expect(gate).toBe(null))
    })

    it('keeps its explanation as the draft selects no Classification instead of the one selected', async () => {
        await open(t, {chosen: ['ndvi', 'thermal2'], corrections: ['SR'], classification: CLASSIFICATION, panels: ['sources']})
        button('button.more') && await press('button.more')
        expect(choicesOf(bandsOf(t))).toContain(REGRESSION)
        expect(errorsOf(bandsOf(t))).toEqual([unsupported(t, ['thermal2'])])

        await clearClassification()

        expect(choicesOf(bandsOf(t))).not.toContain(REGRESSION)
        expect(errorsOf(bandsOf(t))).toEqual([unsupported(t, ['thermal2'])])
    })
})

describe.each(TYPES)('a $type whose processing is changed so its collection no longer carries a chosen band', t => {
    it('applies the change in PRC, marking SRC, holding what builds from the band, and keeping the band', async () => {
        await open(t, {chosen: ['ndvi', 'thermal2'], corrections: [], panels: ['options']})
        expect(inError(t.src)).toBe(false)

        await toggle(CORRECTIONS, SURFACE_REFLECTANCE)
        await press('button.apply')

        expect(applied().model.options.corrections).toEqual(['SR'])
        expect(applied().model.sources[t.field]).toEqual(t.chosen(t.type === 'CCDC' ? ['ndvi', 'thermal2'] : ['thermal2']))
        expect(inError(t.src)).toBe(true)
        expect(buttonTooltip(t.src)).toContain(unsupported(t, ['thermal2']))
        t.heldGates().forEach(gate => expect(gate).toMatchObject({withdraw: true, section: t.src}))
    })

    it('is repaired by restoring the processing in PRC', async () => {
        await open(t, {chosen: ['ndvi', 'thermal2'], corrections: ['SR'], panels: ['options']})
        expect(inError(t.src)).toBe(true)

        await toggle(CORRECTIONS, SURFACE_REFLECTANCE)
        await press('button.apply')

        expect(applied().model.options.corrections).toEqual([])
        expect(inError(t.src)).toBe(false)
        t.heldGates().forEach(gate => expect(gate).toBe(null))
    })

    it('is judged in Sources against the processing applied when the draft is submitted', async () => {
        await open(t, {chosen: ['ndvi'], corrections: [], panels: ['sources']})
        const model = applied().model
        await toggle(bandsOf(t), 'thermal2')
        expect(button('button.apply').disabled).toBe(false)

        await act(async () => {
            store.dispatch({type: 'PROCESSED_ELSEWHERE', reduce: state => withOptions(state, idOf(t), {corrections: ['SR']})})
            button('button.apply').click()
        })
        await settled()

        expect(applied().model.sources).toBe(model.sources)
        expect(errorsOf(bandsOf(t))).toEqual([unsupported(t, ['thermal2'])])
    })
})

describe.each(TYPES)('a $type whose Sources draft changes collection', t => {
    it('keeps a band the radar collection does not carry chosen and explained, refusing Apply, until a radar band is chosen', async () => {
        await open(t, {chosen: ['ndvi'], corrections: ['SR'], panels: ['sources']})

        await toggle(`${t.form}.dataSetType.label`, `${t.form}.dataSetTypes.RADAR`)

        expect(chosenOf(dataSetsOf(t))).toEqual(['sources.dataSets.SENTINEL_1.label'])
        expect(chosenOf(bandsOf(t))).toEqual(['ndvi'])
        expect(errorsOf(bandsOf(t))).toEqual([unsupported(t, ['ndvi'])])
        expect(button('button.apply').disabled).toBe(true)

        await t.replace(bandsOf(t), 'ndvi', 'VV')
        expect(errorsOf(bandsOf(t))).toEqual([])
        await press('button.apply')

        expect(applied().model.sources.dataSets).toEqual({SENTINEL_1: ['SENTINEL_1']})
        expect(applied().model.sources[t.field]).toEqual(t.chosen(['VV']))
    })

    it('keeps the bands chosen, judging none of them, while no data set is chosen, and judges them by the data sets chosen next', async () => {
        await open(t, {chosen: ['ndvi', 'thermal'], corrections: ['SR'], panels: ['sources']})
        const chosen = chosenOf(bandsOf(t)).sort()

        await toggle(dataSetsOf(t), 'sources.dataSets.LANDSAT_8.label')

        expect(chosenOf(dataSetsOf(t))).toEqual([])
        expect(choicesOf(bandsOf(t)).sort()).toEqual(chosen)
        expect(chosenOf(bandsOf(t)).sort()).toEqual(chosen)
        expect(errorsOf(bandsOf(t))).toEqual([])
        expect(button('button.apply').disabled).toBe(true)

        await toggle(dataSetsOf(t), 'sources.dataSets.SENTINEL_2.label')

        expect(chosenOf(bandsOf(t)).sort()).toEqual(chosen)
        expect(errorsOf(bandsOf(t))).toEqual([unsupported(t, ['thermal'])])
        expect(button('button.apply').disabled).toBe(true)
    })
})

describe.each(TYPES)('a $type set up by its wizard', t => {
    it('refuses Done and Enter on Sources while the draft keeps a band the collection does not carry', async () => {
        await open(t, {chosen: ['ndvi', 'thermal2'], corrections: ['SR'], panels: ['sources'], initialized: false})
        const model = applied().model

        expect(button('button.done').disabled).toBe(true)
        await submitByKeyboard()

        expect(applied().model).toBe(model)
        expect(applied().ui.initialized).toBe(false)
    })

    it('refuses Done and Enter on Sources once a draft changing to Planet keeps the optical brightness', async () => {
        await open(t, {chosen: ['brightness'], corrections: ['SR'], panels: ['sources'], initialized: false})
        const model = applied().model
        expect(button('button.done').disabled).toBe(false)

        await toggle(`${t.form}.dataSetType.label`, `${t.form}.dataSetTypes.PLANET`)

        expect(button('button.done').disabled).toBe(true)
        await submitByKeyboard()

        expect(applied().model).toBe(model)
        expect(applied().ui.initialized).toBe(false)
    })
})

describe.each(TYPES)('a $type over Planet imagery', t => {
    it.each([
        ['a basemap', true, 'BASEMAPS', 'DISABLED'],
        ['Daily, histogram-matched', true, 'DAILY', 'ENABLED'],
        ['Daily, unmatched, whose eight-band imagery would carry it', false, 'DAILY', 'DISABLED']
    ])('over %s keeps green1 chosen, refusing it: %s', async (_case, refused, source, histogramMatching) => {
        await open(t, {chosen: ['green1'], sources: PLANET(source), options: {histogramMatching}, panels: ['sources']})

        expect(chosenOf(bandsOf(t))).toEqual(['green1'])
        expect(errorsOf(bandsOf(t))).toEqual(refused ? [unsupported(t, ['green1'])] : [])
        expect(inError(t.src)).toBe(refused)
    })

    // Tasseled-cap brightness needs SWIR bands no Planet imagery carries; Planet's own RGB brightness is a working band.
    it.each([
        ['a basemap', 'BASEMAPS', 'DISABLED'],
        ['NICFI', 'NICFI', 'DISABLED'],
        ['Daily, histogram-matched', 'DAILY', 'ENABLED'],
        ['Daily, unmatched', 'DAILY', 'DISABLED']
    ])('saved over %s, opens unedited, brightness shown chosen and refused, SRC marked and what builds from it held', async (_case, source, histogramMatching) => {
        await open(t, {chosen: ['brightness'], sources: PLANET(source), options: {histogramMatching}, panels: ['sources']})

        expect(chosenOf(bandsOf(t))).toEqual(['brightness'])
        expect(errorsOf(bandsOf(t))).toEqual([unsupported(t, ['brightness'])])
        expect(inError(t.src)).toBe(true)
        t.heldGates().forEach(gate => expect(gate).toMatchObject({withdraw: true, section: t.src}))
        t.freeGates().forEach(gate => expect(gate).toBe(null))
        expect(applied().model).toBe(fake.stored[idOf(t)].model)
    })

    it('saved choosing brightness, is repaired by choosing a band Planet carries, which clears SRC and what was held', async () => {
        await open(t, {chosen: ['brightness'], sources: PLANET('NICFI'), panels: ['sources']})

        await t.replace(bandsOf(t), 'brightness', 'ndvi')

        expect(errorsOf(bandsOf(t))).toEqual([])
        await press('button.apply')
        expect(applied().model.sources[t.field]).toEqual(t.chosen(['ndvi']))
        expect(inError(t.src)).toBe(false)
        t.heldGates().forEach(gate => expect(gate).toBe(null))
    })

    it('keeps the optical brightness chosen and refused in a Sources draft changing to Planet, refusing Apply and Enter', async () => {
        await open(t, {chosen: ['brightness'], corrections: ['SR'], panels: ['sources']})
        expect(errorsOf(bandsOf(t))).toEqual([])
        const model = applied().model

        await toggle(`${t.form}.dataSetType.label`, `${t.form}.dataSetTypes.PLANET`)

        expect(chosenOf(bandsOf(t))).toEqual(['brightness'])
        expect(errorsOf(bandsOf(t))).toEqual([unsupported(t, ['brightness'])])
        expect(button('button.apply').disabled).toBe(true)
        await submitByKeyboard()

        expect(applied().model).toBe(model)
        expect(chosenOf(bandsOf(t))).toEqual(['brightness'])
    })

    it('clears the refusal, brightness still chosen, as the draft returns to optical imagery holding the tasseled cap\'s inputs', async () => {
        await open(t, {chosen: ['brightness'], corrections: ['SR'], panels: ['sources']})
        await toggle(`${t.form}.dataSetType.label`, `${t.form}.dataSetTypes.PLANET`)
        expect(errorsOf(bandsOf(t))).toEqual([unsupported(t, ['brightness'])])

        // Which data set the family change defaults to depends on the recipe's dates, so one is chosen.
        await toggle(`${t.form}.dataSetType.label`, `${t.form}.dataSetTypes.OPTICAL`)
        await toggle(dataSetsOf(t), 'sources.dataSets.SENTINEL_2.label')

        expect(chosenOf(dataSetsOf(t))).toContain('sources.dataSets.SENTINEL_2.label')
        expect(chosenOf(bandsOf(t))).toEqual(['brightness'])
        expect(errorsOf(bandsOf(t))).toEqual([])
        await press('button.apply')
        expect(applied().model.sources.dataSets).toMatchObject({SENTINEL_2: ['SENTINEL_2']})
        expect(applied().model.sources[t.field]).toEqual(t.chosen(['brightness']))
        expect(inError(t.src)).toBe(false)
    })

    it('refuses, over unmatched Daily, a band no Planet imagery carries', async () => {
        await open(t, {chosen: ['swir1'], sources: PLANET('DAILY'), options: {histogramMatching: 'DISABLED'}, panels: ['sources']})

        expect(errorsOf(bandsOf(t))).toEqual([unsupported(t, ['swir1'])])
        expect(inError(t.src)).toBe(true)
    })
})

const CLASSIFICATION = 'classification-1'
const REGRESSION = 'process.classification.bands.regression'
const CORRECTIONS = 'process.mosaic.panel.composite.form.corrections.label'
const SURFACE_REFLECTANCE = 'process.mosaic.panel.composite.form.corrections.surfaceReflectance.label'
const PLANET = source => ({dataSetType: 'PLANET', dataSets: {PLANET: [source]}, assets: ['users/x/planet']})

const unsupported = (t, bands) => `process.source.collectionBands.${t.field} ${JSON.stringify({bands: bands.join(', '), count: bands.length})}`

const idOf = ({type}) => `${type.toLowerCase()}-1`

const bandsOf = t => `${t.form}.${t.field}.label`

const dataSetsOf = t => `${t.form}.dataSets.label`

// A Random Forest over the bands Landsat supplies, with no training data: whatever it is asked of, it reads no band of the images.
const classificationRecord = {
    id: CLASSIFICATION,
    type: 'CLASSIFICATION',
    model: {
        legend: {entries: [{value: 1, label: 'Forest'}, {value: 2, label: 'Other'}]},
        classifier: {type: 'RANDOM_FOREST'},
        inputImagery: {images: [{imageId: 'i-1', type: 'ASSET', id: 'users/x/input', bandSetSpecs: [{id: 'b', type: 'IMAGE_BANDS', included: ['red', 'nir']}]}]}
    }
}

// Over Landsat 8, selecting no Classification unless `classification` says otherwise, its processing the type's defaults
// with `corrections` and `options` given.
const recipeOf = (t, {chosen, corrections, sources, options, classification = null, initialized = true}) => {
    const defaults = t.type === 'CCDC' ? ccdcDefaults : phenologyDefaults
    return {
        id: idOf(t),
        type: t.type,
        title: t.type,
        revision: 1,
        model: {
            aoi: {type: 'POLYGON', path: [[0, 0], [0, 1], [1, 1]]},
            dates: t.type === 'CCDC' ? {startDate: '2020-01-01', endDate: '2021-01-01'} : {fromYear: 2020, toYear: 2020},
            sources: {
                dataSetType: 'OPTICAL', classification, dataSets: {LANDSAT: ['LANDSAT_8']}, assets: [], cloudPercentageThreshold: 75,
                ...sources,
                [t.field]: t.chosen(chosen)
            },
            options: {...defaults.options, ...(corrections && {corrections}), ...options},
            ...(t.type === 'CCDC' && {ccdcOptions: breakDetectionOptions.moderate})
        },
        ui: {initialized}
    }
}

const withOptions = (state, id, options) => {
    const recipe = state.process.loadedRecipes[id]
    return {...state, process: {...state.process, loadedRecipes: {
        ...state.process.loadedRecipes,
        [id]: {...recipe, model: {...recipe.model, options: {...recipe.model.options, ...options}}}
    }}}
}

const applied = () => Object.values(selectFrom(store.getState(), 'process.loadedRecipes')).find(({type}) => type !== 'CLASSIFICATION')

const retrieveGate = () => retrieveAvailability({
    state: store.getState(), recipe: applied(), evidenceOwnerOf: id => runtime.evidenceOwnerOf(id), heldFor: key => runtime.heldFor(key), now: Date.now()
}).gate

const operationGate = operation => operation === IMAGE_OUTPUT
    ? requestGate({state: store.getState(), recipe: applied(), operation, evidenceOwnerOf: id => runtime.evidenceOwnerOf(id), heldFor: key => runtime.heldFor(key), now: Date.now()})
    : pixelOperationsAvailability({state: store.getState(), recipe: applied(), heldFor: key => runtime.heldFor(key), operations: [operation]}).gate

const countGate = () => mapProductGate({state: store.getState(), recipe: applied(), product: {name: 'COUNT'}, heldFor: key => runtime.heldFor(key)})

const field = label => document.querySelector(`[data-label="${label}"]`)

// The choices a field offers, by name: its buttons but the one marking its errors, which names nothing.
const choiceButtons = label => [...field(label).querySelectorAll('button')].filter(({textContent}) => textContent)

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
    expect(button(label), `no button ${label}`).toBeDefined()
    await act(async () => button(label).click())
    await settled()
}

const toggle = async (label, choice) => {
    const option = [...field(label).querySelectorAll('button')].find(({textContent}) => textContent === choice)
    expect(option, `no choice ${choice} in ${label}`).toBeDefined()
    await act(async () => option.click())
    await settled()
}

const submitByKeyboard = async () => {
    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true})))
    await act(async () => document.querySelector('form').dispatchEvent(new Event('submit', {bubbles: true, cancelable: true})))
    await settled()
}

// The control the user clicks to clear the selected Classification, found by the icon that names it.
const clearClassification = async () => {
    const clear = document.querySelector('[data-icon="xmark"]')?.closest('button')
    expect(clear, 'the selector offers no way to clear').toBeDefined()
    await act(async () => clear.click())
    await settled()
}

const RuntimeProbe = withSourceRuntime()(({sourceRuntime}) => {
    runtime = sourceRuntime
    return null
})

async function open(t, {panels, ...configuration}) {
    const recipe = recipeOf(t, configuration)
    fake.stored = {[recipe.id]: recipe, [CLASSIFICATION]: classificationRecord}
    fake.open = new Set(panels)
    fake.listing = [recipe, classificationRecord].map(({id, type}) => ({id, name: id, type, revision: 1}))
    const initialState = {
        dimensions: {width: 1024, height: 768},
        user: {currentUser: {googleTokens: {accessToken: 'token'}}},
        process: {
            loadedRecipes: {[recipe.id]: recipe},
            recipes: fake.listing,
            recipeListing: {checkedAt: Date.now()},
            saveStates: {},
            projects: [],
            tabs: [{id: recipe.id}]
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
                <RuntimeProbe/>
                <PortalContainer/>
                <PortalContainer id='test-portal'/>
                <PortalContext id='test-portal'>
                    <EventShield>
                        <Recipe id={recipe.id}>
                            <t.Root/>
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
