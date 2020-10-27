import {NEVER, Subject} from 'rxjs'
import {fromGoogleBounds} from './map'
import {msg} from 'translate'
import {takeUntil} from 'rxjs/operators'
import Notifications from 'widget/notifications'
import _ from 'lodash'

export class SepalMap {
    constructor({google, googleMapsApiKey, googleMap}) {
        this.google = google
        this.googleMapsApiKey = googleMapsApiKey
        this.googleMap = googleMap
        this.layerById = {}
        this.zooming = false
        this.drawingOptions = {
            fillColor: '#FBFAF2',
            fillOpacity: 0.07,
            strokeColor: '#c5b397',
            strokeOpacity: 1,
            strokeWeight: 2,
            clickable: false,
            editable: false,
            zIndex: 1
        }
    }

    getKey() {
        return this.googleMapsApiKey
    }

    getZoom() {
        return this.googleMap.getZoom()
    }

    setZoom(zoom) {
        return this.googleMap.setZoom(zoom)
    }

    zoomIn() {
        this.googleMap.setZoom(this.googleMap.getZoom() + 1)
    }

    zoomOut() {
        this.googleMap.setZoom(this.googleMap.getZoom() - 1)
    }

    getMetersPerPixel() {
        const latitude = this.googleMap.getCenter().lat()
        const zoom = this.googleMap.getZoom()
        return Math.round(
            156543.03392 * Math.cos(latitude * Math.PI / 180) / Math.pow(2, zoom)
        )
    }

    isMaxZoom() {
        return this.googleMap.getZoom() === this.googleMap.maxZoom
    }

    isMinZoom() {
        return this.googleMap.getZoom() === this.googleMap.minZoom
    }

    fitBounds(bounds) {
        const googleBounds = new this.google.maps.LatLngBounds(
            {lng: bounds[0][0], lat: bounds[0][1]},
            {lng: bounds[1][0], lat: bounds[1][1]}
        )
        const boundsChanged = !this.googleMap.getBounds().equals(googleBounds)
        if (boundsChanged) {
            this.googleMap.fitBounds(googleBounds)
        }
    }

    getBounds() {
        return fromGoogleBounds(this.googleMap.getBounds())
    }

    onBoundsChanged(listener) {
        return this.googleMap.addListener('bounds_changed', listener)
    }

    addListener(mapObject, event, listener) {
        return this.google.maps.event.addListener(mapObject, event, listener)
    }

    removeListener(listener) {
        if (listener) {
            this.google.maps.event.removeListener(listener)
        }
    }

    setLayer({id, layer, destroy$ = NEVER, onInitialized, onError}) {
        const existingLayer = this.layerById[id]
        const unchanged = layer === existingLayer || (existingLayer && existingLayer.equals(layer))
        if (unchanged) {
            return false
        }
        this.removeLayer(id)
        if (layer) {
            this.layerById[id] = layer
            layer.__removed$ = new Subject()
            layer.initialize$()
                .pipe(
                    takeUntil(destroy$),
                    takeUntil(layer.__removed$)
                )
                .subscribe(
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

    hideLayer(id, hidden) {
        const layer = this.layerById[id]
        if (layer) {
            layer.hide(hidden)
        }
    }

    removeLayer(id) {
        const layer = this.layerById[id]
        if (layer) {
            layer.__removed$.next()
            layer.removeFromMap()
            delete this.layerById[id]
        }
    }

    isLayerInitialized(id) {
        return !!(this.hasLayer(id) && this.layerById[id].__initialized__)
    }

    hasLayer(id) {
        return !!this.layerById[id]
    }

    toggleableLayers() {
        return _.orderBy(Object.values(this.layerById).filter(layer => layer.toggleable), ['layerIndex'])
    }

    fitLayer(id) {
        const layer = this.layerById[id]
        if (layer && layer.bounds) {
            const bounds = layer.bounds
            this.fitBounds(bounds)
        }
    }

    addToMap() {
        Object.keys(this.layerById).forEach(id => {
            const layer = this.layerById[id]
            if (layer.__initialized__)
                layer.addToMap()
        })
    }

    removeFromMap() {
        Object.keys(this.layerById).forEach(id => this.layerById[id].removeFromMap())
    }

    zoomArea() {
        // setZooming(true)
        this.zooming = true
        this._drawingManager = new this.google.maps.drawing.DrawingManager({
            drawingMode: this.google.maps.drawing.OverlayType.RECTANGLE,
            drawingControl: false,
            rectangleOptions: this.drawingOptions
        })
        const drawingListener = e => {
            const rectangle = e.overlay
            rectangle.setMap(null)
            this.googleMap.fitBounds(rectangle.bounds)
            this.cancelZoomArea()
        }
        this.google.maps.event.addListener(this._drawingManager, 'overlaycomplete', drawingListener)
        this._drawingManager.setMap(this.googleMap)

    }

    cancelZoomArea() {
        // setZooming(false)
        this.zooming = false
        this.disableDrawingMode()
    }

    isZooming() {
        return this.zooming
    }

    drawPolygon(id, callback) {
        this._drawingPolygon = {id, callback}
        this._drawingManager = this._drawingManager || new this.google.maps.drawing.DrawingManager({
            drawingMode: this.google.maps.drawing.OverlayType.POLYGON,
            drawingControl: false,
            drawingControlOptions: {
                position: this.google.maps.ControlPosition.TOP_CENTER,
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
        this.google.maps.event.addListener(this._drawingManager, 'overlaycomplete', drawingListener)
        this._drawingManager.setMap(this.googleMap)
    }

    pauseDrawingMode() {
        if (this._drawingManager) {
            this._drawingManager.setMap(null)
            this.google.maps.event.clearListeners(this._drawingManager, 'overlaycomplete')
        }
    }

    disableDrawingMode() {
        this.pauseDrawingMode()
        this._drawingPolygon = null
    }

    onOneClick(listener) {
        this.googleMap.setOptions({draggableCursor: 'pointer'})
        const instances = [
            this.googleMap,
            ...Object.values(this.layerById)
                .filter(instance => instance.type === 'PolygonLayer')
                .map(({layer}) => layer)
        ]
        instances.forEach(instance => {
            this.google.maps.event.addListener(instance, 'click', ({latLng}) => {
                listener({lat: latLng.lat(), lng: latLng.lng()})
                this.clearClickListeners()
            })
        })
    }

    clearClickListeners() {
        this.googleMap.setOptions({draggableCursor: null})
        const instances = [
            this.googleMap,
            ...Object.values(this.layerById)
                .filter(({type}) => type === 'PolygonLayer')
                .map(({layer}) => layer)
        ]
        instances.forEach(instance => this.google.maps.event.clearListeners(instance, 'click'))
    }
}
