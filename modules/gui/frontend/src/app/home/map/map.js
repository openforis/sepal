import {NEVER, Subject} from 'rxjs'
import {Provider} from './mapContext'
import {compose} from 'compose'
import {connect} from 'store'
import {debounceTime, filter, finalize, takeUntil} from 'rxjs/operators'
import {getLogger} from 'log'
import {getProcessTabsInfo} from '../body/process/process'
import {mapBoundsTag, mapTag} from 'tag'
import {msg} from 'translate'
import {select} from 'store'
import {withMapsContext} from './maps'
import {withRecipePath} from '../body/process/recipe'
import Notifications from 'widget/notifications'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import actionBuilder from 'action-builder'
import styles from './map.module.css'
import withSubscriptions from 'subscription'

const log = getLogger('map')

const mapStateToProps = (_state, {recipePath}) => {
    return {
        single: getProcessTabsInfo().single,
        linked: select([recipePath, 'ui.map.linked'])
    }
}

class _Map extends React.Component {
    layerById = {}
    hiddenLayerById = {}

    updateBounds$ = new Subject()
    linked$ = new Subject()

    drawingOptions = {
        fillColor: '#FBFAF2',
        fillOpacity: 0.07,
        strokeColor: '#c5b397',
        strokeOpacity: 1,
        strokeWeight: 2,
        clickable: false,
        editable: false,
        zIndex: 1
    }

    removeLayer$ = new Subject()
    map = React.createRef()

    state = {
        mapId: null,
        mapContext: null,
        metersPerPixel: null
    }

    // Linking

    isLinked() {
        const {linked} = this.props
        return linked
    }

    setLinked(linked) {
        const {recipePath} = this.props
        actionBuilder('TOGGLE_LINKED')
            .set([recipePath, 'ui.map.linked'], linked)
            .dispatch()
    }

    toggleLinked() {
        const {linked: wasLinked} = this.props
        const linked = !wasLinked
        this.setLinked(linked)
    }

    // Zooming

    getZoom() {
        const {googleMap} = this.state
        return googleMap.getZoom()
    }

    setZoom(zoom) {
        const {googleMap} = this.state
        if (googleMap.getZoom() !== zoom) {
            googleMap.setZoom(zoom)
        }
    }

    zoomIn() {
        const {googleMap} = this.state
        googleMap.setZoom(Math.min(googleMap.maxZoom, googleMap.getZoom() + 1))
    }

    zoomOut() {
        const {googleMap} = this.state
        googleMap.setZoom(Math.max(googleMap.minZoom, googleMap.getZoom() - 1))
    }

    isMaxZoom() {
        const {googleMap} = this.state
        return googleMap.getZoom() === googleMap.maxZoom
    }

    isMinZoom() {
        const {googleMap} = this.state
        return googleMap.getZoom() === googleMap.minZoom
    }

    getMetersPerPixel() {
        const {googleMap} = this.state
        const latitude = googleMap.getCenter().lat()
        const zoom = googleMap.getZoom()
        return Math.round(
            156543.03392 * Math.cos(latitude * Math.PI / 180) / Math.pow(2, zoom)
        )
    }

    zoomArea() {
        const {google, googleMap} = this.state
        this._drawingManager = new google.maps.drawing.DrawingManager({
            drawingMode: google.maps.drawing.OverlayType.RECTANGLE,
            drawingControl: false,
            rectangleOptions: this.drawingOptions
        })
        const drawingListener = e => {
            const rectangle = e.overlay
            rectangle.setMap(null)
            googleMap.fitBounds(rectangle.bounds)
            this.cancelZoomArea()
        }
        google.maps.event.addListener(this._drawingManager, 'overlaycomplete', drawingListener)
        this._drawingManager.setMap(googleMap)

    }

    cancelZoomArea() {
        this.disableDrawingMode()
    }

    // Bounds

    fromGoogleBounds(googleBounds) {
        const sw = googleBounds.getSouthWest()
        const ne = googleBounds.getNorthEast()
        return [
            [sw.lng(), sw.lat()],
            [ne.lng(), ne.lat()]
        ]
    }

    toGoogleBounds(bounds) {
        const {google} = this.state
        return new google.maps.LatLngBounds(
            {lng: bounds[0][0], lat: bounds[0][1]},
            {lng: bounds[1][0], lat: bounds[1][1]}
        )
    }

    fitBounds(bounds, padding = 0) {
        const {googleMap} = this.state
        const nextBounds = this.toGoogleBounds(bounds)
        const currentBounds = googleMap.getBounds()
        const boundsChanged = !currentBounds || !currentBounds.equals(nextBounds)
        if (boundsChanged) {
            googleMap.fitBounds(nextBounds, padding)
        }
    }

    getBounds() {
        const {googleMap} = this.state
        return this.fromGoogleBounds(googleMap.getBounds())
    }

    addListener(event, listener) {
        const {google, googleMap} = this.state
        const listenerId = googleMap.addListener(event, listener)
        return {
            remove: () => google.maps.event.removeListener(listenerId)
        }
    }

    // Layers

    getLayer(id) {
        return this.layerById[id]
    }

    // used by MANY
    setLayer({id, layer, destroy$ = NEVER, onInitialized, onError}) {
        const existingLayer = this.getLayer(id)
        const unchanged = layer === existingLayer || (existingLayer && existingLayer.equals(layer))
        if (unchanged) {
            return false
        }
        this.removeLayer(id)
        if (layer) {
            this.layerById[id] = layer
            layer.initialize$().pipe(
                takeUntil(destroy$),
                takeUntil(this.removeLayer$.pipe(
                    filter(layerId => layerId === id),
                ))
            ).subscribe(
                () => {
                    layer.__initialized__ = true
                    layer.addToMap()
                    onInitialized && onInitialized(layer)
                },
                error => onError
                    ? onError(error)
                    : Notifications.error({message: msg('map.layer.error'), error})
            )
        }
        return true
    }

    listLayers() {
        return Object.values(this.layerById)
    }

    hideLayer(id, hidden) {
        const layer = this.getLayer(id)
        this.hiddenLayerById[id] = hidden
        if (layer) {
            layer.hide(hidden)
        }
    }

    setVisibiliy(visible) {
        _.forEach(this.layerById, (layer, id) =>
            layer.hide(visible ? this.hiddenLayerById[id] : true)
        )
    }

    removeLayer(id) {
        const layer = this.getLayer(id)
        if (layer) {
            this.removeLayer$.next(id)
            layer.removeFromMap()
            delete this.layerById[id]
        }
    }

    isLayerInitialized(id) {
        const layer = this.getLayer(id)
        return !!(layer && layer.__initialized__)
    }

    toggleableLayers() {
        return _.orderBy(Object.values(this.layerById).filter(layer => layer.toggleable), ['layerIndex'])
    }

    fitLayer(id) {
        const layer = this.getLayer(id)
        if (layer && layer.bounds) {
            this.fitBounds(layer.bounds)
        }
    }

    drawPolygon(id, callback) {
        const {google, googleMap} = this.state
        this._drawingPolygon = {id, callback}
        this._drawingManager = this._drawingManager || new google.maps.drawing.DrawingManager({
            drawingMode: google.maps.drawing.OverlayType.POLYGON,
            drawingControl: false,
            drawingControlOptions: {
                position: google.maps.ControlPosition.TOP_CENTER,
                drawingModes: ['polygon']
            },
            circleOptions: this.drawingOptions,
            polygonOptions: this.drawingOptions,
            rectangleOptions: this.drawingOptions
        })
        const drawingListener = e => {
            const polygon = e.overlay
            polygon.setMap(null)
            const toPolygonPath = polygon => polygon.getPaths().getArray()[0].getArray().map(latLng =>
                [latLng.lng(), latLng.lat()]
            )
            callback(toPolygonPath(polygon))
        }
        google.maps.event.addListener(this._drawingManager, 'overlaycomplete', drawingListener)
        this._drawingManager.setMap(googleMap)
    }

    disableDrawingMode() {
        const {google} = this.state
        if (this._drawingManager) {
            this._drawingManager.setMap(null)
            google.maps.event.clearListeners(this._drawingManager, 'overlaycomplete')
            this._drawingPolygon = null
        }
    }

    onOneClick(listener) {
        const {google, googleMap} = this.state
        googleMap.setOptions({draggableCursor: 'pointer'})
        const instances = [
            googleMap,
            ...Object.values(this.layerById)
                .filter(instance => instance.type === 'PolygonLayer')
                .map(({layer}) => layer)
        ]
        instances.forEach(instance => {
            google.maps.event.addListener(instance, 'click', ({latLng}) => {
                listener({lat: latLng.lat(), lng: latLng.lng()})
                this.clearClickListeners()
            })
        })
    }

    onClick(listener) {
        const {google, googleMap} = this.state
        googleMap.setOptions({draggableCursor: 'pointer'})
        const instances = [
            googleMap,
            ...Object.values(this.layerById)
                .filter(instance => instance.type === 'PolygonLayer')
                .map(({layer}) => layer)
        ]
        instances.forEach(instance => {
            google.maps.event.addListener(instance, 'click', ({latLng}) => {
                listener({lat: latLng.lat(), lng: latLng.lng()})
            })
        })
    }

    // used by chartPixelButton, eferenceDataLayer
    clearClickListeners() {
        const {google, googleMap} = this.state
        googleMap.setOptions({draggableCursor: null})
        const instances = [
            googleMap,
            ...Object.values(this.layerById)
                .filter(({type}) => type === 'PolygonLayer')
                .map(({layer}) => layer)
        ]
        instances.forEach(instance => google.maps.event.clearListeners(instance, 'click'))
    }

    render() {
        const {linked, children} = this.props
        const {google, googleMapsApiKey, norwayPlanetApiKey, googleMap, sepalMap, metersPerPixel} = this.state
        const mapContext = {google, googleMapsApiKey, norwayPlanetApiKey, googleMap, sepalMap}
        return (
            <Provider value={{mapContext, linked, metersPerPixel}}>
                <div ref={this.map} className={styles.map}/>
                <div className={styles.content}>
                    {sepalMap ? children : null}
                </div>
            </Provider>
        )
    }

    updateScale(metersPerPixel) {
        this.setState({metersPerPixel})
    }

    componentDidMount() {
        const {mapsContext: {createMapContext}, single, onEnable, onDisable} = this.props
        const {mapId, google, googleMapsApiKey, norwayPlanetApiKey, googleMap, bounds$, updateBounds, notifyLinked} = createMapContext(this.map.current)

        const sepalMap = {
            fitBounds: this.fitBounds.bind(this),                       // collectPanel, aoi
            getBounds: this.getBounds.bind(this),                       // aoi, mapLayer
            getZoom: this.getZoom.bind(this),                           // aoi, sceneAreas, mapLayer
            setZoom: this.setZoom.bind(this),                           // aoi
            zoomIn: this.zoomIn.bind(this),                             // mapToolbar
            zoomOut: this.zoomOut.bind(this),                           // mapToolbar
            isMaxZoom: this.isMaxZoom.bind(this),                       // mapToolbar
            isMinZoom: this.isMinZoom.bind(this),                       // mapToolbar
            zoomArea: this.zoomArea.bind(this),                         // mapToolbar
            cancelZoomArea: this.cancelZoomArea.bind(this),             // mapToolbar
            isLayerInitialized: this.isLayerInitialized.bind(this),     // mapToolbar
            toggleLinked: this.toggleLinked.bind(this),                 // mapToolbar
            fromGoogleBounds: this.fromGoogleBounds.bind(this),         // polygonLayer
            setLayer: this.setLayer.bind(this),                         // MANY
            hideLayer: this.hideLayer.bind(this),                       // MANY
            removeLayer: this.removeLayer.bind(this),                   // MANY
            fitLayer: this.fitLayer.bind(this),                         // MANY
            toggleableLayers: this.toggleableLayers.bind(this),         // layersMenu
            drawPolygon: this.drawPolygon.bind(this),                   // polygonSection
            disableDrawingMode: this.disableDrawingMode.bind(this),     // polygonSection
            onClick: this.onClick.bind(this),                           // referenceDataLayer
            onOneClick: this.onOneClick.bind(this),                     // chartPixelButton
            clearClickListeners: this.clearClickListeners.bind(this)    // chartPixelButton, referenceDataLayer
        }

        onEnable(() => this.setVisibiliy(true))
        onDisable(() => this.setVisibiliy(false))

        this.setState({mapId, google, googleMapsApiKey, norwayPlanetApiKey, googleMap, sepalMap}, () => {
            this.subscribe({bounds$, updateBounds, notifyLinked})
            this.setLinked(single)
        })
    }

    componentDidUpdate(prevProps) {
        const {linked} = this.props
        const {linked: wasLinked} = prevProps
        if (!linked && wasLinked) {
            this.linked$.next(false)
        } else {
            if (linked && !wasLinked) {
                this.linked$.next(true)
            }
            this.updateBounds$.next()
        }
    }

    componentWillUnmount() {
        this.listLayers().map(layer => layer.removeFromMap())
        this.unsubscribe()
    }

    subscribe({bounds$, updateBounds, notifyLinked}) {
        const {addSubscription} = this.props

        this.centerChangedListener = this.addListener('center_changed', () => {
            this.updateScale(this.getMetersPerPixel())
            this.updateBounds$.next()
        })

        this.zoomChangedListener = this.addListener('zoom_changed', () => {
            this.updateScale(this.getMetersPerPixel())
            this.updateBounds$.next()
        })

        const {googleMap} = this.state
        addSubscription(
            bounds$.subscribe(
                bounds => {
                    const {linked} = this.props
                    if (bounds && linked) {
                        const {center, zoom} = bounds
                        log.debug(`${mapTag(this.state.mapId)} received ${mapBoundsTag(bounds)}`)
                        const currentCenter = googleMap.getCenter()
                        const currentZoom = googleMap.getZoom()
                        if (!currentCenter || !currentCenter.equals(center)) {
                            googleMap.setCenter(center)
                        }
                        if (!currentZoom || currentZoom !== zoom) {
                            googleMap.setZoom(zoom)
                        }
                    }
                }
            ),
            this.updateBounds$.pipe(
                debounceTime(50)
            ).subscribe(
                () => {
                    const {linked} = this.props
                    if (linked) {
                        const center = googleMap.getCenter()
                        const zoom = googleMap.getZoom()
                        if (center && zoom) {
                            const bounds = {center, zoom}
                            log.debug(`${mapTag(this.state.mapId)} reporting ${mapBoundsTag(bounds)}`)
                            updateBounds(bounds)
                        }
                    }
                }
            ),
            this.linked$.pipe(
                finalize(() => notifyLinked(false))
            ).subscribe(
                linked => {
                    log.debug(`${mapTag(this.state.mapId)} ${linked ? 'linked' : 'unlinked'}`)
                    notifyLinked(linked)
                }
            )
        )
    }

    unsubscribe() {
        this.centerChangedListener && this.centerChangedListener.remove()
        this.zoomChangedListener && this.zoomChangedListener.remove()
    }
}

export const Map = compose(
    _Map,
    connect(mapStateToProps),
    withRecipePath(),
    withMapsContext(),
    withSubscriptions()
)

Map.propTypes = {
    recipeId: PropTypes.string.isRequired,
    children: PropTypes.object,
    className: PropTypes.string
}
