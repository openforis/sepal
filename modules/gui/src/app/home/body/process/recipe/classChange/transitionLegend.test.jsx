import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {Recipe} from '~/app/home/body/process/recipeContext'
import {SourceRuntimeProvider} from '~/app/home/body/process/sourceRuntime/sourceRuntimeContext'
import {selectFrom} from '~/stateUtils'
import {initStore} from '~/store'

// How a Class Change's transition legend follows its images, through the real toolbar, image and Legend panels over a
// real store: the commit applying an image derives the legend in its own action, keeping what the user customised of
// each transition, and opening the recipe, reading its sources or opening the Legend writes nothing. Earth Engine
// answers each source when a test says so.

const fake = vi.hoisted(() => ({requests: []}))
vi.mock('~/apiRegistry', async () => {
    const {NEVER, of, Subject} = await import('rxjs')
    const request = key => {
        const answer$ = new Subject()
        fake.requests.push({key, answer$})
        return answer$
    }
    return {default: {
        recipe: {save$: () => NEVER, load$: () => NEVER, loadAll$: () => of(LISTING)},
        gee: {
            assetMetadata$: ({asset}) => request(`metadata:${asset}`),
            assetVersions$: ({ids}) => of({assets: ids.map(id => ({id, type: 'IMAGE', version: 'v1'}))}),
            datasets$: () => of({community: {datasets: [], matchingResults: 0}, gee: {datasets: [], matchingResults: 0}}),
            bands$: ({asset}) => request(`bands:${asset}`)
        }
    }}
})
vi.mock('~/translate', () => ({msg: (key, values) => values ? `${key} ${JSON.stringify(values)}` : `${key}`}))
vi.mock('~/app/home/user/userDetails', () => ({userDetailsHint: () => {}}))
vi.mock('~/widget/keybinding', () => ({Keybinding: ({children}) => children}))
// The panels a test opens are open until applied, cancelled or closed; no other is.
const panels = vi.hoisted(() => ({open: new Set()}))
vi.mock('~/widget/activation/activatable', async () => {
    const React = await import('react')
    return {
        withActivatable: ({id}) => Component => class extends React.Component {
            state = {active: true}

            render() {
                return panels.open.has(id) && this.state.active
                    ? <Component {...this.props} activatable={{
                        active: true, activate: () => this.setState({active: true}), deactivate: () => this.setState({active: false})
                    }}/>
                    : null
            }
        }
    }
})

const {addRecipeType} = await import('~/app/home/body/process/recipeTypeRegistry')
const {default: classChange} = await import('./classChange')
const {ClassChangeToolbar} = await import('./panels/classChangeToolbar')
const {committedRecipe} = await import('~/app/home/body/process/recipe/derivedResult')
const {defaultColor} = await import('~/widget/form/colorInput')
const {EventShield} = await import('~/widget/eventShield')
const {PortalContainer, PortalContext} = await import('~/widget/portal')

addRecipeType(classChange())

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root, store, modelWrites

beforeEach(() => {
    fake.requests = []
    panels.open.clear()
})

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
})

describe('a Class Change opened', () => {
    it('writes nothing as it opens, as its sources are read or fail, nor as the Legend opens and closes unedited', async () => {
        const saved = savedRecipe()
        await open(saved, ['legend'])

        await answer({[`bands:${FROM}`]: ['band'], [`bands:${TO}`]: new Error('Earth Engine unreachable')})
        await press('button.close')

        expect(modelWrites).toEqual([])
        expect(model()).toEqual(saved.model)
    })
})

describe('an image applied', () => {
    it('derives the transition legend in the action applying a new recipe\'s second image', async () => {
        const {toImage: _toImage, legend: _legend, ...model0} = savedRecipe().model
        await open({...savedRecipe(), model: model0}, ['toImage'])

        await chooseAsset(NEW)
        await answer({[`metadata:${NEW}`]: metadata({band: [FOREST, WATER]}), [`bands:${NEW}`]: ['band']})
        await apply()

        expect(modelWrites).toEqual(['SET_MODEL_AND_VALUES'])
        expect(model().legend.entries.map(({value, label}) => [value, label]))
            .toEqual([[1, 'Forest -> Forest'], [2, 'Forest -> Water'], [3, 'Water -> Forest'], [4, 'Water -> Water']])
    })

    it('keeps the customised transitions where a band with the same classes is chosen', async () => {
        const saved = savedRecipe()
        await open(saved, ['toImage'])
        await answer({[`metadata:${TO}`]: metadata({band: [FOREST, WATER], other: [FOREST, WATER]}), [`bands:${TO}`]: ['band', 'other']})

        await choose(BAND_FIELD, 'other')
        await apply()

        expect(modelWrites).toEqual(['SET_MODEL_AND_VALUES'])
        expect(model().toImage.band).toBe('other')
        expect(model().legend).toEqual(saved.model.legend)
    })

    it('moves a customised transition to its new code where a band with another class is chosen', async () => {
        await open(savedRecipe(), ['toImage'])
        await answer({[`metadata:${TO}`]: metadata({band: [FOREST, WATER], other: [FOREST, WATER, URBAN]}), [`bands:${TO}`]: ['band', 'other']})

        await choose(BAND_FIELD, 'other')
        await apply()

        expect(modelWrites).toEqual(['SET_MODEL_AND_VALUES'])
        expect(model().legend.entries.map(({value, label}) => [value, label])).toEqual([
            [1, 'Forest -> Forest'], [2, 'Forest -> Water'], [3, 'Forest -> Urban'],
            [4, 'Water -> Forest'], [5, 'Permanent water'], [6, 'Water -> Urban']
        ])
        expect(model().legend.entries[4]).toMatchObject({id: 't-4', color: '#123456'})
    })

    it('saves the model a draft is judged to leave, its transition legend included', async () => {
        await open(savedRecipe(), ['toImage'])
        await answer({[`metadata:${TO}`]: metadata({band: [FOREST, WATER], other: [WATER, URBAN]}), [`bands:${TO}`]: ['band', 'other']})
        await choose(BAND_FIELD, 'other')
        const applied = recipe()

        await apply()

        const judged = committedRecipe(applied, {...applied, model: {...applied.model, toImage: model().toImage}})
        expect(model()).toEqual(judged.model)
    })
})

describe('the Legend applied', () => {
    it('saves the labels it is given, in one action, the other customisations kept', async () => {
        await open(savedRecipe(), ['legend'])

        await typeInto(labelField('Forest -> Water'), 'Water gain')
        await press('button.apply')

        expect(modelWrites).toEqual(['SET_MODEL_AND_VALUES'])
        expect(model().legend.entries.map(({label}) => label))
            .toEqual(['Forest -> Forest', 'Water gain', 'Water -> Forest', 'Permanent water'])
    })
})

const ID = 'change-1'
const FROM = 'users/x/from'
const TO = 'users/x/to'
const NEW = 'users/x/new'
const LISTING = [{id: ID, name: 'Change', type: 'CLASS_CHANGE', revision: 1}]
const BAND_FIELD = 'process.classChange.panel.inputImage.changeBand.label'
const IMAGE_FIELD = 'process.classChange.panel.inputImage.image.label'

const FOREST = {value: 1, label: 'Forest', color: '#00aa00'}
const WATER = {value: 2, label: 'Water', color: '#0000aa'}
const URBAN = {value: 3, label: 'Urban', color: '#aa0000'}

const image = (id, classes) => ({
    type: 'ASSET', id, band: 'band', bands: {band: {values: classes.map(({value}) => value)}},
    legendEntries: classes.map(entry => ({id: `${id}-${entry.value}`, ...entry}))
})

// A Class Change between two images with Forest and Water, its transition legend saved with Water -> Water customised.
const savedRecipe = () => ({
    id: ID,
    type: 'CLASS_CHANGE',
    revision: 1,
    ui: {initialized: true},
    model: {
        fromImage: image(FROM, [FOREST, WATER]),
        toImage: image(TO, [FOREST, WATER]),
        dates: {fromDate: '2020-01-01', toDate: '2021-01-01'},
        legend: {entries: [
            {id: 't-1', value: 1, label: 'Forest -> Forest', color: defaultColor(1)},
            {id: 't-2', value: 2, label: 'Forest -> Water', color: defaultColor(2)},
            {id: 't-3', value: 3, label: 'Water -> Forest', color: defaultColor(3)},
            {id: 't-4', value: 4, label: 'Permanent water', color: '#123456'}
        ]},
        options: {minConfidence: 0}
    }
})

// An asset's metadata: its bands, each a classification with these classes.
const metadata = classesByBand => ({
    type: 'Image',
    bandNames: Object.keys(classesByBand),
    bands: Object.keys(classesByBand).map(id => ({id, data_type: {type: 'PixelType', precision: 'int'}})),
    properties: Object.fromEntries(Object.entries(classesByBand).flatMap(([band, classes]) => [
        [`${band}_class_names`, classes.map(({label}) => label)],
        [`${band}_class_values`, classes.map(({value}) => value)],
        [`${band}_class_palette`, classes.map(({color}) => color)]
    ]))
})

async function open(recipe, openPanels = []) {
    openPanels.forEach(id => panels.open.add(id))
    const initialState = {
        user: {currentUser: {googleTokens: {accessToken: 'token'}}},
        process: {
            loadedRecipes: {[recipe.id]: recipe},
            recipes: LISTING,
            recipeListing: {checkedAt: Date.now()},
            saveStates: {},
            projects: [],
            tabs: [{id: ID}]
        },
        assets: {user: [{id: NEW, type: 'Image', updateTime: 'T1'}], other: []},
        dimensions: {width: 1024, height: 768}
    }
    modelWrites = []
    store = createStore((state = initialState, action) => {
        const next = action.reduce ? action.reduce(state) : state
        if (selectFrom(next, ['process.loadedRecipes', ID, 'model']) !== selectFrom(state, ['process.loadedRecipes', ID, 'model'])) {
            modelWrites.push(action.type)
        }
        return next
    })
    initStore(store)
    const container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => root.render(
        <Provider store={store}>
            <SourceRuntimeProvider>
                <Recipe id={ID}>
                    <EventShield>
                        <PortalContainer/>
                        <PortalContainer id='panels'/>
                        <PortalContext id='panels'>
                            <ClassChangeToolbar/>
                        </PortalContext>
                    </EventShield>
                </Recipe>
            </SourceRuntimeProvider>
        </Provider>
    ))
    await settled()
}

// Answers every request still waiting under each key: a source's band names or metadata, or an Error it fails with.
async function answer(answers) {
    await act(async () => fake.requests
        .filter(({key, answer$}) => key in answers && !answer$.isStopped)
        .forEach(({key, answer$}) => {
            const value = answers[key]
            if (value instanceof Error) {
                answer$.error(value)
            } else {
                answer$.next(key.startsWith('bands:') ? value.map(name => ({name, arrayDimensions: 0})) : value)
                answer$.complete()
            }
        }))
    await settled()
}

async function settled() {
    for (let i = 0; i < 8; i++) {
        await act(async () => {})
    }
}

const recipe = () => selectFrom(store.getState(), ['process.loadedRecipes', ID])

const model = () => recipe().model

const field = label => document.querySelector(`[data-label="${label}"]`)

const options = () => [...document.querySelectorAll('[data-hook="option"]')]

// Another asset chosen in the image's picker, by typing its id and picking it.
async function chooseAsset(asset) {
    const input = field(IMAGE_FIELD).querySelector('input')
    await act(async () => input.click())
    await typeInto(input, asset)
    await act(async () => options().find(option => option.textContent.includes(asset)).click())
    await settled()
}

async function choose(label, value) {
    await act(async () => field(label).querySelector('input').click())
    await settled()
    await act(async () => options().find(element => element.textContent === value).click())
    await settled()
}

async function typeInto(input, text) {
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, text)
        input.dispatchEvent(new Event('input', {bubbles: true}))
    })
    await settled()
}

const panelButton = label => [...document.querySelectorAll('button')].find(button => button.textContent === label)

async function press(label) {
    await act(async () => panelButton(label).click())
    await settled()
}

const apply = () => press('button.apply')

const labelField = label => [...document.querySelectorAll('input')].find(input => input.value === label)
