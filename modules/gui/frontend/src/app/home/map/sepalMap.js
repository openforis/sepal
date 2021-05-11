import {NEVER, Subject} from 'rxjs'
import {filter, takeUntil} from 'rxjs/operators'
import {getLogger} from 'log'
import {msg} from 'translate'
import Notifications from 'widget/notifications'
import _ from 'lodash'

const log = getLogger('sepalMap')

export class SepalMap {
    constructor(google, googleMap) {
        log.debug('creating new SepalMap')
        this.google = google
        this.googleMap = googleMap

        const svgMarker = {
            path: 'M10.453 14.016l6.563-6.609-1.406-1.406-5.156 5.203-2.063-2.109-1.406 1.406zM12 2.016q2.906 0 4.945 2.039t2.039 4.945q0 1.453-0.727 3.328t-1.758 3.516-2.039 3.070-1.711 2.273l-0.75 0.797q-0.281-0.328-0.75-0.867t-1.688-2.156-2.133-3.141-1.664-3.445-0.75-3.375q0-2.906 2.039-4.945t4.945-2.039z',
            fillColor: 'white',
            fillOpacity: 0.6,
            strokeWeight: 0,
            rotation: 0,
            scale: 1,
            anchor: new google.maps.Point(15, 15),
        }

        this.marker = new google.maps.Marker({
            clickable: false,
            draggable: false,
            icon: svgMarker
        })
        this.marker.setMap(googleMap)
    }

    layerById = {}
    hiddenLayerById = {}
    removeLayer$ = new Subject()
    zoomArea$ = new Subject()

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
    drawingManager = null
    drawingPolygon = null

    getGoogle() {
        return {
            google: this.google,
            googleMap: this.googleMap
        }
    }

    addListener(event, listener) {
        const {google, googleMap} = this
        const listenerId = googleMap.addListener(event, listener)
        return {
            remove: () => google.maps.event.removeListener(listenerId)
        }
    }

    // Cursor

    setCursor(latLng) {
        this.marker.setPosition(latLng)
    }

    // View

    getView() {
        const center = this.getCenter()
        const zoom = this.getZoom()
        return {center, zoom}
    }

    setView({center, zoom}) {
        this.setCenter(center)
        this.setZoom(zoom)
    }

    // Center

    getCenter() {
        const {googleMap} = this
        return googleMap.getCenter()
    }

    setCenter(center) {
        const {googleMap} = this
        if (!googleMap.getCenter().equals(center)) {
            googleMap.setCenter(center)
        }
    }

    // Zooming

    getZoom() {
        const {googleMap} = this
        return googleMap.getZoom()
    }

    setZoom(zoom) {
        const {googleMap} = this
        if (googleMap.getZoom() !== zoom) {
            googleMap.setZoom(zoom)
        }
    }

    zoomIn() {
        const {googleMap} = this
        googleMap.setZoom(Math.min(googleMap.maxZoom, googleMap.getZoom() + 1))
    }

    zoomOut() {
        const {googleMap} = this
        googleMap.setZoom(Math.max(googleMap.minZoom, googleMap.getZoom() - 1))
    }

    isMaxZoom() {
        const {googleMap} = this
        return googleMap.getZoom() === googleMap.maxZoom
    }

    isMinZoom() {
        const {googleMap} = this
        return googleMap.getZoom() === googleMap.minZoom
    }

    getMetersPerPixel() {
        const {googleMap} = this
        const latitude = googleMap.getCenter().lat()
        const zoom = googleMap.getZoom()
        return Math.round(
            156543.03392 * Math.cos(latitude * Math.PI / 180) / Math.pow(2, zoom)
        )
    }

    zoomArea() {
        const {google, googleMap} = this
        this.drawingManager = new google.maps.drawing.DrawingManager({
            drawingMode: google.maps.drawing.OverlayType.RECTANGLE,
            drawingControl: false,
            rectangleOptions: this.drawingOptions
        })
        const zoomAreaComplete = e => {
            const rectangle = e.overlay
            rectangle.setMap(null)
            googleMap.fitBounds(rectangle.bounds)
            this.cancelZoomArea()
            this.zoomArea$.next()
        }
        google.maps.event.addListener(this.drawingManager, 'overlaycomplete', zoomAreaComplete)
        this.drawingManager.setMap(googleMap)

    }

    getZoomArea$() {
        return this.zoomArea$
    }

    cancelZoomArea() {
        this.disableDrawingMode()
    }

    disableDrawingMode() {
        const {google} = this
        if (this.drawingManager) {
            this.drawingManager.setMap(null)
            google.maps.event.clearListeners(this.drawingManager, 'overlaycomplete')
        }
    }

    // Polygon

    drawPolygon(id, callback) {
        this.drawingPolygon = {id, callback}
        this.redrawPolygon()
    }

    redrawPolygon() {
        const {google, googleMap} = this
        if (this.drawingPolygon) {
            this.disableDrawingMode()
            const {id, callback} = this.drawingPolygon
            this.drawingManager = new google.maps.drawing.DrawingManager({
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
            google.maps.event.addListener(this.drawingManager, 'overlaycomplete', drawingListener)
            this.drawingManager.setMap(googleMap)
        }
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
        const {google} = this
        return new google.maps.LatLngBounds(
            {lng: bounds[0][0], lat: bounds[0][1]},
            {lng: bounds[1][0], lat: bounds[1][1]}
        )
    }

    fitBounds(bounds) {
        const PADDING = 50 // compensate for attribution masking
        const {googleMap} = this
        const nextBounds = this.toGoogleBounds(bounds)
        const currentBounds = googleMap.getBounds()
        const boundsChanged = !currentBounds || !currentBounds.equals(nextBounds)
        if (boundsChanged) {
            googleMap.fitBounds(nextBounds, PADDING)
        }
    }

    getBounds() {
        const {googleMap} = this
        return this.fromGoogleBounds(googleMap.getBounds())
    }

    // Layers

    addToMap(layerIndex, layer) {
        const {googleMap} = this
        googleMap.overlayMapTypes.setAt(layerIndex, layer)
    }

    removeFromMap(layerIndex) {
        const {googleMap} = this
        // [HACK] Prevent flashing of removed layers, which happens when just setting layer to null
        googleMap.overlayMapTypes.insertAt(layerIndex, null)
        googleMap.overlayMapTypes.removeAt(layerIndex + 1)
    }

    getLayer(id) {
        return this.layerById[id]
    }

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

    removeLayer(id) {
        const layer = this.getLayer(id)
        if (layer) {
            this.removeLayer$.next(id)
            layer.removeFromMap()
            delete this.layerById[id]
        }
    }

    removeAllLayers() {
        _.forEach(this.layerById, layer => this.removeLayer(layer))
    }

    hideLayer(id, hidden) {
        const layer = this.getLayer(id)
        this.hiddenLayerById[id] = hidden
        if (layer) {
            layer.hide(hidden)
        }
    }

    isHiddenLayer(id) {
        return this.hiddenLayerById[id]
    }

    isLayerInitialized(id) {
        const layer = this.getLayer(id)
        return !!(layer && layer.__initialized__)
    }

    toggleableLayers() {
        return _.orderBy(Object.values(this.layerById).filter(layer => layer.toggleable), ['layerIndex'])
    }

    setVisibility(visible) {
        log.debug(`Visibility ${visible ? 'on' : 'off'}`)
        _.forEach(this.layerById, (layer, id) =>
            layer.hide && layer.hide(visible ? this.isHiddenLayer(id) : true)
        )
    }

    onOneClick(listener) {
        const {google, googleMap} = this
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
        const {google, googleMap} = this
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

    clearClickListeners() {
        const {google, googleMap} = this
        googleMap.setOptions({draggableCursor: null})
        const instances = [
            googleMap,
            ...Object.values(this.layerById)
                .filter(({type}) => type === 'PolygonLayer')
                .map(({layer}) => layer)
        ]
        instances.forEach(instance => google.maps.event.clearListeners(instance, 'click'))
    }

    interactive(enabled) {
        const {googleMap} = this
        googleMap.setOptions({gestureHandling: enabled ? 'greedy' : 'none'})
    }
}
