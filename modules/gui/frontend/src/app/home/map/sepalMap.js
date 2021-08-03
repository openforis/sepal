import {Subject} from 'rxjs'
import {getLogger} from 'log'
import _ from 'lodash'

const log = getLogger('sepalMap')

export class SepalMap {
    constructor(google, googleMap) {
        log.debug('creating new SepalMap')
        this.google = google
        this.googleMap = googleMap

        const svgMarker = {
            // path: 'M10.453 14.016l6.563-6.609-1.406-1.406-5.156 5.203-2.063-2.109-1.406 1.406zM12 2.016q2.906 0 4.945 2.039t2.039 4.945q0 1.453-0.727 3.328t-1.758 3.516-2.039 3.070-1.711 2.273l-0.75 0.797q-0.281-0.328-0.75-0.867t-1.688-2.156-2.133-3.141-1.664-3.445-0.75-3.375q0-2.906 2.039-4.945t4.945-2.039z',
            path: `M 254.81,234.00
           C 254.81,245.49 245.49,254.81 234.00,254.81
             222.51,254.81 213.19,245.49 213.19,234.00
             213.19,222.51 222.51,213.19 234.00,213.19
             245.49,213.19 254.81,222.51 254.81,234.00 Z
           M 435.49,435.49
           C 435.49,435.49 363.80,435.49 363.80,435.49
             363.80,435.49 363.80,468.00 363.80,468.00
             363.80,468.00 468.00,468.00 468.00,468.00
             468.00,468.00 468.00,363.80 468.00,363.80
             468.00,363.80 435.49,363.80 435.49,363.80
             435.49,363.80 435.49,435.49 435.49,435.49 Z
           M 0.00,468.00
           C 0.00,468.00 104.20,468.00 104.20,468.00
             104.20,468.00 104.20,435.49 104.20,435.49
             104.20,435.49 32.51,435.49 32.51,435.49
             32.51,435.49 32.51,363.80 32.51,363.80
             32.51,363.80 0.00,363.80 0.00,363.80
             0.00,363.80 0.00,468.00 0.00,468.00 Z
           M 468.00,0.00
           C 468.00,0.00 363.80,0.00 363.80,0.00
             363.80,0.00 363.80,32.51 363.80,32.51
             363.80,32.51 435.49,32.51 435.49,32.51
             435.49,32.51 435.49,104.20 435.49,104.20
             435.49,104.20 468.00,104.20 468.00,104.20
             468.00,104.20 468.00,0.00 468.00,0.00 Z
           M 32.51,32.51
           C 32.51,32.51 104.20,32.51 104.20,32.51
             104.20,32.51 104.20,0.00 104.20,0.00
             104.20,0.00 0.00,0.00 0.00,0.00
             0.00,0.00 0.00,104.20 0.00,104.20
             0.00,104.20 32.51,104.20 32.51,104.20
             32.51,104.20 32.51,32.51 32.51,32.51 Z`,
            fillColor: 'white',
            fillOpacity: 1,
            strokeColor: 'black',
            strokeOpacity: 1,
            strokeWeight: 0.5,
            rotation: 0,
            scale: 0.045,
            anchor: new google.maps.Point(234, 234),
        }

        this.marker = new google.maps.Marker({
            clickable: false,
            draggable: false,
            icon: svgMarker
        })
        this.marker.setMap(googleMap)

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

    // Cursor

    setCursor(latLng) {
        this.marker.setPosition(latLng)
    }

    latLngToPixel(latLng) {
        // return this.overlay.getProjection().fromLatLngToDivPixel(latLng)
        const projection = this.overlay.getProjection()
        return projection ? projection.fromLatLngToContainerPixel(latLng) : {}
    }

    // View

    getView() {
        const center = this.getCenter()
        const zoom = this.getZoom()
        const bounds = this.getBounds()
        return {center, zoom, bounds}
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

    isMaxZoom() {
        const {googleMap} = this
        return googleMap.getZoom() === googleMap.maxZoom
    }

    isMinZoom() {
        const {googleMap} = this
        return googleMap.getZoom() === googleMap.minZoom
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
        const {google} = this
        const PADDING = 2 // compensate for attribution masking
        const {googleMap} = this
        const nextBounds = bounds instanceof google.maps.LatLngBounds
            ? bounds
            : this.toGoogleBounds(bounds)
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
        const {google, googleMap} = this
        if (this.drawingPolygon) {
            this.disableDrawingMode()
            const {callback} = this.drawingPolygon
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
