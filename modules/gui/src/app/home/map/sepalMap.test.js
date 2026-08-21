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

const createSepalMap = drawing =>
    Object.assign(Object.create(SepalMap.prototype), {drawing, drawingListener: null})

describe('polygon drawing', () => {
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
