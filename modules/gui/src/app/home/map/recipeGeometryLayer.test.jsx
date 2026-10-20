import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Observable, Subject} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

// The outline a recipe without an area of interest of its own shows, through the real AOI layer, recipe geometry layer,
// Earth Engine table layer and its failure notification, on a map that adds and removes layers as SepalMap does. Earth
// Engine answers the geometry request as its route does: a recipe whose geometry is its first input image's, listing
// none, is an internal error. A trained Classification's last input removed takes its outline away, requesting nothing
// and notifying nothing; an input added back shows it again.

const requests = vi.hoisted(() => [])
vi.mock('~/apiRegistry', () => ({
    default: {
        gee: {
            recipeGeometry$: ({recipe}) => new Observable(subscriber => {
                const request = {recipe, cancelled: false}
                requests.push(request)
                if (!recipe.model.inputImagery?.images?.length) {
                    subscriber.error(Object.assign(new Error('Internal error'), {status: 500}))
                }
                return () => request.cancelled = true
            })
        }
    }
}))
const notifications = vi.hoisted(() => ({errors: []}))
vi.mock('~/widget/notifications', () => ({Notifications: {error: notification => notifications.errors.push(notification)}}))
vi.mock('~/translate', () => ({msg: key => key}))

const {TabContext} = await import('~/widget/tabs/tabContext')
const {AoiLayer} = await import('./aoiLayer')

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root, container

beforeEach(() => {
    requests.length = 0
    notifications.errors = []
})

afterEach(() => {
    act(() => root?.unmount())
    root = null
    container?.remove()
})

describe('the outline of a trained Classification', () => {
    it('is withdrawn when its last input is removed, its request cancelled, requesting nothing more and notifying nothing', () => {
        const map = mapOf()
        const show = shown(map)
        show(classification([DEM_INPUT]))
        expect(requests).toHaveLength(1)

        show(classification([]))

        expect(map.getLayer(ID)).toBeUndefined()
        expect(requests).toHaveLength(1)
        expect(requests[0].cancelled).toBe(true)
        expect(notifications.errors).toEqual([])
    })

    it('is requested and shown again once an input is added back', () => {
        const map = mapOf()
        const show = shown(map)
        show(classification([DEM_INPUT]))
        show(classification([]))

        show(classification([DEM_INPUT]))

        expect(requests).toHaveLength(2)
        expect(requests[1].cancelled).toBe(false)
        expect(map.getLayer(ID)).toBeDefined()
    })

    it('opened without input imagery requests nothing and notifies nothing', () => {
        const map = mapOf()

        shown(map)(classification([]))

        expect(requests).toEqual([])
        expect(map.getLayer(ID)).toBeUndefined()
        expect(notifications.errors).toEqual([])
    })
})

// Its geometry is its input's, whether or not it can run.
describe('the outline of a Classification without training data', () => {
    it('is requested from its input', () => {
        const map = mapOf()

        shown(map)(classification([DEM_INPUT], []))

        expect(requests).toHaveLength(1)
        expect(map.getLayer(ID)).toBeDefined()
    })
})

describe('the outline of a Remapping whose constraint reads an input since removed', () => {
    it('is requested from its input', () => {
        const map = mapOf()

        shown(map)(remapping([DEM_INPUT], {image: 'image-gone', band: 'elevation', operator: '>', value: 100}))

        expect(requests).toHaveLength(1)
        expect(map.getLayer(ID)).toBeDefined()
    })
})

const ID = 'aoi'
const DEM_INPUT = {imageId: 'image-1', type: 'ASSET', id: 'users/x/dem', bandSetSpecs: [{id: 'b', type: 'IMAGE_BANDS', included: ['elevation']}]}
const POINTS = [{x: 1, y: 1, class: 1}, {x: 2, y: 2, class: 2}]

const classification = (images, referenceData = POINTS) => ({
    id: 'classification-1',
    type: 'CLASSIFICATION',
    ui: {initialized: true},
    model: {
        inputImagery: {images},
        legend: {entries: [{value: 1}, {value: 2}]},
        trainingData: {dataSets: [{dataSetId: 'collected', type: 'COLLECTED', referenceData}]},
        classifier: {type: 'RANDOM_FOREST'}
    }
})

const remapping = (images, constraint) => ({
    id: 'remapping-1',
    type: 'REMAPPING',
    ui: {initialized: true},
    model: {
        inputImagery: {images},
        legend: {entries: [{id: 'l-1', value: 1, label: 'High', booleanOperator: 'and', constraints: [constraint]}]}
    }
})

// A map adding and removing layers as SepalMap does: a layer equal to the one shown is kept, another replaces it - the
// one replaced removed first - and a removed layer is cancelled.
const mapOf = () => {
    const layerById = {}
    const map = {
        renderingEnabled$: new Subject(),
        renderingStatus$: new Subject(),
        getLayer: id => layerById[id],
        setLayer: ({id, layer}) => {
            const existing = layerById[id]
            if (layer === existing || existing?.equals(layer)) {
                return false
            }
            map.removeLayer(id)
            if (layer) {
                layerById[id] = layer
                layer.add()
            }
            return true
        },
        removeLayer: id => {
            const layer = layerById[id]
            if (layer) {
                layer.remove()
                delete layerById[id]
            }
        }
    }
    return map
}

// The recipe's AOI layer shown on the map, rendered again with each recipe given.
const shown = map => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    return recipe => act(() => root.render(
        <TabContext id='tab' busyIn$={new Subject()} busyOut$={new Subject()}>
            <AoiLayer id={ID} map={map} recipe={recipe} layerIndex={1}/>
        </TabContext>
    ))
}
