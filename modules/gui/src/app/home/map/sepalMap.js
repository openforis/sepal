import {Subject} from 'rxjs'
import {getLogger} from 'log'
import _ from 'lodash'

const log = getLogger('sepalMap')

export class SepalMap {
    constructor(google, googleMap) {
        log.debug('creating new SepalMap')
        this.google = google
        this.googleMap = googleMap

        this.cursor = new google.maps.Marker({
            clickable: false,
            draggable: false,
            icon: {
                path: `
                    M 1 -3 L 0 -2 L -1 -3 H -1 V -15 H 1 V -3 Z 
                    M 3 -1 L 2 0 L 3 1 V 1 H 15 V -1 H 15 Z 
                    M 1 3 L 0 2 L -1 3 H -1 V 15 H 1 Z 
                    M -3 1 L -2 0 L -3 -1 V -1 H -15 V 1 Z 
                    M -15 -15 H -7 V -13 H -13 V -7 H -15 V -7 Z 
                    M 15 -15 H 7 V -13 H 13 V -7 H 15 V -12 Z 
                    M 15 15 V 7 H 13 V 13 H 7 V 15 H 7 Z 
                    M -15 15 H -7 V 13 H -13 V 7 H -15 V 7 Z
                `,
                fillColor: 'white',
                fillOpacity: 1,
                strokeColor: 'black',
                strokeOpacity: 1
            }
        })
        this.cursor.setMap(googleMap)

        this.crosshair = new google.maps.Marker({
            icon: {
                path: `
                    M 0 0 L 100 0
                    M 0 0 L 0 -100
                    M 0 0 L -100 0
                    M 0 0 L 0 100
                `,
                // fillColor: 'white',
                // fillOpacity: 1,
                strokeColor: 'white',
                strokeOpacity: 1
            }
        })
        this.crosshair.setMap(googleMap)

        this.overlay = new google.maps.OverlayView()
        this.overlay.draw = () => {}
        this.overlay.setMap(googleMap)

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

    addClickListener(listener) {
        const {google, googleMap} = this
        const listenerId = googleMap.addListener('click', ({latLng: {lat, lng}}) => listener({lat: lat(), lng: lng()}))
        googleMap.setOptions({draggableCursor: 'crosshair'})
        return {
            remove: () => {
                googleMap.setOptions({draggableCursor: 'pointer'})
                return google.maps.event.removeListener(listenerId)
            }
        }
    }

    // Drawing mode

    enableDrawingMode(options, overlayCompleteCallback) {
        const {google, googleMap} = this
        this.disableDrawingMode()
        this.drawingManager = new google.maps.drawing.DrawingManager(options)
        google.maps.event.addListener(this.drawingManager, 'overlaycomplete', overlayCompleteCallback)
        this.drawingManager.setMap(googleMap)
    }

    disableDrawingMode() {
        const {google} = this
        if (this.drawingManager) {
            this.drawingManager.setMap(null)
            google.maps.event.clearListeners(this.drawingManager, 'overlaycomplete')
        }
    }

    // Cursor

    setCursor(latLng) {
        this.cursor.setPosition(latLng)
    }

    setcrosshair(latLng) {
        this.crosshair.setPosition(latLng)
    }

    latLngToPixel(latLng) {
        const projection = this.overlay.getProjection()
        return projection ? projection.fromLatLngToContainerPixel(latLng) : {}
    }

    // View

    getScale(center, zoom) {
        return 156543.03392 * Math.cos(center.lat * Math.PI / 180) / Math.pow(2, zoom)
    }

    getView() {
        const {googleMap} = this
        const center = this.getCenter()
        const zoom = this.getZoom()
        const scale = this.getScale(center, zoom)
        const minZoom = googleMap.minZoom
        const maxZoom = googleMap.maxZoom
        const isMinZoom = zoom === minZoom
        const isMaxZoom = zoom === maxZoom
        return {center, zoom, scale, minZoom, maxZoom, isMinZoom, isMaxZoom}
    }

    setView({center, zoom}) {
        this.setCenter(center)
        this.setZoom(zoom)
    }

    // Center

    toGoogleLocation(latLng) {
        const {google} = this
        return latLng instanceof google.maps.LatLng
            ? latLng
            : new google.maps.LatLng(latLng)
    }

    getCenter() {
        const {googleMap} = this
        const lngLatCenter = googleMap.getCenter()
        return {lat: lngLatCenter.lat(), lng: lngLatCenter.lng()}
    }

    setCenter(center) {
        const {googleMap} = this
        const lngLatCenter = this.toGoogleLocation(center)
        if (!googleMap.getCenter().equals(lngLatCenter)) {
            googleMap.setCenter(lngLatCenter)
        }
    }

    // Zooming

    getZoom() {
        const {googleMap} = this
        const zoom = googleMap.getZoom()
        const sanitizedZoom = Math.min(googleMap.maxZoom, Math.max(googleMap.minZoom, zoom))
        if (sanitizedZoom !== zoom) {
            log.debug(`getZoom: zoom adjusted to fall within range [${googleMap.minZoom} - ${googleMap.maxZoom}]: ${zoom} -> ${sanitizedZoom}`)
        }
        return sanitizedZoom
    }

    setZoom(zoom) {
        const {googleMap} = this
        const sanitizedZoom = Math.min(googleMap.maxZoom, Math.max(googleMap.minZoom, zoom))
        if (sanitizedZoom !== zoom) {
            log.debug(`setZoom: zoom adjusted to fall within range [${googleMap.minZoom} - ${googleMap.maxZoom}]: ${zoom} -> ${sanitizedZoom}`)
        }
        if (googleMap.getZoom() !== sanitizedZoom) {
            googleMap.setZoom(sanitizedZoom)
        }
    }

    zoomIn() {
        const {googleMap} = this
        this.setZoom(googleMap.getZoom() + 1)
    }

    zoomOut() {
        const {googleMap} = this
        this.setZoom(googleMap.getZoom() - 1)
    }

    enableZoomArea() {
        const {google, googleMap} = this
        this.enableDrawingMode({
            drawingMode: google.maps.drawing.OverlayType.RECTANGLE,
            drawingControl: false,
            rectangleOptions: this.drawingOptions
        }, ({overlay: rectangle}) => {
            rectangle.setMap(null)
            googleMap.fitBounds(rectangle.bounds)
            this.cancelZoomArea()
            this.zoomArea$.next()
        })
    }

    cancelZoomArea() {
        this.disableDrawingMode()
    }

    getZoomArea$() {
        return this.zoomArea$
    }

    // Bounds

    fromGoogleBounds(bounds) {
        const {google} = this
        if (bounds && bounds instanceof google.maps.LatLngBounds) {
            const sw = bounds.getSouthWest()
            const ne = bounds.getNorthEast()
            return [
                [sw.lng(), sw.lat()],
                [ne.lng(), ne.lat()]
            ]
        } else {
            return bounds
        }
    }

    toGoogleBounds(bounds) {
        const {google} = this
        if (bounds && bounds instanceof google.maps.LatLngBounds) {
            return bounds
        } else {
            return new google.maps.LatLngBounds(
                {lng: bounds[0][0], lat: bounds[0][1]},
                {lng: bounds[1][0], lat: bounds[1][1]}
            )
        }
    }

    fitBounds(bounds) {
        const PADDING = 2 // compensate for attribution masking
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

    // Markers

    setLocationMarker(options, onRemove) {
        const {google, googleMap} = this
        const marker = new google.maps.Marker({
            label: 'X',
            ...options
        })
        const remove = () => marker.setMap(null)
        marker.addListener('click', onRemove || remove)
        marker.setMap(googleMap)
        return {
            remove
        }
    }

    setAreaMarker(options, onRemove) {
        const {google, googleMap} = this
        const rectangle = new google.maps.Rectangle({
            ...this.drawingOptions,
            fillOpacity: 0,
            strokeOpacity: .5,
            ...options
        })
        const closeMarker = new google.maps.Marker({
            position: options.bounds.getNorthEast(),
            icon: {
                path: 'M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm5 13.59L15.59 17 12 13.41 8.41 17 7 15.59 10.59 12 7 8.41 8.41 7 12 10.59 15.59 7 17 8.41 13.41 12 17 15.59z',
                fillColor: '#c5b397',
                fillOpacity: 1,
                anchor: new google.maps.Point(12, 12),
                scale: 1
            },
            title: options.title
        })
        const remove = () => {
            closeMarker.setMap(null)
            rectangle.setMap(null)
        }
        closeMarker.addListener('click', onRemove || remove)
        rectangle.setMap(googleMap)
        closeMarker.setMap(googleMap)
        return {
            remove
        }
    }

    // Polygon

    drawPolygon(id, callback) {
        this.drawingPolygon = {id, callback}
        this.redrawPolygon()
    }

    redrawPolygon() {
        const {google} = this
        if (this.drawingPolygon) {
            const {callback} = this.drawingPolygon
            this.enableDrawingMode({
                drawingMode: google.maps.drawing.OverlayType.POLYGON,
                drawingControl: false,
                drawingControlOptions: {
                    position: google.maps.ControlPosition.TOP_CENTER,
                    drawingModes: ['polygon']
                },
                circleOptions: this.drawingOptions,
                polygonOptions: this.drawingOptions,
                rectangleOptions: this.drawingOptions
            }, ({overlay: polygon}) => {
                polygon.setMap(null)
                const toPolygonPath = polygon => polygon.getPaths().getArray()[0].getArray().map(latLng =>
                    [latLng.lng(), latLng.lat()]
                )
                callback(toPolygonPath(polygon))
            })
        }
    }

    // Layers

    getLayer(id) {
        return this.layerById[id]
    }

    setLayer({id, layer}) {
        const existingLayer = this.getLayer(id)
        const unchanged = layer === existingLayer || (existingLayer && existingLayer.equals(layer))
        if (unchanged) {
            return false
        }
        this.removeLayer(id)
        if (layer) {
            this.layerById[id] = layer
            layer.initialize()
        }
        return true
    }

    removeLayer(id) {
        const layer = this.getLayer(id)
        if (layer) {
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
        return !!(layer && layer.isInitialized())
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

    interactive(enabled) {
        const {googleMap} = this
        googleMap.setOptions({gestureHandling: enabled ? 'greedy' : 'none'})
    }
}
