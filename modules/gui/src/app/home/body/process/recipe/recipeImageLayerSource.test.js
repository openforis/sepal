import {act, createElement} from 'react'
import {createRoot} from 'react-dom/client'
import {of, throwError} from 'rxjs'
import {afterEach, beforeAll, beforeEach, describe, expect, it, vi} from 'vitest'

// An additional image layer that shows another recipe. Two things are asked of it: that it loads what it
// names, and that it does not copy what that recipe owns.
//
// Derived from a saved Masking recipe that carried `{"type": "Recipe", "sourceConfig": {}}` - an entry
// applied while nothing was selected, which named no recipe at all and asked for one on every open.

vi.mock('~/compose', () => ({
    compose: (Component, ..._wrappers) => Component,
    composeHoC: () => Component => Component
}))

vi.mock('~/connect', () => ({connect: () => Component => Component}))

const logged = vi.fn()
vi.mock('~/log', () => ({
    getLogger: () => ({error: (...args) => logged(...args), warn: () => {}, info: () => {}, debug: () => {}, trace: () => {}})
}))

const error = vi.fn()
vi.mock('~/widget/notifications', () => ({Notifications: {error: (...args) => error(...args)}}))

vi.mock('~/app/home/map/aoiFeatureLayerSource', () => ({createAoiFeatureLayerSource: () => ({id: 'aoi'})}))
vi.mock('~/app/home/map/labelsFeatureLayerSource', () => ({createLabelsFeatureLayerSource: () => ({id: 'labels'})}))
vi.mock('~/app/home/map/imageLayerSource/googleSatelliteImageLayerSource', () => ({
    createGoogleSatelliteImageLayerSource: () => ({id: 'google'})
}))
vi.mock('../recipe', () => ({recipeActionBuilder: () => () => ({setAll: () => ({dispatch: () => {}})})}))
vi.mock('../recipeAccess', () => ({recipeAccess: () => Component => Component}))
vi.mock('../recipeContext', () => ({withRecipe: () => Component => Component}))

const {RecipeImageLayerSource} = await import('./recipeImageLayerSource')
const {msg, setLanguage, TranslationProvider} = await import('~/translate')

const loadRecipe$ = vi.fn(() => of({id: 'source-1', title: 'Band math'}))

const layerSource = source => {
    const {props, dispatched, streams} = layerSourceProps(source)
    return {component: new RecipeImageLayerSource(props), dispatched, streams}
}

// Rendered and mounted, as a recipe's layer sources are when it opens.
const mounted = []
const mountLayerSource = source => {
    const {props, dispatched} = layerSourceProps(source)
    const root = createRoot(document.createElement('div'))
    act(() => root.render(createElement(RecipeImageLayerSource, props)))
    mounted.push(root)
    return {dispatched}
}

const layerSourceProps = source => {
    const dispatched = []
    const streams = []
    const props = {
        source,
        loadRecipe$,
        recipeActionBuilder: () => ({
            set(path, value) {
                this.written = {path, value}
                return this
            },
            dispatch() {
                dispatched.push(this.written)
            }
        }),
        stream: (name, stream$, onNext, onError) => {
            if (stream$ === undefined) {
                return {active: false}
            }
            streams.push(name)
            return stream$.subscribe({next: onNext, error: onError})
        }
    }
    return {props, dispatched, streams}
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true

// Notifications are read in the English they are shown in.
beforeAll(() => {
    setLanguage('en')
    const root = createRoot(document.createElement('div'))
    act(() => root.render(createElement(TranslationProvider)))
    act(() => root.unmount())
})

afterEach(() => mounted.splice(0).forEach(root => act(() => root.unmount())))

beforeEach(() => {
    loadRecipe$.mockClear()
    error.mockClear()
    logged.mockClear()
})

// The entry names nothing. Asking for it produced `/api/processing-recipes/undefined`, and because the
// answer never arrived the next render asked again.
describe('a saved layer entry that names no recipe', () => {
    const incomplete = {type: 'Recipe', sourceConfig: {}}

    it('is not requested when the recipe is opened', () => {
        const {component} = layerSource(incomplete)

        component.componentDidMount()

        expect(loadRecipe$).not.toHaveBeenCalled()
    })

    it('is not requested again on every render', () => {
        const {component} = layerSource(incomplete)

        component.componentDidMount()
        component.componentDidUpdate({})
        component.componentDidUpdate({})

        expect(loadRecipe$).not.toHaveBeenCalled()
    })

    it('reports nothing, because nothing is missing', () => {
        const {component} = layerSource(incomplete)

        component.componentDidMount()

        expect(error).not.toHaveBeenCalled()
    })
})

describe('a layer entry naming a recipe', () => {
    const valid = {id: 'source-1', type: 'Recipe', sourceConfig: {recipeId: 'source-1'}}

    it('is loaded', () => {
        const {component} = layerSource(valid)

        component.componentDidMount()

        expect(loadRecipe$).toHaveBeenCalledWith('source-1')
    })

    it('records the loaded recipe\'s name on the layer', () => {
        const {component, dispatched} = layerSource(valid)

        component.componentDidMount()

        expect(dispatched).toEqual([{
            path: ['layers.additionalImageLayerSources', {id: 'source-1'}, 'sourceConfig.description'],
            value: 'Band math'
        }])
    })

    // The styles belong to the recipe being shown, and are read from it wherever they are offered. Copying
    // them here left the consumer holding a snapshot that an edit or a deletion there could never correct.
    it('copies none of that recipe\'s styles into this one', () => {
        loadRecipe$.mockReturnValueOnce(of({
            id: 'source-1',
            title: 'Band math',
            layers: {userDefinedVisualizations: {'this-recipe': [{id: 'v-ratio', bands: ['ratio']}]}}
        }))
        const {component, dispatched} = layerSource(valid)

        component.componentDidMount()

        expect(dispatched.some(({path}) => path.includes('layers.userDefinedVisualizations'))).toBe(false)
    })

})

// Derived from a saved Masking recipe whose layer source 'optical_2' names a recipe that no longer loads. The
// notification showed the transport error serialized as JSON.
describe('a layer entry whose recipe cannot be loaded', () => {
    const optical2 = {
        id: 'f4c19176-aade-4f1f-bc4f-68d95ce2eaa9',
        type: 'Recipe',
        sourceConfig: {recipeId: 'f4c19176-aade-4f1f-bc4f-68d95ce2eaa9', description: 'optical_2'}
    }

    it('reports a recipe that is gone by the source naming it', () => {
        const failure = ajaxError(404)
        loadRecipe$.mockReturnValueOnce(throwError(() => failure))

        mountLayerSource(optical2)

        expect(notification().message).toEqual(msg('imageLayerSources.Recipe.notFound', {description: 'optical_2'}))
        expect(notification().message).toContain('optical_2')
        expectNothingOf(failure)
    })

    it('reports any other failure by the source naming it, and the error as the user is told errors', () => {
        const failure = ajaxError(500)
        loadRecipe$.mockReturnValueOnce(throwError(() => failure))

        mountLayerSource(optical2)

        expect(notification().message).toContain('optical_2')
        expect(notification().error).toEqual(msg('notifications.error.generic'))
        expectNothingOf(failure)
    })

    it('logs what it does not show', () => {
        const failure = ajaxError(404)
        loadRecipe$.mockReturnValueOnce(throwError(() => failure))

        mountLayerSource(optical2)

        expect(logged.mock.calls.flat()).toContain(failure)
    })

    it('keeps the source as it was saved', () => {
        loadRecipe$.mockReturnValueOnce(throwError(() => ajaxError(404)))

        const {dispatched} = mountLayerSource(optical2)

        expect(dispatched).toEqual([])
    })
})

// As an rxjs AjaxError carries it: the request, the status and the response body.
const ajaxError = status => ({
    name: 'AjaxError',
    message: `ajax error ${status}`,
    status,
    request: {method: 'GET', url: '/api/processing-recipes/f4c19176-aade-4f1f-bc4f-68d95ce2eaa9'},
    response: {error: 'private backend detail', path: '/api/processing-recipes/f4c19176-aade-4f1f-bc4f-68d95ce2eaa9'}
})

const notification = () => {
    expect(error).toHaveBeenCalledTimes(1)
    return error.mock.calls[0][0]
}

// Shown as text only, and none of it from the request or the response.
const expectNothingOf = failure => {
    const shown = Object.values(notification())
    expect(shown.every(value => typeof value === 'string')).toBe(true)
    const text = shown.join(' ')
    for (const detail of [failure.message, failure.request.url, failure.response.error, '{"']) {
        expect(text).not.toContain(detail)
    }
}
