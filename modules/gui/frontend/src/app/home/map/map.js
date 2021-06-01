import {BehaviorSubject, ReplaySubject, Subject, combineLatest, concat, of, pipe} from 'rxjs'
import {Content, SectionLayout} from 'widget/sectionLayout'
import {ElementResizeDetector} from 'widget/elementResizeDetector'
import {LegendImport} from './legendImport'
import {MapAreaContext} from './mapAreaContext'
import {MapContext} from './mapContext'
import {MapInfo} from './mapInfo'
import {Progress} from './progress'
import {SplitView} from 'widget/split/splitView'
import {VisParamsPanel} from './visParams/visParamsPanel'
import {compose} from 'compose'
import {connect} from 'store'
import {debounceTime, distinctUntilChanged, filter, finalize, first, last, map as rxMap, share, switchMap, takeUntil, windowTime} from 'rxjs/operators'
import {getImageLayerSource} from './imageLayerSource/imageLayerSource'
import {getLogger} from 'log'
import {getProcessTabsInfo} from '../body/process/process'
import {mapTag, mapViewTag} from 'tag'
import {recipePath} from '../body/process/recipe'
import {selectFrom} from 'stateUtils'
import {v4 as uuid} from 'uuid'
import {withLayers} from '../body/process/withLayers'
import {withMapsContext} from './maps'
import {withRecipe} from '../body/process/recipeContext'
import MapToolbar from './mapToolbar'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import actionBuilder from 'action-builder'
import styles from './map.module.css'
import withSubscriptions from 'subscription'

const log = getLogger('map')

const mapRecipeToProps = recipe => ({
    bounds: selectFrom(recipe, 'ui.bounds'),
    recipe
})

class _Map extends React.Component {
    updateView$ = new Subject()
    linked$ = new ReplaySubject()
    mapInitialized$ = new BehaviorSubject()
    mouseDown$ = new Subject()
    draggingMap$ = new BehaviorSubject(false)
    viewChanged$ = new Subject()
    splitPosition$ = new BehaviorSubject()
    draggingSplit$ = new BehaviorSubject(false)
    cursor$ = new Subject()

    state = {
        maps: {},
        areas: null,
        mapId: null,
        googleMapsApiKey: null,
        norwayPlanetApiKey: null,
        zoomArea: null,
        selectedZoomArea: null,
        linked: null,
        overlay: null,
        overlayActive: false,
        drawPolygon: false
    }

    markers = {}

    constructor() {
        super()
        this.mapDelegate = this.mapDelegate.bind(this)

        this.toggleLinked = this.toggleLinked.bind(this)
        this.toggleZoomArea = this.toggleZoomArea.bind(this)
        this.cancelZoomArea = this.cancelZoomArea.bind(this)
        this.drawPolygon = this.drawPolygon.bind(this)
        this.disableDrawingMode = this.disableDrawingMode.bind(this)
        this.setLocationMarker = this.setLocationMarker.bind(this)
        this.setAreaMarker = this.setAreaMarker.bind(this)
        this.addClickListenerOnce = this.addClickListenerOnce.bind(this)
        this.removeListener = this.removeListener.bind(this)
    }

    withAllMaps(func) {
        const {maps} = this.state
        return _.map(maps, ({area, map, listeners, subscriptions}, id) =>
            func({id, area, map, listeners, subscriptions})
        )
    }

    withFirstMap(func) {
        const {maps} = this.state
        const id = _.head(_.keys(maps))
        const {map = null} = maps[id] || {}
        return map
            ? func(map)
            : null
    }

    removeMap(id) {
        log.debug(`${mapTag(this.state.mapId)} removing map for layer ${id}`)
        const {maps} = this.state
        const {map, listeners, subscriptions} = maps[id]
        const {google} = map.getGoogle()
        _.forEach(listeners, listener =>
            google.maps.event.removeListener(listener)
        )
        _.forEach(subscriptions, subscription =>
            subscription.unsubscribe()
        )
        this.setState(({maps}) => {
            const updatedMaps = {...maps}
            delete updatedMaps[id]
            return ({maps: updatedMaps})
        })
    }

    synchronizeOut(map) {
        const {overlay} = this.state
        const {center, zoom, bounds} = map.getView()
        this.withAllMaps(({map}) => map.setView({center, zoom, bounds}))
        overlay && overlay.map.setView({center, zoom, bounds})
        this.updateView$.next({center, zoom, bounds})
    }

    synchronizeIn({center, zoom}) {
        const {overlay} = this.state
        this.withAllMaps(({map}) => map.setView({center, zoom}))
        overlay && overlay.map.setView({center, zoom})
    }

    synchronizeCursor(cursorId, latLng, event) {
        const {layers: {mode}} = this.props
        const cursorArea = this.getArea(cursorId)
        if (event) {
            this.cursor$.next({
                screenPixel: {x: event.clientX, y: event.clientY},
                mapPixel: {x: event.layerX, y: event.layerY},
                cursorArea,
                latLng,
                mode
            })
        }
        this.withAllMaps(({id, map}) => {
            const otherArea = this.getArea(id)
            if (mode === 'grid' && otherArea !== cursorArea) {
                map.setCursor(latLng)
            } else {
                map.setCursor(null)
            }
        })
    }

    setVisibility(visible) {
        this.withAllMaps(({map}) => map.setVisibility(visible))
    }

    zoomArea(zoomArea) {
        this.setState({zoomArea, selectedZoomArea: null}, () => {
            this.withAllMaps(({map}) => zoomArea ? map.zoomArea() : map.cancelZoomArea())
        })
    }

    addClickListenerOnce(listener) {
        const listeners = this.withAllMaps(({map}) => map.addClickListener(e => {
            listener(e)
            removableListener.remove()
        }))
        const removableListener = {remove: () => listeners.map(listener => listener.remove())}
        return removableListener
    }

    removeListener(listener) {
        listener && listener.remove()
    }

    isZoomArea() {
        const {zoomArea} = this.state
        return zoomArea
    }

    toggleZoomArea() {
        this.zoomArea(!this.isZoomArea())
    }

    cancelZoomArea() {
        this.zoomArea(false)
    }

    setLocationMarker(options) {
        const id = uuid()
        this.markers[id] = this.withAllMaps(
            ({map}) => map.setLocationMarker(options, () => this.removeMarker(id))
        )
    }

    setAreaMarker(options) {
        const id = uuid()
        this.markers[id] = this.withAllMaps(
            ({map}) => map.setAreaMarker(options, () => this.removeMarker(id))
        )
    }

    removeMarker(id) {
        const markers = this.markers[id]
        if (markers) {
            markers.forEach(marker => marker.remove())
            delete this.markers[id]
        }
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
            boundsChanged$: this.viewChanged$.pipe(share()),
            dragging$: combineLatest([this.draggingMap$, this.draggingSplit$]).pipe(
                share(),
                rxMap(([draggingMap, draggingSplit]) => draggingMap || draggingSplit)
            ),
            cursor$: this.areaCursor$(id)
        })

        const refCallback = element => {
            if (element) {
                if (!maps[id]) {
                    this.createMap(id, area, element, ({map, listeners, subscriptions}) => {
                        this.setState(({maps}) => ({maps: {...maps, [id]: {id, map, listeners, subscriptions}}}))
                    })
                }
            }
        }
        return (
            <React.Fragment>
                <div
                    className={styles.map}
                    ref={refCallback}
                    onMouseDown={() => this.mouseDown$.next(area)}
                />
                <MapAreaContext.Provider value={{
                    area,
                    updateLayerConfig,
                    includeAreaFeatureLayerSource,
                    excludeAreaFeatureLayerSource
                }}>
                    <LegendImport/>
                    <VisParamsPanel area={area} updateLayerConfig={updateLayerConfig}/>
                    {layerComponent}
                </MapAreaContext.Provider>
            </React.Fragment>
        )
    }

    getArea(layerId) {
        const {layers: {areas}} = this.props
        return Object.keys(areas).find(area => areas[area].id === layerId)
    }

    areaCursor$(id) {
        return this.cursor$.pipe(
            share(),
            lastInWindow(100),
            switchMap(({screenPixel, mapPixel, cursorArea, mode, latLng}) => {
                const {maps} = this.state
                const {map} = maps[id]
                const area = this.getArea(id)
                if (cursorArea === area || mode === 'stack') {
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

    createMap(id, area, element, callback) {
        const {mapsContext: {createSepalMap}} = this.props

        log.debug(`${mapTag(this.state.mapId)} creating area ${area}`)

        const isOverlay = area === 'overlay'
        const options = isOverlay ? {
            backgroundColor: 'hsla(0, 0%, 0%, 0)',
            gestureHandling: 'none'
        } : null
        const style = isOverlay ? 'overlayStyle' : 'sepalStyle'
        const map = createSepalMap(element, options, style)

        this.withFirstMap(firstMap => map.setView(firstMap.getView())) // Make sure a new map is synchronized

        const {googleMap} = map.getGoogle()

        const listeners = [
            googleMap.addListener('mouseout', () => this.synchronizeCursor(id, null)),
            googleMap.addListener('mousemove', ({latLng, domEvent}) => this.synchronizeCursor(id, latLng, domEvent)),
            googleMap.addListener('center_changed', () => this.synchronizeOut(map)),
            googleMap.addListener('bounds_changed', () => this.viewChanged$.next()),
            googleMap.addListener('zoom_changed', () => this.synchronizeOut(map)),
            googleMap.addListener('dragstart', () => this.draggingMap$.next(true)),
            googleMap.addListener('dragend', () => this.draggingMap$.next(false))
        ]

        const subscriptions = [
            this.mouseDown$.subscribe(mouseDownArea => {
                const {zoomArea, selectedZoomArea, drawPolygon} = this.state
                if (zoomArea) {
                    if (selectedZoomArea) {
                        if (mouseDownArea === area && selectedZoomArea !== area) {
                            this.zoomArea(false)
                        }
                    } else {
                        if (mouseDownArea === area) {
                            this.setState({selectedZoomArea: area})
                        } else {
                            map.cancelZoomArea()
                        }
                    }
                }

                if (drawPolygon) {
                    if (mouseDownArea !== area) {
                        map.redrawPolygon()
                    }
                }

            }),
            map.getZoomArea$().subscribe(() =>
                this.zoomArea(false)
            )
        ]

        callback({map, listeners, subscriptions})
    }

    setLinked(linked) {
        this.setState({linked}, () => this.linked$.next(linked))
    }

    toggleLinked() {
        const {linked: wasLinked} = this.state
        const linked = !wasLinked
        this.setLinked(linked)
    }

    isLinked() {
        const {linked} = this.state
        return linked
    }

    render() {
        const {recipe, layers, imageLayerSources} = this.props
        const {googleMapsApiKey, norwayPlanetApiKey, selectedZoomArea} = this.state

        const imageLayerSourceComponents = imageLayerSources
            .map(source =>
                getImageLayerSource({recipe, source}).sourceComponent
            )
            .filter(mapComponent => mapComponent)
        return (
            <ElementResizeDetector onResize={size => this.setState({size})}>
                <MapContext.Provider value={{
                    map: this.mapDelegate(),
                    googleMapsApiKey,
                    norwayPlanetApiKey
                }}>
                    {imageLayerSourceComponents}
                    <SplitView
                        areas={this.renderAreas()}
                        overlay={this.renderOverlay()}
                        mode={layers.mode}
                        maximize={layers.mode === 'stack' ? selectedZoomArea : null}
                        position$={this.splitPosition$}
                        dragging$={this.draggingSplit$}>
                        <div className={styles.content}>
                            {this.isMapInitialized() ? this.renderRecipe() : null}
                        </div>
                    </SplitView>
                    <Progress/>
                </MapContext.Provider>
            </ElementResizeDetector>
        )
    }

    renderAreas() {
        const {layers, imageLayerSources} = this.props
        return _.map(layers.areas, (layer, area) => {
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
                this.createMap('overlay-layer-id', 'overlay', element, ({map, listeners, subscriptions}) => {
                    this.setState({overlay: {map, listeners, subscriptions}})
                })
            }
        }

        return size ? (
            <div
                className={[
                    styles.map,
                    styles.overlay,
                    overlayActive ? styles.active : null
                ].join(' ')}
                style={{'--height': `${size.height}px`}}
                ref={refCallback}
                onMouseDown={() => this.mouseDown$.next('overlay')}
            />
        ) : null
    }

    isMapInitialized() {
        const {maps} = this.state
        return !_.isEmpty(maps)
    }

    renderRecipe() {
        const {recipeContext: {statePath}, children} = this.props
        return (
            <SectionLayout>
                <Content>
                    <div className={styles.recipe}>
                        <MapToolbar statePath={[statePath, 'ui']}/>
                        <MapInfo/>
                        {children}
                    </div>
                </Content>
            </SectionLayout>
        )
    }

    componentDidMount() {
        const {mapsContext: {createMapContext}, onEnable, onDisable} = this.props
        const {mapId, googleMapsApiKey, norwayPlanetApiKey, view$, updateView, notifyLinked} = createMapContext()

        this.setLinked(getProcessTabsInfo().single)

        this.setState({
            mapId,
            googleMapsApiKey,
            norwayPlanetApiKey
        }, () => {
            this.subscribe({view$, updateView, notifyLinked})
            onEnable(() => this.setVisibility(true))
            onDisable(() => this.setVisibility(false))
        })
    }

    componentDidUpdate(prevProps) {
        const prevAreas = selectFrom(prevProps, 'layers.areas') || {}
        const {layers: {areas}} = this.props
        Object.values(prevAreas)
            .filter(({id}) => !Object.values(areas).map(({id}) => id).includes(id))
            .map(({id}) => this.removeMap(id))

        if (this.isMapInitialized()) {
            this.mapInitialized$.next(true)
        }
    }

    componentWillUnmount() {
        this.withAllMaps(({id}) => {
            this.removeMap(id)
        })
    }

    subscribe({view$, updateView, notifyLinked}) {
        const {addSubscription} = this.props
        addSubscription(
            view$.subscribe(
                view => {
                    const {linked} = this.state
                    if (view && linked) {
                        log.debug(`${mapTag(this.state.mapId)} received ${mapViewTag(view)}`)
                        this.synchronizeIn(view)
                    }
                    this.view$.next(view)
                }
            ),
            this.updateView$.pipe(
                debounceTime(50),
                distinctUntilChanged()
            ).subscribe(
                ({center, zoom, bounds}) => {
                    const {linked} = this.state
                    if (linked) {
                        if (center && zoom) {
                            const view = {center, zoom, bounds}
                            log.debug(`${mapTag(this.state.mapId)} reporting ${mapViewTag(view)}`)
                            updateView(view)
                        }
                    }
                }
            ),
            this.linked$.pipe(
                distinctUntilChanged(),
                finalize(() => notifyLinked(false))
            ).subscribe(
                linked => {
                    log.debug(`${mapTag(this.state.mapId)} ${linked ? 'linked' : 'unlinked'}`)
                    notifyLinked(linked)
                }
            )
        )
    }

    drawPolygon(id, callback) {
        const {layers: {mode}} = this.props
        const {overlay: {map}} = this.state
        if (mode === 'stack') {
            this.setState({drawPolygon: {id, callback}, overlayActive: true},
                () => {
                    map.interactive(true)
                    map.disableDrawingMode()
                    map.drawPolygon(id, callback)
                }
            )
        } else {
            this.setState({drawPolygon: true},
                () => this.withAllMaps(({map}) => map.drawPolygon(id, callback))
            )
        }
    }

    disableDrawingMode() {
        const {layers: {mode}} = this.props
        const {overlay: {map}} = this.state
        if (mode === 'stack') {
            this.setState({drawPolygon: false, overlayActive: false},
                () => {
                    map.disableDrawingMode()
                    map.interactive(false)
                }
            )
        } else {
            this.setState({drawPolygon: false},
                () => this.withAllMaps(({map}) => map.disableDrawingMode())
            )
        }
    }

    mapDelegate() {
        const {bounds} = this.props
        const {maps: mapById} = this.state
        const maps = Object.values(mapById).map(({map}) => map)
        const map = maps[0]

        const isInitialized = () => bounds

        return {
            toggleLinked: this.toggleLinked,
            isLinked: () => this.isLinked(),
            canZoomIn: () => !map.isMaxZoom(),
            zoomIn: () => map.zoomIn(),
            canZoomOut: () => !map.isMinZoom(),
            zoomOut: () => map.zoomOut(),
            canZoomArea: () => !map.isMaxZoom(),
            toggleZoomArea: this.toggleZoomArea,
            cancelZoomArea: this.cancelZoomArea,
            isZoomArea: () => this.isZoomArea(),
            canFit: () => isInitialized(),
            fit: () => map.fitBounds(bounds),
            setZoom: zoom => map.setZoom(zoom),
            getZoom: () => map.getZoom(),
            setView: ({center, zoom}) => map.setView({center, zoom}),
            fitBounds: bounds => map.fitBounds(bounds),
            getBounds: () => map.getBounds(),

            addClickListenerOnce: this.addClickListenerOnce,
            removeListener: this.removeListener,

            // getScale: () => map.getMetersPerPixel(),

            drawPolygon: this.drawPolygon,
            disableDrawingMode: this.disableDrawingMode,
            setLocationMarker: this.setLocationMarker,
            setAreaMarker: this.setAreaMarker,

            setLayer: (...args) => {
                log.warn('should we call map.setLayer?')
                map.setLayer(...args)
            },
            getGoogle: (...args) => {
                log.warn('should we call map.getGoogle?')
                return map.getGoogle(...args)
            },
            addToMap: (...args) => {
                log.warn('should we call map.addToMap?')
                map.addToMap(...args)
            },
            removeFromMap: (...args) => {
                log.warn('should we call map.removeToMap?')
                map.removeFromMap(...args)
            },
        }
    }
}

export const Map = compose(
    _Map,
    connect(),
    withMapsContext(),
    withLayers(),
    withRecipe(mapRecipeToProps),
    withSubscriptions()
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
