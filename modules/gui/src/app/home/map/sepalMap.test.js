import {TerraDraw, TerraDrawPolygonMode} from 'terra-draw'

import {toPolygonPath} from './drawing'
import {SepalMap} from './sepalMap'

class TestAdapter {
    cursor = 'unset'
    doubleClickToZoom = true

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
    }

    unregister() {
        this.clear()
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

const createDrawing = () => {
    const adapter = new TestAdapter()
    const drawing = new TerraDraw({
        adapter,
        modes: [new TerraDrawPolygonMode({editable: true, showCoordinatePoints: true})]
    })
    drawing.start()
    drawing.setMode('polygon')
    return {adapter, drawing}
}

const createSepalMap = (drawing, properties = {}) =>
    Object.assign(Object.create(SepalMap.prototype), {
        drawing,
        drawingListener: null,
        drawingChangeListener: null,
        drawingChangesSuppressed: false,
        polygonPreview: null,
        ...properties
    })

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
