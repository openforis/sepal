import {beforeEach, describe, expect, it, vi} from 'vitest'

// The visualization editor over a CCDC layer showing its count. It works from the context its selector captured -
// the recipe, the band choices and the arguments naming the product - and every request it makes about the image
// carries that product, so its band choices, histogram and distinct values concern what the layer shows.
//
// `compose` is mocked to the identity so the exported component is the class itself; only the Earth Engine API is
// replaced. The requests' reaching the image factory is proven through the handlers in the gee module.

const requests = vi.hoisted(() => ({bands: [], histogram: [], distinctBandValues: []}))

vi.mock('~/compose', () => ({
    compose: Component => Component,
    composeHoC: () => Component => Component
}))

vi.mock('~/translate', () => ({msg: key => (Array.isArray(key) ? key.join('.') : key)}))

// Loading the user module here closes an import cycle through its forms; the editor reads nothing from it.
vi.mock('~/user', () => ({}))

vi.mock('~/apiRegistry', async () => {
    const {EMPTY} = await import('rxjs')
    const recording = name => args => (requests[name].push(args), EMPTY)
    return {
        default: {
            gee: {
                bands$: recording('bands'),
                histogram$: recording('histogram'),
                distinctBandValues$: recording('distinctBandValues')
            }
        }
    }
})

const {VisParamsPanel} = await import('./visParamsPanel')

beforeEach(() => {
    requests.bands = []
    requests.histogram = []
    requests.distinctBandValues = []
})

describe('an editor opened on a layer showing a product', () => {
    it('offers the bands the layer’s answer holds, asking for none itself', () => {
        const {editor} = opened()

        editor.componentDidMount()

        expect(editor.renderBandForm(0, 'band').props.bands).toEqual(['count'])
        expect(requests.bands).toEqual([])
    })

    it('asks for the histogram of the product the layer shows', () => {
        const {editor} = opened()

        editor.initHistogram('count', {stretch: true})

        expect(requests.histogram).toEqual([{visualizationType: 'COUNT', recipe: CCDC, aoi: undefined, band: 'count', mapBounds: BOUNDS}])
    })

    it('asks for the distinct values of the product the layer shows', () => {
        const {editor} = opened()

        editor.loadDistinctBandValues()

        expect(requests.distinctBandValues).toEqual([{visualizationType: 'COUNT', recipe: CCDC, band: 'count', aoi: undefined, mapBounds: BOUNDS}])
    })
})

describe('an editor whose layer changes while it is open', () => {
    it('stays open while its area shows the same layer and product, whatever the style', () => {
        const {editor, deactivated} = opened()

        editor.props = {...editor.props, areaImageLayer: shownIn({visualizationType: 'COUNT', visParams: {bands: ['count'], palette: ['#000']}})}
        editor.componentDidUpdate(editor.props)

        expect(deactivated()).toBe(0)
    })

    it('closes, once, when its area shows another product', () => {
        const {editor, deactivated} = opened()

        editor.props = {...editor.props, areaImageLayer: shownIn({visualizationType: 'SEGMENTS'})}
        editor.componentDidUpdate(editor.props)
        editor.componentDidUpdate(editor.props)

        expect(deactivated()).toBe(1)
    })

    it('closes when its area shows another layer', () => {
        const {editor, deactivated} = opened()

        editor.props = {...editor.props, areaImageLayer: {...shownIn({visualizationType: 'COUNT'}), sourceId: 'other-source'}}
        editor.componentDidUpdate(editor.props)

        expect(deactivated()).toBe(1)
    })
})

const CCDC = {id: 'ccdc-1', type: 'CCDC', model: {}}
const BOUNDS = [[0, 0], [1, 1]]

const shownIn = layerConfig => ({sourceId: 'this-recipe', layerConfig})

// What the selector captured on opening, and the rest of what the editor's wrappers would give it.
const opened = () => {
    let deactivations = 0
    const inputs = new Proxy({}, {get: (fields, name) => fields[name] || (fields[name] = {value: name === 'name1' ? 'count' : undefined, set: () => {}})})
    const editor = new VisParamsPanel({
        activatable: {
            recipe: CCDC,
            imageLayerSourceId: 'this-recipe',
            bands: ['count'],
            productArgs: {visualizationType: 'COUNT'},
            deactivate: () => deactivations++
        },
        areaImageLayer: shownIn({visualizationType: 'COUNT', visParams: {bands: ['count']}}),
        inputs,
        map: {getBounds: () => BOUNDS},
        stream: (name, observable$) => observable$ ? observable$.subscribe() : {active: false},
        visParamsSets: []
    })
    return {editor, deactivated: () => deactivations}
}

