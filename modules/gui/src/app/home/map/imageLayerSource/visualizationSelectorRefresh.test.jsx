import React, {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {Observable, of, Subject} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {Recipe} from '~/app/home/body/process/recipeContext'
import {SourceRuntimeProvider} from '~/app/home/body/process/sourceRuntime/sourceRuntimeContext'
import {initStore} from '~/store'
import {EventShield} from '~/widget/eventShield'
import {PortalContainer} from '~/widget/portal'

// What a recipe layer's visualization selector shows as chosen while the layer's bands are read again, and once they
// are. A Band Math recipe on another recipe's map, over a real store, source runtime, layer, selector and Combo; only map
// placement is left out, and Earth Engine answers each observation of the Band Math image when a test says so.

const earthEngine = vi.hoisted(() => ({observations: []}))

vi.mock('~/apiRegistry', () => ({default: {
    gee: {
        bands$: () => new Observable(subscriber => {
            earthEngine.observations.push(subscriber)
        }),
        assetVersions$: ({ids}) => of({assets: ids.map(id => ({id, type: 'IMAGE', version: 'v1'}))})
    },
    recipe: {save$: () => new Observable(), load$: () => new Observable(), loadAll$: () => of(LISTING)}
}}))
vi.mock('~/translate', () => ({msg: key => key}))
vi.mock('~/widget/notifications', () => ({Notifications: {error: () => {}}}))
vi.mock('~/app/home/user/userDetails', () => ({userDetailsHint: () => {}}))
vi.mock('~/app/home/map/layer/earthEngineImageLayer', () => ({
    EarthEngineImageLayer: class {
        constructor({watchedProps}) {
            this.watchedProps = watchedProps
        }
        removeFromMap() {}
    }
}))
vi.mock('~/app/home/map/mapAreaLayout', () => ({MapAreaLayout: ({form}) => form}))
// The real Combo, passed what the selector gives it, so its busy indicator can be read without its styling.
const combo = vi.hoisted(() => ({props: null}))
vi.mock('~/widget/combo', async importOriginal => {
    const {createElement} = await import('react')
    const actual = await importOriginal()
    return {...actual, Combo: props => {
        combo.props = props
        return createElement(actual.Combo, props)
    }}
})

const {addRecipeType} = await import('~/app/home/body/process/recipeTypeRegistry')
const {addRecipeImageLayer} = await import('~/app/home/body/process/recipeImageLayerRegistry')
const {default: bandMath} = await import('~/app/home/body/process/recipe/bandMath/bandMath')
const {BandMathImageLayer} = await import('~/app/home/body/process/recipe/bandMath/bandMathImageLayer')
const {RecipeImageLayer} = await import('~/app/home/body/process/recipe/recipeImageLayer')
const {TabContext} = await import('~/widget/tabs/tabContext')
const {MapAreaContext} = await import('../mapAreaContext')

addRecipeType(bandMath())
addRecipeImageLayer('BAND_MATH', BandMathImageLayer)

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const HOST = 'host-1'
const SOURCE_ID = 'band-math-layer'
const BUSY = 'map.visParams.bands.loading'

const PRESET = {id: 'p-red', type: 'continuous', bands: ['red'], min: [0], max: [1], palette: ['#000000', '#FFFFFF']}
const USER_DEFINED = {id: 'u-red', type: 'continuous', bands: ['red'], min: [0], max: [2], userDefined: true}

const LISTING = [
    {id: 'band-math-1', name: 'Math', type: 'BAND_MATH', revision: 1},
    {id: 'band-math-2', name: 'Other math', type: 'BAND_MATH', revision: 1},
    {id: HOST, name: 'Host', type: 'MOSAIC', revision: 1}
]

let root, container

beforeEach(() => {
    earthEngine.observations = []
    combo.props = null
})

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    container?.remove()
})

describe.each([
    ['a preset', PRESET],
    ['a style the user defined', USER_DEFINED]
])('%s chosen for a layer that is refreshed', (_kind, chosen) => {
    it('stays shown while the bands are read again, the Combo busy and still the one mounted', async () => {
        await openLayer({chosen})
        await answer(scalar('red'))
        const input = comboInput()
        expect(input.placeholder).toBe('red')

        await refresh()

        expect(earthEngine.observations.filter(isWaiting)).toHaveLength(1)
        expect(comboInput()).toBe(input)
        expect(input.placeholder).toBe('red')
        expect(combo.props.busyMessage).toBe(BUSY)
    })

    it('offers nothing to edit while only its label is shown', async () => {
        await openLayer({chosen})
        await answer(scalar('red'))

        await refresh()

        expect(editButton().disabled).toBe(true)
    })

    it('cannot be chosen again while only its label is shown', async () => {
        await openLayer({chosen})
        await answer(scalar('red'))
        await refresh()

        await chooseOption('red')

        expect(chosenAgain).toEqual([])
    })

    it('is shown from the read once it settles, no longer busy', async () => {
        await openLayer({chosen})
        await answer(scalar('red'))
        const input = comboInput()
        await refresh()

        await answer(scalar('red'))

        expect(comboInput()).toBe(input)
        expect(input.placeholder).toBe('red')
        expect(combo.props.busyMessage).toBeUndefined()
        expect(editButton().disabled).toBe(false)
    })

    it('is no longer shown once the read finds its band cannot be drawn', async () => {
        await openLayer({chosen})
        await answer(scalar('red'))
        await refresh()

        await answer({name: 'red', arrayDimensions: 1})

        expect(comboInput().placeholder).not.toBe('red')
        expect(combo.props.busyMessage).toBeUndefined()
    })

    it('is no longer shown once the read fails', async () => {
        await openLayer({chosen})
        await answer(scalar('red'))
        await refresh()

        await fail(new Error('Earth Engine unavailable'))

        expect(comboInput().placeholder).not.toBe('red')
        expect(combo.props.busyMessage).toBeUndefined()
    })
})

describe('a selection changed while the bands are read again', () => {
    it('shows nothing of the one it replaced', async () => {
        await openLayer({chosen: PRESET})
        await answer(scalar('red'))
        await refresh()

        await choose({id: 'u-elsewhere', type: 'continuous', bands: ['red'], min: [0], max: [3], userDefined: true})

        expect(comboInput().placeholder).not.toBe('red')
    })
})

describe('a layer whose source is replaced', () => {
    it('shows nothing of the old source while the new one is read, then what the new one offers', async () => {
        await openLayer({chosen: PRESET})
        await answer(scalar('red'))

        await showSource('band-math-2')

        expect(comboInput().placeholder).not.toBe('red')
        await answer(scalar('crimson'))
        expect(comboInput().placeholder).toBe('crimson')
    })
})

const scalar = name => ({name, arrayDimensions: 0})

const isWaiting = subscriber => !subscriber.closed

const comboInput = () => container.querySelector('input')

// The edit control the selector gives the Combo's label.
const editButton = () => combo.props.labelButtons.find(({key}) => key === 'edit').props

// One input asset, its style over `red` offered as a preset, output under `outputName`.
const bandMathRecipe = (id, outputName) => {
    const input = {
        imageId: 'img-1', name: 'i1', type: 'ASSET', id: 'users/x/image',
        includedBands: [{id: 'red-id', name: 'red'}], visualizations: [PRESET]
    }
    return {
        id,
        type: 'BAND_MATH',
        revision: 1,
        ui: {initialized: true},
        model: {
            inputImagery: {images: [input]},
            calculations: {calculations: []},
            outputBands: {outputImages: [{...input, outputBands: [{id: 'red-id', name: 'red', defaultOutputName: outputName}]}]}
        }
    }
}

let hostRecipe, mapArea, source, chosenVisParams, chosenAgain

async function openLayer({chosen}) {
    const initialState = {
        user: {currentUser: {googleTokens: {accessToken: 'token'}}},
        process: {
            loadedRecipes: {
                'band-math-1': bandMathRecipe('band-math-1', 'red'),
                'band-math-2': bandMathRecipe('band-math-2', 'crimson'),
                [HOST]: {
                    id: HOST, type: 'MOSAIC', revision: 1, model: {}, ui: {initialized: true},
                    layers: {
                        userDefinedVisualizations: {[SOURCE_ID]: [USER_DEFINED]},
                        areas: {main: {imageLayer: {sourceId: SOURCE_ID}, featureLayers: []}}
                    }
                }
            },
            recipes: LISTING,
            recipeListing: {checkedAt: Date.now()},
            saveStates: {},
            projects: [],
            tabs: [{id: HOST}]
        },
        assets: {user: [], other: []},
        dimensions: {width: 1024, height: 768}
    }
    const store = createStore((state = initialState, action) => action.reduce ? action.reduce(state) : state)
    initStore(store)
    hostRecipe = initialState.process.loadedRecipes[HOST]
    chosenAgain = []
    mapArea = {area: 'main', updateLayerConfig: config => chosenAgain.push(config)}
    source = {id: SOURCE_ID, type: 'Recipe', sourceConfig: {recipeId: 'band-math-1'}}
    chosenVisParams = chosen
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => root.render(
        <Provider store={store}>
            <SourceRuntimeProvider>
                <PortalContainer/>
                <EventShield>
                    <Recipe id={HOST}>
                        <TabContext id={HOST} busyIn$={new Subject()} busyOut$={new Subject()}>
                            <MapAreaContext mapArea={mapArea}>
                                <Layer/>
                            </MapAreaContext>
                        </TabContext>
                    </Recipe>
                </EventShield>
            </SourceRuntimeProvider>
        </Provider>
    ))
    await settled()
}

let rerender = null

const Layer = () => {
    const [, update] = React.useReducer(count => count + 1, 0)
    rerender = update
    return <RecipeImageLayer currentRecipe={hostRecipe} source={source} layerConfig={{visParams: chosenVisParams}} map={{}}/>
}

// The layer's saved selection, changed from elsewhere.
async function choose(visParams) {
    chosenVisParams = visParams
    await act(async () => rerender())
    await settled()
}

async function showSource(recipeId) {
    source = {...source, sourceConfig: {recipeId}}
    await act(async () => rerender())
    await settled()
}

// Opens the Combo and clicks the option labelled so, if it offers one.
async function chooseOption(label) {
    await act(async () => comboInput().click())
    const option = [...container.querySelectorAll('li')]
        .map(item => item.firstElementChild)
        .find(element => element?.textContent === label)
    expect(option).toBeDefined()
    await act(async () => option.click())
    await settled()
}

async function refresh() {
    await act(async () => container.querySelector('[data-icon="rotate"]').closest('button').click())
    await settled()
}

// Every observation of the Band Math image still waiting answers with these bands.
async function answer(...bands) {
    await act(async () => earthEngine.observations.filter(isWaiting).forEach(subscriber => {
        subscriber.next(bands)
        subscriber.complete()
    }))
    await settled()
}

async function fail(error) {
    await act(async () => earthEngine.observations.filter(isWaiting).forEach(subscriber => subscriber.error(error)))
    await settled()
}

async function settled() {
    for (let i = 0; i < 5; i++) {
        await act(async () => {})
    }
}
