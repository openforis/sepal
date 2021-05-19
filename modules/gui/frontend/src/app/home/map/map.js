import {BehaviorSubject, ReplaySubject, Subject, of} from 'rxjs'
import {Content, SectionLayout} from 'widget/sectionLayout'
import {ElementResizeDetector} from 'widget/elementResizeDetector'
import {MapAreaContext} from './mapAreaContext'
import {MapContext} from './mapContext'
import {Progress} from './progress'
import {SplitView} from 'widget/split/splitView'
import {VisParamsPanel} from './visParams/visParamsPanel'
import {compose} from 'compose'
import {connect} from 'store'
import {debounceTime, distinctUntilChanged, finalize, first, map as rxMap, share, switchMap} from 'rxjs/operators'
import {getImageLayerSource} from './imageLayerSource/imageLayerSource'
import {getLogger} from 'log'
import {getProcessTabsInfo} from '../body/process/process'
import {mapBoundsTag, mapTag} from 'tag'
import {recipePath} from '../body/process/recipe'
import {selectFrom} from 'stateUtils'
import {withLayers} from '../body/process/withLayers'
import {withMapsContext} from './maps'
import {withRecipe} from '../body/process/recipeContext'
import MapScale from './mapScale'
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
    updateBounds$ = new Subject()
    linked$ = new ReplaySubject()
    mapInitialized$ = new BehaviorSubject()
    mouseDown$ = new Subject()
    dragging$ = new Subject(false)
    boundsChanged$ = new Subject()
    splitPosition$ = new BehaviorSubject()
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

    constructor() {
        super()
        this.mapDelegate = this.mapDelegate.bind(this)
    }

    allMaps(callback) {
        const {maps} = this.state
        _.forEach(maps, ({area, map, listeners, subscriptions}, id) => {
            callback({id, area, map, listeners, subscriptions})
        })
    }

    withFirstMap(callback) {
        const {maps} = this.state
        const id = _.head(_.keys(maps))
        const {map = null} = maps[id] || {}
        return map
            ? callback(map)
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
        const {center, zoom} = map.getView()
        this.allMaps(({map}) => map.setView({center, zoom}))
        overlay && overlay.map.setView({center, zoom})
        this.updateBounds$.next({center, zoom})
        this.boundsChanged$.next()
    }

    synchronizeIn({center, zoom}) {
        const {overlay} = this.state
        this.allMaps(({map}) => map.setView({center, zoom}))
        overlay && overlay.map.setView({center, zoom})
    }

    synchronizeCursor(cursorArea, latLng, event) {
        const {layers: {mode}} = this.props
        if (event) {
            this.cursor$.next({
                screenPixel: {x: event.clientX, y: event.clientY},
                mapPixel: {x: event.layerX, y: event.layerY},
                cursorArea,
                latLng,
                mode
            })
        }
        this.allMaps(({area: otherArea, map}) => {
            if (mode === 'grid' && otherArea !== cursorArea) {
                map.setCursor(latLng)
            } else {
                map.setCursor(null)
            }
        })
    }

    setVisibility(visible) {
        this.allMaps(({map}) => map.setVisibility(visible))
    }

    zoomArea(zoomArea) {
        this.setState({zoomArea, selectedZoomArea: null}, () => {
            this.allMaps(({map}) => zoomArea ? map.zoomArea() : map.cancelZoomArea())
        })
    }

    isZoomArea() {
        const {zoomArea} = this.state
        return zoomArea
    }

    setMarker(options) {
        this.allMaps(({map}) => map.setMarker(options))
    }

    setRectangle(options) {
        this.allMaps(({map}) => map.setRectangle(options))
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
            boundsChanged$: this.boundsChanged$.pipe(share()),
            dragging$: this.dragging$.pipe(share()),
            cursor$: this.areaCursor$(area, map)
        })

        const refCallback = element => {
            if (element) {
                if (!maps[id]) {
                    this.createMap(area, element, ({map, listeners, subscriptions}) => {
                        this.setState(({maps}) => ({maps: {...maps, [id]: {area, map, listeners, subscriptions}}}))
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
                    <VisParamsPanel area={area} updateLayerConfig={updateLayerConfig}/>
                    {layerComponent}
                </MapAreaContext.Provider>
            </React.Fragment>
        )
    }

    areaCursor$(area, map) {
        return this.cursor$.pipe(
            share(),
            switchMap(({screenPixel, mapPixel, cursorArea, mode, latLng}) => {
                if (cursorArea === area || mode === 'stack') {
                    console.log('same area')
                    return of({...screenPixel})
                } else {
                    return this.splitPosition$.pipe(
                        rxMap(splitPosition => {
                            if (splitPosition) {
                                const areaPixel = map.latLngToPixel(latLng)
                                const offset = mapPixel.x + splitPosition.x - screenPixel.x
                                console.log({
                                    areaPixel: areaPixel.x,
                                    mapPixel: mapPixel.x,
                                    screenPixel: screenPixel.x,
                                    splitPosition: splitPosition.x,
                                    offset
                                })
                                return {
                                    x: areaPixel.x - offset,
                                    y: screenPixel.y,
                                    area
                                }
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

    createMap(area, element, callback) {
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
            googleMap.addListener('mouseout', () => this.synchronizeCursor(area, null)),
            googleMap.addListener('mousemove', ({latLng, domEvent}) => this.synchronizeCursor(area, latLng, domEvent)),
            googleMap.addListener('center_changed', () => this.synchronizeOut(map)),
            googleMap.addListener('zoom_changed', () => this.synchronizeOut(map)),
            googleMap.addListener('dragstart', () => this.dragging$.next(true)),
            googleMap.addListener('dragend', () => this.dragging$.next(false))
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
                        position$={this.splitPosition$}>
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
                this.createMap('overlay', element, ({map, listeners, subscriptions}) => {
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
        const {className, recipeContext: {statePath}, children} = this.props
        return (
            <SectionLayout>
                <Content>
                    <div className={className}>
                        <MapToolbar statePath={[statePath, 'ui']}/>
                        <MapScale/>
                        {children}
                    </div>
                </Content>
            </SectionLayout>
        )
    }

    componentDidMount() {
        const {mapsContext: {createMapContext}, onEnable, onDisable} = this.props
        const {mapId, googleMapsApiKey, norwayPlanetApiKey, bounds$, updateBounds, notifyLinked} = createMapContext()

        this.setLinked(getProcessTabsInfo().single)

        this.setState({
            mapId,
            googleMapsApiKey,
            norwayPlanetApiKey
        }, () => {
            this.subscribe({bounds$, updateBounds, notifyLinked})
            onEnable(() => this.setVisibility(true))
            onDisable(() => this.setVisibility(false))
        })
    }

    componentDidUpdate(prevProps) {
        const {layers: {areas: prevAreas}} = prevProps
        const {layers: {areas}} = this.props
        Object.values(prevAreas)
            .filter(({id}) => !Object.values(areas).map(({id}) => id).includes(id))
            .map(({id}) => this.removeMap(id))

        if (this.isMapInitialized()) {
            this.mapInitialized$.next(true)
        }
    }

    componentWillUnmount() {
        this.allMaps(({id}) => {
            this.removeMap(id)
        })
    }

    subscribe({bounds$, updateBounds, notifyLinked}) {
        const {addSubscription} = this.props
        addSubscription(
            bounds$.subscribe(
                bounds => {
                    const {linked} = this.state
                    if (bounds && linked) {
                        log.debug(`${mapTag(this.state.mapId)} received ${mapBoundsTag(bounds)}`)
                        this.synchronizeIn(bounds)
                    }
                    this.bounds$.next(bounds)
                }
            ),
            this.updateBounds$.pipe(
                debounceTime(50),
                distinctUntilChanged()
            ).subscribe(
                ({center, zoom}) => {
                    const {linked} = this.state
                    if (linked) {
                        if (center && zoom) {
                            const bounds = {center, zoom}
                            log.debug(`${mapTag(this.state.mapId)} reporting ${mapBoundsTag(bounds)}`)
                            updateBounds(bounds)
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
                () => this.allMaps(({map}) => map.drawPolygon(id, callback))
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
                () => this.allMaps(({map}) => map.disableDrawingMode())
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
            toggleLinked: () => this.toggleLinked(),
            isLinked: () => this.isLinked(),
            canZoomIn: () => !map.isMaxZoom(),
            zoomIn: () => map.zoomIn(),
            canZoomOut: () => !map.isMinZoom(),
            zoomOut: () => map.zoomOut(),
            canZoomArea: () => !map.isMaxZoom(),
            toggleZoomArea: () => this.zoomArea(!this.isZoomArea()),
            cancelZoomArea: () => this.zoomArea(false),
            isZoomArea: () => this.isZoomArea(),
            canFit: () => isInitialized(),
            fit: () => map.fitBounds(bounds),
            setZoom: zoom => map.setZoom(zoom),
            getZoom: () => map.getZoom(),
            setView: ({center, zoom}) => map.setView({center, zoom}),
            fitBounds: bounds => map.fitBounds(bounds),
            getBounds: () => map.getBounds(),
            getScale: () => map.getMetersPerPixel(),
            drawPolygon: (id, callback) => this.drawPolygon(id, callback),
            disableDrawingMode: () => this.disableDrawingMode(),
            setMarker: options => this.setMarker(options),
            setRectangle: options => this.setRectangle(options),

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
    children: PropTypes.any,
    className: PropTypes.string
}
