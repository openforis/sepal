import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'
import {BehaviorSubject, combineLatest, concat, distinctUntilChanged, filter, finalize,
    first, last, map, map as rxMap, of, pipe, scan, share, Subject, switchMap, takeUntil, windowTime} from 'rxjs'

import {actionBuilder} from '~/action-builder'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {withEnableDetector} from '~/enabled'
import {getLogger} from '~/log'
import {selectFrom} from '~/stateUtils'
import {withSubscriptions} from '~/subscription'
import {areaTag, mapTag} from '~/tag'
import {msg} from '~/translate'
import {currentUser} from '~/user'
import {uuid} from '~/uuid'
import {Button} from '~/widget/button'
import {ElementResizeDetector} from '~/widget/elementResizeDetector'
import {Content, SectionLayout} from '~/widget/sectionLayout'
import {SplitView} from '~/widget/split/splitView'
import {getTabsInfo} from '~/widget/tabs/tabs'

import {getImageLayerSource} from '../body/process/imageLayerSourceRegistry'
import {recipePath} from '../body/process/recipe'
import {withRecipe} from '../body/process/recipeContext'
import {withLayers} from '../body/process/withLayers'
import {LegendImport} from './legendImport'
import styles from './map.module.css'
import {MapApiKeyContext} from './mapApiKeyContext'
import {MapAreaContext} from './mapAreaContext'
import {MapContext} from './mapContext'
import {MapInfo} from './mapInfo'
import {MapRendering} from './mapRendering'
import {withMapsContext} from './maps'
import {MapToolbar} from './mapToolbar'
import {VisParamsPanel} from './visParams/visParamsPanel'

// _.memoize.Cache = WeakMap

const log = getLogger('map')

const mapRecipeToProps = recipe => ({
    user: currentUser(),
    bounds: selectFrom(recipe, 'ui.bounds'),
    recipe
})

const OVERLAY_ID = 'overlay-layer-id'
const OVERLAY_AREA = 'overlay-area'

class _Map extends React.Component {
    viewUpdates$ = new BehaviorSubject({})
    linked$ = new BehaviorSubject(false)
    renderingEnabled$ = new BehaviorSubject(false)
    renderingStatus$ = new Subject()
    draggingMap$ = new BehaviorSubject(false)
    viewChanged$ = new Subject()
    splitPosition$ = new BehaviorSubject()
    draggingSplit$ = new BehaviorSubject(false)
    cursor$ = new Subject()
    drawingInstances = []

    filteredViewUpdates$ = this.viewUpdates$.pipe(
        distinctUntilChanged(_.isEqual)
    )

    renderingProgress$ = this.renderingStatus$.pipe(
        scan((acc, {tileProviderId, pending}) => ({
            ...acc, [tileProviderId]: pending
        }), {}),
        map(pending =>
            Object.values(pending).reduce((totalPending, pending) => totalPending + pending, 0)
        )
    )

    state = {
        maps: {}, // [id]: {id, map, listeners, subscriptions}
        mapId: null,
        googleMapsApiKey: null,
        nicfiPlanetApiKey: null,
        overlay: null,
        overlayActive: false,
        drawingMode: null
    }

    markers = {}

    constructor(props) {
        super(props)
        this.ref = React.createRef()
        this.onResize = this.onResize.bind(this)
        this.mapDelegate = this.mapDelegate.bind(this)
        this.setLinked = this.setLinked.bind(this)
        this.toggleRendering = this.toggleRendering.bind(this)
        this.enableZoomArea = this.enableZoomArea.bind(this)
        this.disableZoomArea = this.disableZoomArea.bind(this)
        this.isZoomArea = this.isZoomArea.bind(this)
        this.enablePolygonDrawing = this.enablePolygonDrawing.bind(this)
        this.disablePolygonDrawing = this.disablePolygonDrawing.bind(this)
        this.setLocationMarker = this.setLocationMarker.bind(this)
        this.setAreaMarker = this.setAreaMarker.bind(this)
        this.addOneShotClickListener = this.addOneShotClickListener.bind(this)
        this.removeMap = this.removeMap.bind(this)
        this.fit = this.fit.bind(this)
        this.canFit = this.canFit.bind(this)
        this.removeMarker = this.removeMarker.bind(this)
        this.memoizedMapDelegate = _.memoize(this.getMapDelegate)
    }

    getMapDelegate(map) {
        return map && ({
            view$: this.filteredViewUpdates$,
            linked$: this.linked$,
            renderingEnabled$: this.renderingEnabled$,
            renderingProgress$: this.renderingProgress$,
            scrollWheelEnabled$: this.scrollWheelEnabled$,
            zoomIn: map.zoomIn,
            zoomOut: map.zoomOut,
            setZoom: map.setZoom,
            getZoom: map.getZoom,
            setView: map.setView,
            fitBounds: map.fitBounds,
            getBounds: map.getBounds,
            getGoogle: map.getGoogle,
            setLinked: this.setLinked,
            toggleRendering: this.toggleRendering,
            enableZoomArea: this.enableZoomArea,
            disableZoomArea: this.disableZoomArea,
            isZoomArea: this.isZoomArea,
            canFit: this.canFit,
            fit: this.fit,
            addOneShotClickListener: this.addOneShotClickListener,
            enablePolygonDrawing: this.enablePolygonDrawing,
            disablePolygonDrawing: this.disablePolygonDrawing,
            setLocationMarker: this.setLocationMarker,
            setAreaMarker: this.setAreaMarker
        })
    }

    isInitialized() {
        const {maps} = this.state
        return !_.isEmpty(maps)
    }

    isOverlayLayer(id) {
        return id === OVERLAY_ID
    }

    isOverlayArea(area) {
        return area === OVERLAY_AREA
    }

    isStackMode() {
        const {layers: {mode}} = this.props
        return mode === 'stack'
    }

    isGridMode() {
        const {layers: {mode}} = this.props
        return mode === 'grid'
    }

    getMap(id) {
        const {maps} = this.state
        const {map} = maps[id]
        return map
    }

    getArea(id) {
        const {layers: {areas}} = this.props
        return this.isOverlayLayer(id)
            ? OVERLAY_AREA
            : _.findKey(areas, area => area.id === id)
    }

    getLayerId(area) {
        const {layers} = this.props
        return this.isOverlayArea(area)
            ? OVERLAY_AREA
            : layers.areas[area].id
    }

    withAllMaps(func) {
        this.withAreaMaps(func)
        this.withOverlayMap(func)
    }

    withAreaMaps(func) {
        const {maps} = this.state
        return _.map(maps, ({map, listeners, subscriptions}, id) =>
            func({id, map, listeners, subscriptions})
        )
    }

    withFirstAreaMap(func) {
        const {maps} = this.state
        const id = _.head(_.keys(maps))
        const {map = null} = maps[id] || {}
        return map
            ? func(map)
            : null
    }

    withOverlayMap(func) {
        const {overlay} = this.state
        if (overlay) {
            const {map, listeners, subscriptions} = overlay
            return func({id: OVERLAY_ID, map, listeners, subscriptions})
        }
        return null
    }

    createMap(id, element, isOverlay, callback) {
        const {mapsContext: {createSepalMap}} = this.props
        const area = this.getArea(id)
        log.debug(() => `Adding ${mapTag(this.state.mapId, id)} to ${areaTag(area)}`)

        const options = isOverlay ? {
            backgroundColor: 'hsla(0, 0%, 0%, 0)',
            gestureHandling: 'auto'
        } : null
        const style = isOverlay ? 'overlayStyle' : 'sepalStyle'
        const map = createSepalMap({element, options, style, renderingEnabled$: this.renderingEnabled$, renderingStatus$: this.renderingStatus$})

        this.withFirstAreaMap(firstMap => map.setView(firstMap.getView())) // Make sure a new map is synchronized

        if (isOverlay) {
            this.viewUpdates$.next(map.getView())
        }

        const {googleMap} = map.getGoogle()

        const listeners = [
            googleMap.addListener('idle',
                () => this.viewChanged$.next()
            ),
            googleMap.addListener('mouseout',
                () => this.synchronizeCursor(id, null)
            ),
            googleMap.addListener('mousemove',
                ({latLng, domEvent}) => this.synchronizeCursor(id, latLng, domEvent)
            ),
            googleMap.addListener('bounds_changed',
                () => this.viewChanged$.next()
            ),
            googleMap.addListener('center_changed',
                () => this.synchronizeOut(id, map)
            ),
            googleMap.addListener('zoom_changed',
                () => this.synchronizeOut(id, map)
            ),
            googleMap.addListener('dragstart',
                () => this.draggingMap$.next(true)
            ),
            googleMap.addListener('dragend',
                () => this.draggingMap$.next(false)
            )
        ]

        const subscriptions = [
            this.scrollWheelEnabled$.subscribe(
                enabled => googleMap.setOptions({scrollwheel: enabled})
            )
        ]

        callback({map, listeners, subscriptions})
    }

    removeMap(id) {
        const {maps} = this.state
        if (maps[id]) {
            const {map, listeners, subscriptions} = maps[id]
            const {google} = map.getGoogle()
            const area = this.getArea(id)
            log.debug(() => `Removing ${mapTag(this.state.mapId, id)} from ${areaTag(area)}`)
            listeners.forEach(listener =>
                google.maps.core.event.removeListener(listener)
            )
            subscriptions.forEach(subscription =>
                subscription.unsubscribe()
            )
        }
        this.setState(
            ({maps}) => ({maps: _.omit(maps, id)})
        )
    }

    synchronizeOut(id, map) {
        const view = map.getView()
        if (!_.isEqual(view, this.viewUpdates$.getValue())) {
            this.viewUpdates$.next(view)
            this.withAllMaps(({map, id: mapId}) =>
                mapId !== id && map.setView(view)
            )
        }
    }

    synchronizeIn(view) {
        this.withAllMaps(({map}) => map.setView(view))
    }

    synchronizeCursor(cursorId, latLng, event) {
        const cursorArea = this.getArea(cursorId)
        if (event) {
            this.cursor$.next({
                screenPixel: {x: event.clientX, y: event.clientY},
                mapPixel: {x: event.layerX, y: event.layerY},
                cursorArea,
                latLng
            })
        }
        this.withAreaMaps(({id, map}) => {
            const otherArea = this.getArea(id)
            if (this.isGridMode() && otherArea !== cursorArea) {
                map.setCursor(latLng)
            } else {
                map.setCursor(null)
            }
        })
    }

    setVisibility(visible) {
        this.withAreaMaps(({map}) => map.setVisibility(visible))
    }

    addOneShotClickListener(listener) {
        const {overlayActive} = this.state
        if (overlayActive) {
            const listeners = this.withOverlayMap(({map}) =>
                map.addClickListener(e => {
                    listener(e)
                    removableListener.remove()
                })
            )
            const removableListener = {
                remove: () => listeners.remove()
            }
            return removableListener
        } else {
            const listeners = this.withAreaMaps(({map}) =>
                map.addClickListener(e => {
                    listener(e)
                    removableListener.remove()
                })
            )
            const removableListener = {
                remove: () => listeners.map(listener => listener.remove())
            }
            return removableListener
        }
    }

    // Drawing mode

    enterDrawingMode(drawingMode, callback) {
        const newInstance = {drawingMode, callback}
        const currentInstance = _.last(this.drawingInstances)
        if (currentInstance) {
            this.disableDrawingMode()
        }
        this.enableDrawingMode(newInstance)
        this.drawingInstances = [
            ...this.drawingInstances.filter(drawingInstance => drawingInstance.drawingMode !== drawingMode),
            newInstance
        ]
    }
    
    exitDrawingMode(drawingMode) {
        const index = _.findLastIndex(this.drawingInstances, drawingInstance => drawingInstance.drawingMode === drawingMode)
        if (index !== -1) {
            const isLast = index === this.drawingInstances.length - 1
            const currentInstance = this.drawingInstances.splice(index, 1)
            if (currentInstance && isLast) {
                this.disableDrawingMode()
                const previousInstance = _.last(this.drawingInstances)
                if (previousInstance) {
                    this.enableDrawingMode(previousInstance)
                }
            }
        }
    }

    reassignDrawingMode() {
        const activeInstance = _.last(this.drawingInstances)
        if (activeInstance) {
            const {drawingMode, callback} = activeInstance
            this.withAllMaps(({map}) => map.disableDrawingMode())
            if (this.isStackMode()) {
                this.setState({drawingMode, overlayActive: true}, () => {
                    this.withOverlayMap(callback)
                })
            } else {
                this.setState({drawingMode, overlayActive: false}, () => {
                    this.withAreaMaps(callback)
                })
            }
        }
    }

    enableDrawingMode({drawingMode, callback}) {
        log.debug('enableDrawingMode:', drawingMode)
        if (this.isStackMode()) {
            this.setState({drawingMode, overlayActive: true}, () => {
                this.withOverlayMap(callback)
            })
        } else {
            this.setState({drawingMode, overlayActive: false}, () => {
                this.withAreaMaps(callback)
            })
        }
    }

    disableDrawingMode() {
        log.debug('disableDrawingMode')
        if (this.isStackMode()) {
            this.setState({drawingMode: null, overlayActive: false}, () => {
                this.withOverlayMap(({map}) => map.disableDrawingMode())
            })
        } else {
            this.setState({drawingMode: null, overlayActive: false}, () => {
                this.withAreaMaps(({map}) => map.disableDrawingMode())
            })
        }
    }

    // Zoom

    enableZoomArea(callback) {
        this.enterDrawingMode('zoomarea', ({map}) =>
            map.enableZoomArea((...args) => {
                this.disableZoomArea()
                callback && callback(...args)
            })
        )
    }

    disableZoomArea() {
        this.exitDrawingMode('zoomarea')
    }

    isZoomArea() {
        const {drawingMode} = this.state
        return drawingMode === 'zoomarea'
    }

    // Polygon

    enablePolygonDrawing(callback) {
        log.debug('enablePolygonDrawing')
        this.enterDrawingMode('polygon', ({map}) =>
            map.enablePolygonDrawing((...args) => {
                callback && callback(...args)
            })
        )
    }

    disablePolygonDrawing() {
        this.exitDrawingMode('polygon')
    }

    isPolygonDrawing() {
        const {drawingMode} = this.state
        return drawingMode === 'polygon'
    }

    // Markers

    setLocationMarker(options) {
        const id = uuid()
        const remove = () => this.removeMarker(id)
        this.markers[id] = this.withAreaMaps(
            ({map}) => map.setLocationMarker(options, remove)
        )
        return remove
    }

    setAreaMarker(options) {
        const id = uuid()
        const remove = () => this.removeMarker(id)
        this.markers[id] = this.withAreaMaps(
            ({map}) => map.setAreaMarker(options, remove)
        )
        return remove
    }

    removeMarker(id) {
        const markers = this.markers[id]
        if (markers) {
            markers.forEach(marker => marker.remove())
            delete this.markers[id]
        }
    }

    areaCursor$(id) {
        return this.cursor$.pipe(
            share(),
            lastInWindow(50),
            switchMap(({screenPixel, mapPixel, cursorArea, latLng}) => {
                const map = this.getMap(id)
                const area = this.getArea(id)
                if (cursorArea === area || this.isStackMode()) {
                    return of({...screenPixel})
                } else {
                    return this.splitPosition$.pipe(
                        rxMap(splitPosition => {
                            if (splitPosition) {
                                const areaPixel = map.latLngToPixel(latLng)
                                const toPixel = (fromArea, toArea) => {
                                    const fromLeft = ['top', 'top-left', 'left', 'bottom-left', 'bottom'].includes(fromArea)
                                    const fromRight = ['right', 'top-right', 'bottom-right'].includes(fromArea)
                                    const fromTop = ['top', 'top-left', 'left', 'top-right', 'right'].includes(fromArea)
                                    const fromBottom = ['bottom', 'bottom-left', 'bottom-right'].includes(fromArea)
                                    const toLeft = ['top', 'top-left', 'left', 'bottom-left', 'bottom'].includes(toArea)
                                    const toRight = ['right', 'top-right', 'bottom-right'].includes(toArea)
                                    const toTop = ['top', 'top-left', 'left', 'top-right', 'right'].includes(toArea)
                                    const toBottom = ['bottom', 'bottom-left', 'bottom-right'].includes(toArea)

                                    const valueForDirection = (axis, direction) => {
                                        switch(direction) {
                                            case 0: return areaPixel[axis] - (mapPixel[axis] - screenPixel[axis])
                                            case -1: return areaPixel[axis] - (mapPixel[axis] + splitPosition[axis] - screenPixel[axis])
                                            case 1: return areaPixel[axis] - (mapPixel[axis] - splitPosition[axis] - screenPixel[axis])
                                        }
                                    }

                                    const toValue = (axis, fromStart, fromEnd, toStart, toEnd) => {
                                        if (fromStart && toEnd) {
                                            return valueForDirection(axis, 1)
                                        } else if (fromEnd && toStart) {
                                            return valueForDirection(axis, -1)
                                        } else {
                                            return valueForDirection(axis, 0)
                                        }
                                    }

                                    return {
                                        x: toValue('x', fromLeft, fromRight, toLeft, toRight),
                                        y: toValue('y', fromTop, fromBottom, toTop, toBottom)
                                    }
                                }
                                const pixel = toPixel(cursorArea, area)
                                return {...pixel, area}
                            }
                        }),
                        first()
                    )
                }

            })
        )
    }

    updateLayerConfig(layerConfig, area) {
        const {recipe} = this.props
        actionBuilder('UPDATE_LAYER_CONFIG', layerConfig)
            .assign(
                [recipePath(recipe.id), 'layers.areas', area, 'imageLayer.layerConfig'],
                layerConfig
            )
            .dispatch()
    }

    includeAreaFeatureLayerSource(featureLayerSource, area) {
        const {recipe} = this.props
        actionBuilder('INCLUDE_AREA_FEATURE_LAYER_SOURCE', featureLayerSource)
            .set(
                [recipePath(recipe.id), 'layers.areas', area, 'featureLayerSources', {id: featureLayerSource.id}],
                featureLayerSource
            )
            .dispatch()
    }

    excludeAreaFeatureLayerSource(featureLayerSource, area) {
        const {recipe} = this.props
        actionBuilder('EXCLUDE_AREA_FEATURE_LAYER_SOURCE', featureLayerSource)
            .del(
                [recipePath(recipe.id), 'layers.areas', area, 'featureLayerSources', {id: featureLayerSource.id}]
            )
            .dispatch()
    }

    setLinked(linked, synchronize) {
        this.linked$.next({linked, synchronize})
    }

    setRendering(rendering) {
        this.renderingEnabled$.next(rendering)
    }

    toggleRendering() {
        const rendering = this.renderingEnabled$.getValue()
        this.setRendering(!rendering)
    }

    updateRendering(pendingTiles) {
        const {user: {manualMapRenderingEnabled}} = this.props
        if (manualMapRenderingEnabled && this.renderingEnabled$.getValue() && !pendingTiles) {
            this.setRendering(false)
        }
    }

    onResize(size) {
        this.setState({size})
    }

    render() {
        const {recipe, layers, imageLayerSources} = this.props
        const {googleMapsApiKey, nicfiPlanetApiKey} = this.state
        const imageLayerSourceComponents = imageLayerSources
            .map(source =>
                getImageLayerSource({recipe, source}).sourceComponent
            )
            .filter(mapComponent => mapComponent)
        return (
            <MapApiKeyContext
                googleMapsApiKey={googleMapsApiKey}
                nicfiPlanetApiKey={nicfiPlanetApiKey}>
                <MapContext map={this.mapDelegate()}>
                    {imageLayerSourceComponents}
                    <SplitView
                        className={styles.view}
                        areas={this.renderAreas()}
                        overlay={this.renderOverlay()}
                        mode={layers.mode}
                        position$={this.splitPosition$}
                        dragging$={this.draggingSplit$}>
                        <ElementResizeDetector targetRef={this.ref} onResize={this.onResize}>
                            <div ref={this.ref} className={styles.content}>
                                {this.isInitialized() ? this.renderRecipe() : null}
                                {this.renderDrawingModeIndicator()}
                            </div>
                        </ElementResizeDetector>
                    </SplitView>
                </MapContext>
            </MapApiKeyContext>
        )
    }

    renderAreas() {
        const {layers, imageLayerSources} = this.props
        return _.map(layers.areas, (layer, area) => {
            if (!layer.imageLayer) {
                return {
                    key: area,
                    placement: area,
                    content: this.renderImageLayer('default-layer', undefined, undefined, 'center')
                }
            }
            const {sourceId, layerConfig} = layer.imageLayer
            const source = imageLayerSources.find(({id}) => id === sourceId)
            return ({
                key: layer.id,
                placement: area,
                content: this.renderImageLayer(layer.id, source, layerConfig, area)
            })
        })
    }

    renderOverlay() {
        const {overlay, overlayActive, size} = this.state

        const refCallback = element => {
            if (element && !overlay) {
                this.createMap(OVERLAY_ID, element, true, ({map, listeners, subscriptions}) => {
                    this.setState({overlay: {map, listeners, subscriptions}})
                })
            }
        }

        return size ? (
            <div
                ref={refCallback}
                className={[
                    styles.map,
                    styles.overlay,
                    overlayActive ? styles.active : null
                ].join(' ')}
                style={{'--height': `${size.height}px`}}
            />
        ) : null
    }

    renderRecipe() {
        const {recipeStatePath, children} = this.props
        return (
            <SectionLayout>
                <Content className={styles.recipe}>
                    <MapRendering/>
                    <MapToolbar statePath={[recipeStatePath, 'ui']}/>
                    <MapInfo/>
                    <LegendImport/>
                    {children}
                </Content>
            </SectionLayout>
        )
    }

    renderImageLayer(id, source, layerConfig, area) {
        const {recipe} = this.props
        const {maps} = this.state
        const map = maps[id] && maps[id].map
        const updateLayerConfig = layerConfig => this.updateLayerConfig(layerConfig, area)
        const includeAreaFeatureLayerSource = featureLayerSource => this.includeAreaFeatureLayerSource(featureLayerSource, area)
        const excludeAreaFeatureLayerSource = featureLayerSource => this.excludeAreaFeatureLayerSource(featureLayerSource, area)
        const {layerComponent} = getImageLayerSource({
            recipe,
            source,
            layerConfig,
            map,
            boundsChanged$: this.viewChanged$,
            // boundsChanged$: this.viewChanged$.pipe(share()),
            dragging$: combineLatest([this.draggingMap$, this.draggingSplit$]).pipe(
                share(),
                rxMap(([draggingMap, draggingSplit]) => draggingMap || draggingSplit)
            ),
            cursor$: this.areaCursor$(id)
        })

        const refCallback = element => {
            if (element) {
                if (!maps[id]) {
                    this.createMap(id, element, false, ({map, listeners, subscriptions}) => {
                        this.setState(({maps}) => ({maps: {...maps, [id]: {id, map, listeners, subscriptions}}}))
                    })
                }
            }
        }
        return (
            <MapAreaContext mapArea={{
                area,
                updateLayerConfig,
                includeAreaFeatureLayerSource,
                excludeAreaFeatureLayerSource
            }}>
                <div
                    className={styles.map}
                    ref={refCallback}
                />
                <VisParamsPanel area={area} updateLayerConfig={updateLayerConfig}/>
                {layerComponent}
            </MapAreaContext>
        )
    }

    renderDrawingModeIndicator() {
        const {drawingMode} = this.state
        return drawingMode ? (
            <div className={styles.drawingMode}>
                <Button
                    size='small'
                    label={msg(`map.drawingMode.${drawingMode}`)}
                    icon='pencil'
                />
            </div>
        ) : null
    }

    updateManualMapRendering(prevManualMapRenderingEnabled) {
        const {user: {manualMapRenderingEnabled}} = this.props
        if (manualMapRenderingEnabled !== prevManualMapRenderingEnabled) {
            this.renderingEnabled$.next(!manualMapRenderingEnabled)
        }
    }

    componentDidMount() {
        const {mapsContext: {createMapContext}, enableDetector: {onEnable, onDisable}} = this.props
        const {mapId, googleMapsApiKey, nicfiPlanetApiKey, view$, updateView$, linked$, scrollWheelEnabled$} = createMapContext()
        this.setLinked(getTabsInfo('process').single)
        this.scrollWheelEnabled$ = scrollWheelEnabled$

        this.setState({
            mapId,
            googleMapsApiKey,
            nicfiPlanetApiKey
        }, () => {
            this.subscribe({view$, updateView$, linked$})
            onEnable(() => this.setVisibility(true))
            onDisable(() => this.setVisibility(false))
        })

        this.updateManualMapRendering()
    }

    componentDidUpdate({layers: {areas: prevAreas, mode: prevMode} = {}, user: {manualMapRenderingEnabled: prevManualMapRenderingEnabled}}) {
        const {layers: {areas, mode}} = this.props
        const previousAreaIds = Object.values(prevAreas).map(({id}) => id)
        const currentAreaIds = Object.values(areas).map(({id}) => id)
        const removedAreaIds = _.difference(previousAreaIds, currentAreaIds)
        const addedAreaIds = _.difference(currentAreaIds, previousAreaIds)
        const modeChanged = prevMode !== mode

        if (removedAreaIds.length) {
            removedAreaIds.forEach(this.removeMap)
        }
        if (addedAreaIds.length || modeChanged) {
            this.reassignDrawingMode()
        }

        this.updateManualMapRendering(prevManualMapRenderingEnabled)
    }

    componentWillUnmount() {
        this.withAreaMaps(({id}) => {
            this.removeMap(id)
        })
    }

    subscribe({view$, updateView$, linked$}) {
        const {addSubscription} = this.props
        addSubscription(
            view$.subscribe(
                view => this.synchronizeIn(view)
            ),
            this.filteredViewUpdates$.subscribe(
                view => updateView$.next(view)
            ),
            this.linked$.pipe(
                finalize(() => linked$.next({linked: false}))
            ).subscribe(
                ({linked, synchronize}) => linked$.next({linked, synchronize, view: this.viewUpdates$.getValue()})
            ),
            this.renderingProgress$.subscribe(
                pendingTiles => this.updateRendering(pendingTiles)
            )
        )
    }

    fit() {
        const {bounds} = this.props
        const {maps: mapById} = this.state
        const maps = Object.values(mapById).map(({map}) => map)
        const map = maps[0]
        map.fitBounds(bounds)
    }

    canFit() {
        const {bounds} = this.props
        return !!bounds
    }

    mapDelegate() {
        const {maps: mapById} = this.state
        const maps = Object.values(mapById).map(({map}) => map)
        const map = maps[0]
        return this.memoizedMapDelegate(map)
    }
}

export const Map = compose(
    _Map,
    connect(),
    withMapsContext(),
    withLayers(),
    withRecipe(mapRecipeToProps),
    withSubscriptions(),
    withEnableDetector()
)

Map.propTypes = {
    children: PropTypes.any
}

const EMPTY_WINDOW = Symbol('NO_MESSAGE_IN_WINDOW')
const lastInWindow = time => {
    const cancel$ = new Subject()
    return pipe(
        finalize(() => cancel$.next(true)),
        windowTime(time),
        switchMap(window$ => concat(of(EMPTY_WINDOW), window$).pipe(last())),
        filter(value => value !== EMPTY_WINDOW),
        takeUntil(cancel$)
    )
}
