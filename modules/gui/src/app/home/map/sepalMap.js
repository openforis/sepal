import _ from 'lodash'
import {Subject} from 'rxjs'
import {TerraDraw, TerraDrawPolygonMode, TerraDrawRectangleMode} from 'terra-draw'
import {TerraDrawGoogleMapsAdapter} from 'terra-draw-google-maps-adapter'

import {getLogger} from '~/log'

import {
    DRAWING_COORDINATE_PRECISION,
    otherPolygonIds,
    toAdapterLib,
    toBounds,
    toPolygonFeature,
    toPolygonPath
} from './drawing'

const log = getLogger('sepalMap')

export class SepalMap {
    constructor({google, googleMap, renderingEnabled$, renderingStatus$}) {
        log.debug('creating new SepalMap')
        this.google = google
        this.googleMap = googleMap
        this.renderingEnabled$ = renderingEnabled$
        this.renderingStatus$ = renderingStatus$
        this.toGoogleBounds = this.toGoogleBounds.bind(this)
        this.zoomIn = this.zoomIn.bind(this)
        this.zoomOut = this.zoomOut.bind(this)
        this.setZoom = this.setZoom.bind(this)
        this.getZoom = this.getZoom.bind(this)
        this.setView = this.setView.bind(this)
        this.fitBounds = this.fitBounds.bind(this)
        this.getBounds = this.getBounds.bind(this)
        this.getGoogle = this.getGoogle.bind(this)

        // const cursorSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
        // cursorSvg.setAttribute('path', `
        //     M 1 -3 L 0 -2 L -1 -3 H -1 V -15 H 1 V -3 Z
        //     M 3 -1 L 2 0 L 3 1 V 1 H 15 V -1 H 15 Z
        //     M 1 3 L 0 2 L -1 3 H -1 V 15 H 1 Z
        //     M -3 1 L -2 0 L -3 -1 V -1 H -15 V 1 Z
        //     M -15 -15 H -7 V -13 H -13 V -7 H -15 V -7 Z
        //     M 15 -15 H 7 V -13 H 13 V -7 H 15 V -12 Z
        //     M 15 15 V 7 H 13 V 13 H 7 V 15 H 7 Z
        //     M -15 15 H -7 V 13 H -13 V 7 H -15 V 7 Z
        // `)
        // cursorSvg.setAttribute('fillColor', 'white')
        // cursorSvg.setAttribute('fillOpacity', 1)
        // cursorSvg.setAttribute('strokeColor', 'black')
        // cursorSvg.setAttribute('strokeOpacity', 1)

        this.cursor = new google.maps.marker.Marker({
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

        // const crosshairSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
        // crosshairSvg.setAttribute('path', `
        //     M 0 0 L 100 0
        //     M 0 0 L 0 -100
        //     M 0 0 L -100 0
        //     M 0 0 L 0 100
        // `)
        // crosshairSvg.setAttribute('strokeColor', 'white')
        // crosshairSvg.setAttribute('strokeOpacity', 1)

        this.crosshair = new google.maps.marker.Marker({
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
    removeLayer$ = new Subject()

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
    drawing = null
    drawingListener = null
    drawingChangeListener = null
    drawingKeydownListener = null
    drawingChangesSuppressed = false
    drawingFeatureId = null
    polygonPreview = null

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
            remove: () => google.maps.core.event.removeListener(listenerId)
        }
    }

    addClickListener(listener) {
        const {google, googleMap} = this
        const listenerId = googleMap.addListener('click', ({latLng: {lat, lng}}) => listener({lat: lat(), lng: lng()}))
        googleMap.setOptions({draggableCursor: 'crosshair'})
        return {
            remove: () => {
                googleMap.setOptions({draggableCursor: 'pointer'})
                return google.maps.core.event.removeListener(listenerId)
            }
        }
    }

    // Drawing mode

    drawingStyles() {
        const {fillColor, fillOpacity, strokeColor, strokeWeight} = this.drawingOptions
        return {fillColor, fillOpacity, outlineColor: strokeColor, outlineWidth: strokeWeight}
    }

    // Rectangle styling accepts the four shared keys only, so the vertex markers stay polygon-only.
    polygonStyles() {
        const styles = this.drawingStyles()
        return {
            ...styles,
            coordinatePointColor: styles.fillColor,
            coordinatePointOutlineColor: styles.outlineColor,
            coordinatePointWidth: 5,
            coordinatePointOutlineWidth: 1
        }
    }

    getDrawing() {
        const {google, googleMap} = this
        if (!this.drawing) {
            const lib = toAdapterLib(google)
            this.drawing = new TerraDraw({
                adapter: new TerraDrawGoogleMapsAdapter({
                    lib,
                    map: googleMap,
                    coordinatePrecision: DRAWING_COORDINATE_PRECISION
                }),
                modes: [
                    new TerraDrawPolygonMode({
                        styles: this.polygonStyles(),
                        editable: true,
                        showCoordinatePoints: true
                    }),
                    new TerraDrawRectangleMode({
                        styles: this.drawingStyles(),
                        drawInteraction: 'click-move-or-drag'
                    })
                ]
            })
        }
        return this.drawing
    }

    // Starts the store over rather than deleting the older polygon in place, which would strand its
    // vertex points: there is no afterFeatureDeleted hook to clean them up.
    retainOnly(drawing, feature) {
        if (!feature || !otherPolygonIds(drawing.getSnapshot(), feature.id).length) {
            return
        }
        drawing.clear()
        drawing.addFeatures([toPolygonFeature(toPolygonPath(feature))])
    }

    clearPolygonPreview() {
        if (this.polygonPreview) {
            this.polygonPreview.setMap(null)
            this.polygonPreview = null
        }
    }

    setPolygonPreview(path) {
        if (!this.polygonPreview) {
            this.drawingChangesSuppressed = true
            try {
                this.drawing.clear()
            } finally {
                this.drawingChangesSuppressed = false
            }
            this.polygonPreview = new this.google.maps.Polygon(this.drawingOptions)
            this.polygonPreview.setMap(this.googleMap)
        }
        this.polygonPreview.setPath(path.map(([lng, lat]) => ({lng, lat})))
    }

    setPolygonDrawing(path) {
        const {drawing} = this
        this.clearPolygonPreview()
        this.drawingChangesSuppressed = true
        try {
            if (!path?.length) {
                drawing.clear()
                return
            }
            const [validation] = drawing.addFeatures([toPolygonFeature(path)])
            if (validation.valid) {
                this.retainOnly(drawing, drawing.getSnapshotFeature(validation.id))
            } else {
                log.warn(`Saved polygon could not be loaded for editing: ${validation.reason}`)
            }
        } finally {
            this.drawingChangesSuppressed = false
        }
    }

    enableDrawingMode(mode, callback, {retain = false, onChange} = {}) {
        this.disableDrawingMode()
        const drawing = this.getDrawing()
        // Editing an existing shape finishes too, as an 'edit' or 'deleteCoordinate'.
        this.drawingListener = id => {
            this.clearPolygonPreview()
            this.drawingFeatureId = null
            const feature = drawing.getSnapshotFeature(id)
            if (retain) {
                this.retainOnly(drawing, feature)
            } else {
                drawing.clear()
            }
            if (feature) {
                callback(feature)
            } else {
                log.warn(`Drawn feature ${id} is missing from the store`)
            }
        }
        drawing.on('finish', this.drawingListener)
        if (onChange) {
            this.drawingChangeListener = (ids, type, context) => {
                if (this.drawingChangesSuppressed || context?.origin === 'api') {
                    return
                }
                const feature = ids
                    .map(id => drawing.getSnapshotFeature(id))
                    .find(feature => feature?.geometry.type === 'Polygon' && feature.properties.mode === mode)
                if (feature) {
                    this.clearPolygonPreview()
                    this.drawingFeatureId = feature.id
                    onChange(feature)
                } else if (type === 'delete' && ids.includes(this.drawingFeatureId)) {
                    this.drawingFeatureId = null
                    onChange(null)
                }
            }
            drawing.on('change', this.drawingChangeListener)
        }
        if (!drawing.enabled) {
            drawing.start()
        }
        drawing.setMode(mode)
        this.drawingKeydownListener = event => {
            // TerraDraw cancels provisional features on keyup; keep the competing Escape keydown map-local.
            if (event.key === 'Escape' && drawing.getModeState() === 'drawing') {
                event.stopPropagation()
            }
        }
        this.googleMap.getDiv().addEventListener('keydown', this.drawingKeydownListener)
    }

    disableDrawingMode() {
        const {drawing, drawingListener, drawingChangeListener, drawingKeydownListener} = this
        this.clearPolygonPreview()
        if (drawingKeydownListener) {
            this.googleMap.getDiv().removeEventListener('keydown', drawingKeydownListener)
            this.drawingKeydownListener = null
        }
        this.drawingFeatureId = null
        if (drawing) {
            if (drawingListener) {
                drawing.off('finish', drawingListener)
                this.drawingListener = null
            }
            if (drawingChangeListener) {
                drawing.off('change', drawingChangeListener)
                this.drawingChangeListener = null
            }
            if (drawing.enabled) {
                drawing.setMode('static')
                drawing.stop()
            }
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
        return latLng instanceof google.maps.core.LatLng
            ? latLng
            : new google.maps.core.LatLng(latLng)
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

    // Zoom

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

    enableZoomArea(callback) {
        log.debug('enableZoomArea')
        this.enableDrawingMode('rectangle', feature => {
            this.fitBounds(toBounds(feature))
            callback()
        })
    }

    disableZoomArea() {
        log.debug('disableZoomArea')
        this.disableDrawingMode()
    }

    // Polygon

    enablePolygonDrawing(callback, getPath, onChange) {
        log.debug('enablePolygonDrawing')
        this.enableDrawingMode('polygon', feature => callback(toPolygonPath(feature)), {
            retain: true,
            onChange: onChange && (feature => onChange(feature ? toPolygonPath(feature) : null))
        })
        const path = getPath && getPath()
        this.setPolygonDrawing(path)
    }

    disablePolygonDrawing() {
        log.debug('disablePolygonDrawing')
        this.disableDrawingMode()
    }

    // Bounds

    fromGoogleBounds(bounds) {
        const {google} = this
        if (bounds && bounds instanceof google.maps.core.LatLngBounds) {
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
        if (bounds && bounds instanceof google.maps.core.LatLngBounds) {
            return bounds
        } else {
            return new google.maps.core.LatLngBounds(
                {lng: bounds[0][0], lat: bounds[0][1]},
                {lng: bounds[1][0], lat: bounds[1][1]}
            )
        }
    }

    fitBounds(bounds) {
        const {googleMap} = this
        const nextBounds = this.toGoogleBounds(bounds)
        const currentBounds = googleMap.getBounds()
        const boundsChanged = !currentBounds || !currentBounds.equals(nextBounds)
        if (boundsChanged) {
            googleMap.fitBounds(nextBounds)
        }
    }

    getBounds() {
        const {googleMap} = this
        return this.fromGoogleBounds(googleMap.getBounds())
    }

    // Markers

    setLocationMarker(options, onRemove) {
        const {google, googleMap} = this
        const marker = new google.maps.marker.Marker({
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
        const closeMarker = new google.maps.marker.Marker({
            position: options.bounds.getNorthEast(),
            icon: {
                path: 'M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm5 13.59L15.59 17 12 13.41 8.41 17 7 15.59 10.59 12 7 8.41 8.41 7 12 10.59 15.59 7 17 8.41 13.41 12 17 15.59z',
                fillColor: '#c5b397',
                fillOpacity: 1,
                anchor: new google.maps.core.Point(12, 12),
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

    // Layers

    getLayer(id) {
        return this.layerById[id]
    }

    setLayer({id, layer}) {
        const existingLayer = this.getLayer(id)
        const unchanged = layer === existingLayer || (existingLayer && existingLayer.equals(layer))
        if (unchanged) {
            // Keeping the mounted layer is what avoids a map-id refetch, but its index may still have moved.
            if (layer?.layerIndex !== undefined) {
                existingLayer.setLayerIndex(layer.layerIndex)
            }
            return false
        }
        this.removeLayer(id)
        if (layer) {
            this.layerById[id] = layer
            layer.add()
        }
        return true
    }

    removeLayer(id) {
        const layer = this.getLayer(id)
        if (layer) {
            layer.remove()
            delete this.layerById[id]
        }
    }

    removeAllLayers() {
        _.forEach(this.layerById, layer => this.removeLayer(layer))
    }

    toggleableLayers() {
        return _.orderBy(Object.values(this.layerById).filter(layer => layer.toggleable), ['layerIndex'])
    }

    setVisibility(visible) {
        log.debug(`Visibility ${visible ? 'on' : 'off'}`)
        _.forEach(this.layerById, layer =>
            layer.setVisibility(visible)
        )
    }

    interactive(enabled) {
        const {googleMap} = this
        googleMap.setOptions({gestureHandling: enabled ? 'greedy' : 'none'})
    }
}
