import {_Map} from './map'

const createPane = initialPath => ({
    path: initialPath,
    enablePolygonDrawing(onFinish, getPath) {
        this.path = getPath()
        this.finishDrawing = path => {
            this.path = path
            onFinish(path)
        }
    },
    setPolygonDrawing(path) {
        this.path = path
    }
})

describe('polygon drawing', () => {
    it('keeps the editable polygon synchronized across area maps', () => {
        const initialPath = [[10, 20], [30, 20], [30, 40]]
        const updatedPath = [[11, 21], [31, 21], [31, 41]]
        const panes = [createPane(initialPath), createPane(initialPath), createPane(initialPath)]
        const map = new _Map({layers: {mode: 'grid'}})
        map.state.maps = Object.fromEntries(panes.map((pane, index) => [index, {map: pane}]))
        map.enterDrawingMode = (_drawingMode, enable) =>
            map.withAreaMaps(enable)

        let formPath
        map.enablePolygonDrawing(path => {
            formPath = path
        }, () => initialPath)
        panes[1].finishDrawing(updatedPath)

        expect(panes.map(({path}) => path)).toEqual([updatedPath, updatedPath, updatedPath])
        expect(formPath).toEqual(updatedPath)
    })
})
