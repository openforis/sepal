import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {afterEach, describe, expect, it, vi} from 'vitest'

// The reference data layer of a map pane, on what a click during manual sampling does. The component is the real
// one, unwrapped; the marker layer and the map stand in for Google Maps by their one rule that matters here: a click
// on a marker reaches the marker only while markers are clickable, and otherwise reaches the map beneath it.

vi.mock('~/compose', () => ({compose: Component => Component, composeHoC: () => Component => Component}))
vi.mock('~/translate', () => ({msg: key => key}))
vi.mock('./classificationRecipe', () => ({RecipeActions: () => ({setCountPerClass: () => {}})}))

const layers = vi.hoisted(() => [])
vi.mock('~/app/home/map/markerClustererLayer', () => ({
    MarkerClustererLayer: class {
        constructor({id}) {
            this.id = id
            this.markers = []
            this.clickable = false
            layers.push(this)
        }

        setMarkers(markers) {
            this.markers = markers
        }

        setClickable(flag) {
            this.clickable = flag
        }
    }
}))

const {ReferenceDataLayer} = await import('./referenceDataLayer')

globalThis.IS_REACT_ACT_ENVIRONMENT = true

describe('a pane mounted while sampling', () => {
    it('selects an existing sample when its marker is clicked, adding none', async () => {
        const pane = await mount({collecting: true})

        pane.clickSample(SAMPLE)

        expect(pane.selected).toEqual([expect.objectContaining({x: SAMPLE.x, y: SAMPLE.y})])
        expect(pane.added).toEqual([])
    })

    it('adds a sample where the map itself is clicked', async () => {
        const pane = await mount({collecting: true})

        pane.clickMap({lat: 2, lng: 3})

        expect(pane.added).toEqual([{x: 3, y: 2}])
    })
})

describe('a pane mounted while not sampling', () => {
    it('neither selects nor adds a sample when a marker is clicked', async () => {
        const pane = await mount({collecting: false})

        pane.clickSample(SAMPLE)

        expect(pane.selected).toEqual([])
        expect(pane.added).toEqual([])
    })

    it('selects an existing sample once sampling starts', async () => {
        const pane = await mount({collecting: false})

        await pane.setCollecting(true)
        pane.clickSample(SAMPLE)

        expect(pane.selected).toHaveLength(1)
        expect(pane.added).toEqual([])
    })
})

describe('sampling turned off and on again', () => {
    it('listens to the map once while sampling, and not at all otherwise', async () => {
        const pane = await mount({collecting: true})

        await pane.setCollecting(false)

        expect(pane.mapListeners()).toBe(0)

        await pane.setCollecting(true)
        await pane.setCollecting(true)

        expect(pane.mapListeners()).toBe(1)
    })

    it('stops listening to the map when the pane goes', async () => {
        const pane = await mount({collecting: true})

        await pane.unmount()

        expect(pane.mapListeners()).toBe(0)
    })
})

const SAMPLE = {x: 10, y: 20, 'class': 1}

let root

const mount = async ({collecting}) => {
    const listeners = new Set()
    const selected = []
    const added = []
    const map = {
        setLayer: () => {},
        removeLayer: () => {},
        addClickListener: listener => {
            const registration = {listener, remove: () => listeners.delete(registration)}
            listeners.add(registration)
            return registration
        }
    }
    const dataCollectionManager = {
        addListener: () => {},
        select: marker => selected.push(marker),
        add: point => added.push(point)
    }
    const props = {
        recipeId: 'classification-1',
        map,
        dataCollectionManager,
        legend: {entries: [{value: 1, color: '#000000'}]},
        trainingDataSets: [{dataSetId: 'points', type: 'SAMPLE_CLASSIFICATION', referenceData: [SAMPLE]}],
        countPerClass: {}
    }
    const render = collecting => act(async () => root.render(<ReferenceDataLayer {...props} collecting={collecting}/>))
    root = createRoot(document.createElement('div'))
    await render(collecting)
    const layer = layers[layers.length - 1]
    const clickMap = latLng => [...listeners].forEach(({listener}) => listener(latLng))
    return {
        selected,
        added,
        clickMap,
        clickSample: ({x, y}) => {
            const marker = layer.markers.find(marker => marker.x === x && marker.y === y)
            layer.clickable ? marker.onClick(marker) : clickMap({lat: y, lng: x})
        },
        setCollecting: render,
        mapListeners: () => listeners.size,
        unmount: () => act(async () => root.unmount())
    }
}

afterEach(() => {
    act(() => root?.unmount())
    root = null
    layers.length = 0
})
