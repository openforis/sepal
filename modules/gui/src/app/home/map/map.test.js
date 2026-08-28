import {_Map} from './map'

const createPane = initialPath => ({
    path: initialPath,
    previewPath: null,
    enablePolygonDrawing(onFinish, getPath, onChange) {
        this.path = getPath()
        this.changeDrawing = path => {
            this.path = path
            this.previewPath = null
            onChange?.(path)
        }
        this.cancelDrawing = () => {
            this.path = getPath()
            onChange?.(null)
        }
        this.cancelDrawingWithoutCommitted = () => {
            this.path = null
            onChange?.(null)
        }
        this.finishDrawing = path => {
            this.path = path
            onFinish(path)
        }
    },
    setPolygonPreview(path) {
        this.path = null
        this.previewPath = path
    },
    setPolygonDrawing(path) {
        this.path = path
        this.previewPath = null
    }
})

const setStateSynchronously = map => {
    map.setState = (update, callback) => {
        const nextState = typeof update === 'function'
            ? update(map.state, map.props)
            : update
        map.state = {...map.state, ...nextState}
        callback?.()
    }
}

describe('interaction modes', () => {
    it('lets only the current owner remove the indicator', () => {
        const map = new _Map({})
        setStateSynchronously(map)

        const first = map.enterInteractionMode('first')
        const second = map.enterInteractionMode('second')

        first.remove()
        expect(map.state.interactionMode.mode).toBe('second')

        second.remove()
        expect(map.state.interactionMode).toBeNull()
    })
})

describe('polygon drawing', () => {
    it('keeps the editable polygon synchronized across area maps', () => {
        const initialPath = [[10, 20], [30, 20], [30, 40]]
        const updatedPath = [[11, 21], [31, 21], [31, 41]]
        const panes = [createPane(initialPath), createPane(initialPath), createPane(initialPath)]
        const map = new _Map({layers: {mode: 'grid'}})
        map.state.maps = Object.fromEntries(panes.map((pane, index) => [index, {map: pane}]))
        map.readyMaps = new WeakSet(panes)
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

    it('shows an unfinished polygon in every area map without updating the form', () => {
        const initialPath = [[10, 20], [30, 20], [30, 40]]
        const provisionalPath = [[11, 21], [31, 21], [31, 41]]
        const panes = [createPane(initialPath), createPane(initialPath), createPane(initialPath)]
        const map = new _Map({layers: {mode: 'grid'}})
        map.state.maps = Object.fromEntries(panes.map((pane, index) => [index, {map: pane}]))
        map.readyMaps = new WeakSet(panes)
        map.enterDrawingMode = (_drawingMode, enable) =>
            map.withAreaMaps(enable)

        let formPath
        map.enablePolygonDrawing(path => {
            formPath = path
        }, () => initialPath)
        panes[0].changeDrawing(provisionalPath)

        expect(panes.map(({path, previewPath}) => previewPath || path)).toEqual([
            provisionalPath,
            provisionalPath,
            provisionalPath
        ])
        expect(formPath).toBeUndefined()
    })

    it('restores the committed polygon in every area map when drawing is cancelled', () => {
        const initialPath = [[10, 20], [30, 20], [30, 40]]
        const provisionalPath = [[11, 21], [31, 21], [31, 41]]
        const panes = [createPane(initialPath), createPane(initialPath)]
        const map = new _Map({layers: {mode: 'grid'}})
        map.state.maps = Object.fromEntries(panes.map((pane, index) => [index, {map: pane}]))
        map.readyMaps = new WeakSet(panes)
        map.enterDrawingMode = (_drawingMode, enable) =>
            map.withAreaMaps(enable)

        let formPath
        map.enablePolygonDrawing(path => {
            formPath = path
        }, () => initialPath)
        panes[0].changeDrawing(provisionalPath)
        panes[0].cancelDrawing()

        expect(panes.map(({path, previewPath}) => previewPath || path)).toEqual([initialPath, initialPath])
        expect(formPath).toBeUndefined()
    })

    it('restores the source pane when it cancels after taking over from a preview', () => {
        const initialPath = [[10, 20], [30, 20], [30, 40]]
        const firstDraft = [[11, 21], [31, 21], [31, 41]]
        const secondDraft = [[12, 22], [32, 22], [32, 42]]
        const panes = [createPane(initialPath), createPane(initialPath)]
        const map = new _Map({layers: {mode: 'grid'}})
        map.state.maps = Object.fromEntries(panes.map((pane, index) => [index, {map: pane}]))
        map.readyMaps = new WeakSet(panes)
        map.enterDrawingMode = (_drawingMode, enable) =>
            map.withAreaMaps(enable)

        map.enablePolygonDrawing(() => {}, () => initialPath)
        panes[0].changeDrawing(firstDraft)
        panes[1].changeDrawing(secondDraft)
        panes[1].cancelDrawingWithoutCommitted()

        expect(panes.map(({path, previewPath}) => previewPath || path)).toEqual([initialPath, initialPath])
    })

    it('starts polygon editing on an added pane after its first idle event', () => {
        const initialPath = [[10, 20], [30, 20], [30, 40]]
        const provisionalPath = [[11, 21], [31, 21], [31, 41]]
        const googleMapListeners = {}
        const googleMap = {
            addListener(event, callback) {
                googleMapListeners[event] = callback
                return {event, callback}
            },
            setOptions() {}
        }
        const pane = {
            ready: false,
            enableCount: 0,
            getGoogle: () => ({googleMap}),
            getView: () => ({}),
            enablePolygonDrawing(_onFinish, getPath) {
                if (!this.ready) {
                    throw new TypeError('Cannot read properties of null (reading \'addEventListener\')')
                }
                this.enableCount += 1
                this.path = getPath()
            },
            setPolygonPreview(path) {
                this.previewPath = path
            },
            disableDrawingMode() {}
        }
        const previousLayers = {mode: 'grid', areas: {left: {id: 'left'}}}
        const layers = {...previousLayers, areas: {...previousLayers.areas, right: {id: 'right'}}}
        const map = new _Map({
            layers,
            mapsContext: {createSepalMap: () => pane},
            user: {manualMapRenderingEnabled: false}
        })
        map.scrollWheelEnabled$ = {
            subscribe: callback => {
                callback(true)
                return {unsubscribe() {}}
            }
        }
        setStateSynchronously(map)
        map.drawingInstances = [{
            drawingMode: 'polygon',
            callback: ({map}) => map.enablePolygonDrawing(() => {}, () => initialPath)
        }]
        map.activePolygonDrawing = {map: {}, path: provisionalPath}
        map.createMap('right', {}, false, entry => {
            map.state.maps.right = {id: 'right', ...entry}
        })

        expect(() => map.componentDidUpdate({
            layers: previousLayers,
            user: {manualMapRenderingEnabled: false}
        })).not.toThrow()
        expect(pane.enableCount).toBe(0)

        pane.ready = true
        googleMapListeners.idle()
        googleMapListeners.idle()

        expect(pane.enableCount).toBe(1)
        expect(pane.path).toEqual(initialPath)
        expect(pane.previewPath).toEqual(provisionalPath)
    })

    it.each([
        ['committed geometry', [[10, 20], [30, 20], [30, 40]]],
        ['an empty path', undefined]
    ])('restores %s when the active drawing pane is removed', (_description, initialPath) => {
        const provisionalPath = [[11, 21], [31, 21], [31, 41]]
        const source = createPane(initialPath)
        const peer = createPane(initialPath)
        const google = {maps: {core: {event: {removeListener() {}}}}}
        source.getGoogle = () => ({google})
        source.disableDrawingMode = () => {
            source.drawingDisabled = true
        }
        peer.setPolygonPreview(provisionalPath)
        const map = new _Map({
            layers: {
                mode: 'grid',
                areas: {left: {id: 'left'}, right: {id: 'right'}}
            }
        })
        map.state.maps = {
            left: {map: source, listeners: [], subscriptions: []},
            right: {map: peer, listeners: [], subscriptions: []}
        }
        map.readyMaps = new WeakSet([source, peer])
        map.activePolygonDrawing = {map: source, path: provisionalPath, getPath: () => initialPath}
        setStateSynchronously(map)

        map.removeMap('left')

        expect(source.drawingDisabled).toBe(true)
        expect(map.activePolygonDrawing).toBeNull()
        expect(peer.path).toEqual(initialPath)
        expect(peer.previewPath).toBeNull()
    })
})
