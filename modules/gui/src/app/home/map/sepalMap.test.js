import {TerraDraw, TerraDrawPolygonMode} from 'terra-draw'
import {vi} from 'vitest'

import {toPolygonPath} from './drawing'
import {GoogleLabelsLayer} from './layer/googleLabelsLayer'
import {TileLayer} from './layer/tileLayer'
import {SepalMap} from './sepalMap'

class TestAdapter {
    cursor = 'unset'
    doubleClickToZoom = true

    constructor(mapContainer) {
        this.mapContainer = mapContainer
    }

    getCoordinatePrecision() {
        return 9
    }

    project(lng, lat) {
        return {x: lng, y: lat}
    }

    unproject(x, y) {
        return {lng: x, lat: y}
    }

    setDoubleClickToZoom(enabled) {
        this.doubleClickToZoom = enabled
    }

    setCursor(cursor) {
        this.cursor = cursor
    }

    register(callbacks) {
        this.callbacks = callbacks
        if (this.mapContainer) {
            this.keyUpListener = event => callbacks.onKeyUp({
                key: event.key,
                heldKeys: [],
                preventDefault: () => event.preventDefault()
            })
            this.mapContainer.addEventListener('keyup', this.keyUpListener)
        }
    }

    unregister() {
        this.clear()
        if (this.keyUpListener) {
            this.mapContainer.removeEventListener('keyup', this.keyUpListener)
            this.keyUpListener = null
        }
        this.callbacks = null
    }

    render() {}

    clear() {
        this.callbacks?.onClear()
    }

    setDraggability() {}

    getLngLatFromEvent() {
        return null
    }
}

const createDrawing = mapContainer => {
    const adapter = new TestAdapter(mapContainer)
    const drawing = new TerraDraw({
        adapter,
        modes: [new TerraDrawPolygonMode({editable: true, showCoordinatePoints: true})]
    })
    drawing.start()
    drawing.setMode('polygon')
    return {adapter, drawing}
}

const createSepalMap = (drawing, properties = {}) => {
    const mapContainer = document.createElement('div')
    const map = Object.assign(Object.create(SepalMap.prototype), {
        drawing,
        drawingListener: null,
        drawingChangeListener: null,
        drawingKeydownListener: null,
        drawingChangesSuppressed: false,
        drawingFeatureId: null,
        polygonPreview: null,
        ...properties
    })
    map.googleMap = map.googleMap || {}
    map.googleMap.getDiv = map.googleMap.getDiv || (() => mapContainer)
    return map
}

class TestPolygon {
    constructor(options) {
        this.options = options
    }

    setMap(map) {
        this.map = map
    }

    setPath(path) {
        this.path = path
    }
}

const pointerEvent = (lng, lat) => ({
    lng,
    lat,
    containerX: lng,
    containerY: lat,
    button: 'left',
    heldKeys: [],
    isContextMenu: false
})

const createKeyboardHarness = ({initialPath = null, onChange = () => {}, onFinish = () => {}} = {}) => {
    const mapContainer = document.createElement('div')
    const eventTarget = document.createElement('div')
    mapContainer.appendChild(eventTarget)
    document.body.appendChild(mapContainer)

    const {adapter, drawing} = createDrawing(mapContainer)
    const map = createSepalMap(drawing, {
        googleMap: {getDiv: () => mapContainer}
    })
    map.enablePolygonDrawing(onFinish, () => initialPath, onChange)

    return {
        adapter,
        drawing,
        eventTarget,
        map,
        dispose() {
            map.disablePolygonDrawing()
            mapContainer.remove()
        }
    }
}

const startPolygonDraft = adapter => {
    adapter.callbacks.onClick(pointerEvent(10, 20))
    adapter.callbacks.onMouseMove(pointerEvent(30, 20))
}

const completePolygon = (adapter, eventTarget) => {
    adapter.callbacks.onClick(pointerEvent(10, 20))
    adapter.callbacks.onMouseMove(pointerEvent(30, 20))
    adapter.callbacks.onClick(pointerEvent(30, 20))
    adapter.callbacks.onMouseMove(pointerEvent(30, 40))
    adapter.callbacks.onClick(pointerEvent(30, 40))
    eventTarget.dispatchEvent(new KeyboardEvent('keyup', {key: 'Enter', bubbles: true}))
}

const dispatchKey = (eventTarget, type, key) => {
    const event = new KeyboardEvent(type, {key, bubbles: true, cancelable: true})
    eventTarget.dispatchEvent(event)
    return event
}

const observeDocumentKeydown = listener => {
    document.addEventListener('keydown', listener)
    return () => document.removeEventListener('keydown', listener)
}

describe('polygon drawing', () => {
    it('reports provisional polygon changes before drawing finishes', () => {
        const {adapter, drawing} = createDrawing()
        const map = createSepalMap(drawing)
        const changes = []

        map.enablePolygonDrawing(() => {}, () => null, path => changes.push(path))
        adapter.callbacks.onClick(pointerEvent(10, 20))
        adapter.callbacks.onMouseMove(pointerEvent(30, 20))

        expect(changes.at(-1)).toEqual([[10, 20], [30, 20], [30, 20]])
    })

    it('reports when a provisional polygon is cancelled', () => {
        const {adapter, drawing} = createDrawing()
        const map = createSepalMap(drawing)
        const changes = []

        map.enablePolygonDrawing(() => {}, () => null, path => changes.push(path))
        adapter.callbacks.onClick(pointerEvent(10, 20))
        adapter.callbacks.onMouseMove(pointerEvent(30, 20))
        adapter.callbacks.onKeyUp({key: 'Escape', heldKeys: [], preventDefault() {}})

        expect(changes.at(-1)).toBeNull()
    })

    it('reports cancellation instead of the older polygon when replacing a polygon', () => {
        const initialPath = [[-100, -50], [-50, -50], [-50, 0]]
        const {adapter, drawing} = createDrawing()
        const map = createSepalMap(drawing)
        const changes = []

        map.enablePolygonDrawing(() => {}, () => initialPath, path => changes.push(path))
        adapter.callbacks.onClick(pointerEvent(50, 20))
        adapter.callbacks.onMouseMove(pointerEvent(80, 20))
        adapter.callbacks.onKeyUp({key: 'Escape', heldKeys: [], preventDefault() {}})

        expect(changes.at(-1)).toBeNull()
    })

    it('does not report polygon changes loaded through the API', () => {
        const {drawing} = createDrawing()
        const map = createSepalMap(drawing)
        const changes = []

        map.enablePolygonDrawing(() => {}, () => null, path => changes.push(path))
        map.setPolygonDrawing([[10, 20], [30, 20], [30, 40]])

        expect(changes).toEqual([])
    })

    it('replaces the editable polygon with a provisional preview until the path is committed', () => {
        const initialPath = [[10, 20], [30, 20], [30, 40]]
        const previewPath = [[11, 21], [31, 21], [31, 41]]
        const finalPath = [[12, 22], [32, 22], [32, 42]]
        const {drawing} = createDrawing()
        const googleMap = {}
        const map = createSepalMap(drawing, {
            google: {maps: {Polygon: TestPolygon}},
            googleMap
        })
        map.setPolygonDrawing(initialPath)

        map.setPolygonPreview(previewPath)

        expect(drawing.getSnapshot().filter(({geometry}) => geometry.type === 'Polygon')).toEqual([])
        expect(map.polygonPreview.path).toEqual([
            {lng: 11, lat: 21},
            {lng: 31, lat: 21},
            {lng: 31, lat: 41}
        ])
        expect(map.polygonPreview.map).toBe(googleMap)

        map.setPolygonDrawing(finalPath)

        expect(map.polygonPreview).toBeNull()
        expect(drawing.getSnapshot()
            .filter(({geometry}) => geometry.type === 'Polygon')
            .map(toPolygonPath)
        ).toEqual([finalPath])
    })

    it('removes a synchronized preview when the pane becomes the drawing source', () => {
        const initialPath = [[-100, -50], [-50, -50], [-50, 0]]
        const previewPath = [[-90, -40], [-40, -40], [-40, 10]]
        const {adapter, drawing} = createDrawing()
        const map = createSepalMap(drawing, {
            google: {maps: {Polygon: TestPolygon}},
            googleMap: {}
        })
        map.enablePolygonDrawing(() => {}, () => initialPath, path => {
            if (!path) {
                map.setPolygonDrawing(initialPath)
            }
        })
        map.setPolygonPreview(previewPath)

        adapter.callbacks.onClick(pointerEvent(50, 20))
        adapter.callbacks.onMouseMove(pointerEvent(80, 20))

        expect(map.polygonPreview).toBeNull()

        adapter.callbacks.onKeyUp({key: 'Escape', heldKeys: [], preventDefault() {}})

        expect(drawing.getSnapshot()
            .filter(({geometry}) => geometry.type === 'Polygon')
            .map(toPolygonPath)
        ).toEqual([initialPath])
    })

    it('replaces its editable polygon when another pane changes it', () => {
        const initialPath = [[10, 20], [30, 20], [30, 40]]
        const updatedPath = [[11, 21], [31, 21], [31, 41]]
        const {drawing} = createDrawing()
        const map = createSepalMap(drawing)

        map.setPolygonDrawing?.(initialPath)
        map.setPolygonDrawing?.(updatedPath)

        const paths = drawing.getSnapshot()
            .filter(({geometry}) => geometry.type === 'Polygon')
            .map(toPolygonPath)
        expect(paths).toEqual([updatedPath])
    })

    it('restores map interactions when drawing is disabled', () => {
        const {adapter, drawing} = createDrawing()
        const map = createSepalMap(drawing)
        expect(adapter.cursor).toBe('crosshair')
        expect(adapter.doubleClickToZoom).toBe(false)

        map.disableDrawingMode()

        expect(drawing.enabled).toBe(false)
        expect(adapter.cursor).toBe('unset')
        expect(adapter.doubleClickToZoom).toBe(true)
    })
})

describe('polygon Escape propagation', () => {
    it('lets Escape reach the document when no polygon draft exists', () => {
        const harness = createKeyboardHarness()
        const documentKeys = []
        const stopObserving = observeDocumentKeydown(event => documentKeys.push(event.key))
        try {
            const event = dispatchKey(harness.eventTarget, 'keydown', 'Escape')

            expect(documentKeys).toEqual(['Escape'])
            expect(event.defaultPrevented).toBe(false)
        } finally {
            stopObserving()
            harness.dispose()
        }
    })

    it('keeps draft Escape keydown local while TerraDraw cancels on keyup', () => {
        const order = []
        const harness = createKeyboardHarness({
            onChange: path => !path && order.push('terra-keyup-cancelled')
        })
        const stopObserving = observeDocumentKeydown(() => order.push('document-keydown'))
        try {
            startPolygonDraft(harness.adapter)

            dispatchKey(harness.eventTarget, 'keydown', 'Escape')
            dispatchKey(harness.eventTarget, 'keyup', 'Escape')

            expect(order).toEqual(['terra-keyup-cancelled'])
        } finally {
            stopObserving()
            harness.dispose()
        }
    })

    it('does not prevent the intercepted draft Escape keydown', () => {
        const harness = createKeyboardHarness()
        try {
            startPolygonDraft(harness.adapter)

            const event = dispatchKey(harness.eventTarget, 'keydown', 'Escape')

            expect(event.defaultPrevented).toBe(false)
        } finally {
            harness.dispose()
        }
    })

    it('lets a second Escape reach the document after TerraDraw cancellation', () => {
        const harness = createKeyboardHarness()
        const documentKeys = []
        const stopObserving = observeDocumentKeydown(event => documentKeys.push(event.key))
        try {
            startPolygonDraft(harness.adapter)
            dispatchKey(harness.eventTarget, 'keydown', 'Escape')
            dispatchKey(harness.eventTarget, 'keyup', 'Escape')
            documentKeys.length = 0

            dispatchKey(harness.eventTarget, 'keydown', 'Escape')

            expect(documentKeys).toEqual(['Escape'])
        } finally {
            stopObserving()
            harness.dispose()
        }
    })

    it('does not consume Escape for an API-loaded committed polygon', () => {
        const initialPath = [[10, 20], [30, 20], [30, 40]]
        const harness = createKeyboardHarness({initialPath})
        const documentKeys = []
        const stopObserving = observeDocumentKeydown(event => documentKeys.push(event.key))
        try {
            dispatchKey(harness.eventTarget, 'keydown', 'Escape')

            expect(documentKeys).toEqual(['Escape'])
        } finally {
            stopObserving()
            harness.dispose()
        }
    })

    it('keeps Escape local while replacing a polygon and restores the committed polygon on keyup', () => {
        const initialPath = [[-100, -50], [-50, -50], [-50, 0]]
        const harness = createKeyboardHarness({initialPath})
        const documentKeys = []
        const stopObserving = observeDocumentKeydown(event => documentKeys.push(event.key))
        try {
            startPolygonDraft(harness.adapter)
            dispatchKey(harness.eventTarget, 'keydown', 'Escape')
            dispatchKey(harness.eventTarget, 'keyup', 'Escape')

            const polygonPaths = harness.drawing.getSnapshot()
                .filter(({geometry}) => geometry.type === 'Polygon')
                .map(toPolygonPath)
            expect({documentKeys, polygonPaths}).toEqual({
                documentKeys: [],
                polygonPaths: [initialPath]
            })
        } finally {
            stopObserving()
            harness.dispose()
        }
    })

    it('lets Escape reach the document after a polygon is completed', () => {
        const completedPaths = []
        const harness = createKeyboardHarness({
            onFinish: path => completedPaths.push(path)
        })
        const documentKeys = []
        const stopObserving = observeDocumentKeydown(event => documentKeys.push(event.key))
        try {
            completePolygon(harness.adapter, harness.eventTarget)

            expect(completedPaths).toEqual([[[10, 20], [30, 20], [30, 40]]])

            dispatchKey(harness.eventTarget, 'keydown', 'Escape')

            expect(documentKeys).toEqual(['Escape'])
        } finally {
            stopObserving()
            harness.dispose()
        }
    })

    it('always lets a non-Escape key bubble while a draft exists', () => {
        const harness = createKeyboardHarness()
        const documentKeys = []
        const stopObserving = observeDocumentKeydown(event => documentKeys.push(event.key))
        try {
            startPolygonDraft(harness.adapter)

            dispatchKey(harness.eventTarget, 'keydown', 'a')

            expect(documentKeys).toEqual(['a'])
        } finally {
            stopObserving()
            harness.dispose()
        }
    })

    it('removes interception when polygon drawing is disabled', () => {
        const harness = createKeyboardHarness()
        const documentKeys = []
        const stopObserving = observeDocumentKeydown(event => documentKeys.push(event.key))
        try {
            startPolygonDraft(harness.adapter)
            harness.map.disablePolygonDrawing()

            dispatchKey(harness.eventTarget, 'keydown', 'Escape')

            expect(documentKeys).toEqual(['Escape'])
        } finally {
            stopObserving()
            harness.dispose()
        }
    })

    it('registers one interception after repeated enable and disable cycles', () => {
        const harness = createKeyboardHarness()
        const documentKeys = []
        const stopObserving = observeDocumentKeydown(event => documentKeys.push(event.key))
        try {
            harness.map.disablePolygonDrawing()
            harness.map.enablePolygonDrawing(() => {}, () => null, () => {})
            harness.map.disablePolygonDrawing()
            harness.map.enablePolygonDrawing(() => {}, () => null, () => {})
            startPolygonDraft(harness.adapter)
            const event = new KeyboardEvent('keydown', {key: 'Escape', bubbles: true, cancelable: true})
            const stopPropagation = vi.spyOn(event, 'stopPropagation')

            harness.eventTarget.dispatchEvent(event)

            expect({documentKeys, stopPropagationCalls: stopPropagation.mock.calls.length}).toEqual({
                documentKeys: [],
                stopPropagationCalls: 1
            })
        } finally {
            stopObserving()
            harness.dispose()
        }
    })
})

// Overlays are compared by content, so every fixture needs its own identity - otherwise an assertion on the
// array is blind to the order it is meant to pin.
const overlay = (name, rest) => ({name, ...rest})

const overlayMapTypes = overlays => ({
    getArray: () => overlays,
    getAt: index => overlays[index],
    insertAt: (index, overlay) => overlays.splice(index, 0, overlay),
    removeAt: index => overlays.splice(index, 1)[0],
    setAt: (index, overlay) => { overlays[index] = overlay }
})

const mapOver = overlays => {
    const googleMap = {overlayMapTypes: overlayMapTypes(overlays)}
    return {getGoogle: () => ({googleMap})}
}

const tileLayer = (map, layerIndex, overlay) =>
    Object.assign(new TileLayer(), {map, layerIndex, overlay, equals: () => true})

describe('SepalMap.setLayer', () => {
    it('moves an equal mounted layer instead of recreating it', () => {
        const existingLayer = {
            equals: () => true,
            remove: vi.fn(),
            setLayerIndex: vi.fn()
        }
        const map = Object.create(SepalMap.prototype)
        map.layerById = {overlay: existingLayer}

        const changed = map.setLayer({id: 'overlay', layer: {layerIndex: 3}})

        expect(changed).toBe(false)
        expect(existingLayer.setLayerIndex).toHaveBeenCalledWith(3)
        expect(existingLayer.remove).not.toHaveBeenCalled()
    })
})

describe('overlayMapTypes placement', () => {
    it('swaps a moved tile overlay with the one it displaces', () => {
        const image = overlay('image')
        const overlayA = overlay('a')
        const overlayB = overlay('b')
        const overlays = [image, overlayA, overlayB]
        const map = mapOver(overlays)
        const layerA = tileLayer(map, 1, overlayA)
        const layerB = tileLayer(map, 2, overlayB)

        layerA.setLayerIndex(2)

        expect(overlays).toEqual([image, overlayB, overlayA])

        layerB.setLayerIndex(1)

        expect(overlays).toEqual([image, overlayB, overlayA])
    })

    it('moves a mounted labels overlay without dropping the displaced layer', () => {
        const image = overlay('image')
        const labels = overlay('labels')
        const asset = overlay('asset')
        const overlays = [image, labels, asset]
        const layer = Object.assign(new GoogleLabelsLayer({map: mapOver(overlays), layerIndex: 1}), {overlay: labels})

        layer.setLayerIndex(2)

        expect(overlays).toEqual([image, asset, labels])
    })

    // An overlay mounting into an occupied slot displaces its neighbour before that neighbour's own update
    // arrives. Claiming the slot anyway is what lets the displaced overlay re-enter later in the same
    // sequence; refusing to move while absent would strand it outside the stack.
    it('lets an overlay displaced mid-sequence re-enter at its new index', () => {
        const image = overlay('image')
        const aoi = overlay('aoi')
        const overlayA = overlay('a')
        const overlayB = overlay('b')
        const overlays = [image, overlayA, overlayB]
        const map = mapOver(overlays)
        const layerA = tileLayer(map, 1, overlayA)
        const layerB = tileLayer(map, 2, overlayB)
        const aoiLayer = Object.assign(new TileLayer(), {map, layerIndex: 1})

        aoiLayer.mountOverlay(aoi)

        expect(overlays).toEqual([image, aoi, overlayB])

        layerA.setLayerIndex(2)

        expect(overlays).toEqual([image, aoi, overlayA])

        layerB.setLayerIndex(3)

        expect(overlays).toEqual([image, aoi, overlayA, overlayB])
    })

    it('removes its own displaced overlay without removing the new slot owner', () => {
        const image = overlay('image')
        const currentOverlay = overlay('current')
        const movedOverlay = overlay('moved', {close: vi.fn()})
        const overlays = [image, movedOverlay, currentOverlay]
        const layer = tileLayer(mapOver(overlays), 2, movedOverlay)

        layer.removeFromMap()

        expect(overlays).toEqual([image, null, currentOverlay])
        expect(movedOverlay.close).toHaveBeenCalledOnce()
    })

    it('leaves closing to the tile layer and never closes a labels overlay', () => {
        const image = overlay('image')
        const labels = overlay('labels', {close: vi.fn()})
        const overlays = [image, labels]
        const layer = Object.assign(new GoogleLabelsLayer({map: mapOver(overlays), layerIndex: 1}), {overlay: labels})

        layer.removeFromMap()

        expect(overlays).toEqual([image, null])
        expect(labels.close).not.toHaveBeenCalled()
    })
})
