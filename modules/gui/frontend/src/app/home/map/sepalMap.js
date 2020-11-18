import {NEVER, Subject} from 'rxjs'
import {filter, takeUntil} from 'rxjs/operators'
import {msg} from 'translate'
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
        this.removeLayer$ = new Subject()
    }

    // Zoom

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

    isMaxZoom() {
        return this.googleMap.getZoom() === this.googleMap.maxZoom
    }

    isMinZoom() {
        return this.googleMap.getZoom() === this.googleMap.minZoom
    }

    getMetersPerPixel() {
        const latitude = this.googleMap.getCenter().lat()
        const zoom = this.googleMap.getZoom()
        return Math.round(
            156543.03392 * Math.cos(latitude * Math.PI / 180) / Math.pow(2, zoom)
        )
    }

    // used by mapToolbar
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

    // used by mapToolbar
    cancelZoomArea() {
        // setZooming(false)
        this.zooming = false
        this.disableDrawingMode()
    }

    // used by mapToolbar, chartPixelButton
    isZooming() {
        return this.zooming
    }

    // Bounds

    // user by polygonLayer
    fromGoogleBounds(googleBounds) {
        const sw = googleBounds.getSouthWest()
        const ne = googleBounds.getNorthEast()
        return [
            [sw.lng(), sw.lat()],
            [ne.lng(), ne.lat()]
        ]
    }

    // used here
    toGoogleBounds(bounds) {
        return new this.google.maps.LatLngBounds(
            {lng: bounds[0][0], lat: bounds[0][1]},
            {lng: bounds[1][0], lat: bounds[1][1]}
        )
    }

    // used by aoi, map
    fitBounds(bounds, padding) {
        const nextBounds = this.toGoogleBounds(bounds)
        const currentBounds = this.googleMap.getBounds()
        const boundsChanged = !currentBounds || !currentBounds.equals(nextBounds)
        if (boundsChanged) {
            this.googleMap.fitBounds(nextBounds, padding)
        }
    }

    // user by aoi, map
    getBounds() {
        return this.fromGoogleBounds(this.googleMap.getBounds())
    }

    // used by earthEngineLayer, map
    onBoundsChanged(listener) {
        const listenerId = this.googleMap.addListener('bounds_changed', listener)
        return {
            removeListener: () => this.google.maps.event.removeListener(listenerId)
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

    // used by MANY
    hideLayer(id, hidden) {
        const layer = this.getLayer(id)
        if (layer) {
            layer.hide(hidden)
        }
    }

    // used by MANY
    removeLayer(id) {
        const layer = this.getLayer(id)
        if (layer) {
            this.removeLayer$.next(id)
            layer.removeFromMap()
            delete this.getLayer(id)
        }
    }

    // used by mapToolbar
    isLayerInitialized(id) {
        const layer = this.getLayer(id)
        return !!(layer && layer.__initialized__)
    }

    // used by layersMenu
    toggleableLayers() {
        return _.orderBy(Object.values(this.layerById).filter(layer => layer.toggleable), ['layerIndex'])
    }

    // used by MANY
    fitLayer(id) {
        const layer = this.getLayer(id)
        if (layer && layer.bounds) {
            this.fitBounds(layer.bounds)
        }
    }

    // used by polygonSection
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

    // used by polygonSection
    disableDrawingMode() {
        if (this._drawingManager) {
            this._drawingManager.setMap(null)
            this.google.maps.event.clearListeners(this._drawingManager, 'overlaycomplete')
            this._drawingPolygon = null
        }
    }

    // used by chartPixelButton
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

    // used by chartPixelButton
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
