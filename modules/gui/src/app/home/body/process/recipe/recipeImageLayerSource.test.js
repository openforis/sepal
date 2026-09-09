import {of} from 'rxjs'
import {beforeEach, describe, expect, it, vi} from 'vitest'

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
vi.mock('~/translate', () => ({msg: key => key}))

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

const loadRecipe$ = vi.fn(() => of({id: 'source-1', title: 'Band math'}))

const layerSource = source => {
    const dispatched = []
    const streams = []
    const component = new RecipeImageLayerSource({
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
    })
    return {component, dispatched, streams}
}

beforeEach(() => {
    loadRecipe$.mockClear()
    error.mockClear()
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

    it('does not report a load failure as nothing at all', () => {
        loadRecipe$.mockReturnValueOnce({
            subscribe: ({error: onError}) => onError(new Error('gone')) || {unsubscribe: () => {}}
        })
        const {component} = layerSource(valid)

        component.componentDidMount()

        expect(error).toHaveBeenCalled()
    })
})
