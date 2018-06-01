import actionBuilder from 'action-builder'
import ee from 'earthengine-api'
import GoogleMapsLoader from 'google-maps'
import Http from 'http-client'
import PropTypes from 'prop-types'
import React from 'react'
import {Observable, Subject} from 'rxjs'
import {map as rxMap, mergeMap, takeUntil} from 'rxjs/operators'
import {connect, select} from 'store'
import './map.module.css'

export let map = null
export let google = null
let instance = null

const contextById = {}
let currentContextId

export const initGoogleMapsApi$ = () => {
    const loadGoogleMapsApiKey$ =
        Http.get$('/api/data/google-maps-api-key').pipe(
            rxMap((e) => e.response.apiKey)
        )

    const loadGoogleMapsApi$ = (apiKey) => Observable.create((observer) => {
        GoogleMapsLoader.KEY = apiKey
        GoogleMapsLoader.LIBRARIES = ['drawing']
        GoogleMapsLoader.load((g) => {
            google = g
            observer.next(apiKey)
            observer.complete()
        })
    })

    return loadGoogleMapsApiKey$.pipe(
        mergeMap(loadGoogleMapsApi$),
        rxMap((apiKey) => actionBuilder('SET_GOOGLE_MAPS_API_INITIALIZED', {apiKey: apiKey})
            .set('map.apiKey', apiKey)
            .build()
        )
    )
}

const createMap = (mapElement) => {
    instance = new google.maps.Map(mapElement, {
        zoom: 3,
        minZoom: 3,
        maxZoom: 17,
        center: new google.maps.LatLng(16.7794913, 9.6771556),
        mapTypeId: google.maps.MapTypeId.ROADMAP,
        zoomControl: false,
        mapTypeControl: false,
        scaleControl: false,
        streetViewControl: false,
        rotateControl: false,
        fullscreenControl: false,
        backgroundColor: '#131314',
        gestureHandling: 'greedy',
    })
    instance.mapTypes.set('styled_map', new google.maps.StyledMapType(defaultStyle, {name: 'sepalMap'}))
    instance.setMapTypeId('styled_map')
    instance.addListener('zoom_changed', () =>
        actionBuilder('SET_MAP_ZOOM')
            .set('map.zoom', instance.getZoom())
            .dispatch()
    )

    const drawingOptions = {
        fillColor: '#FBFAF2',
        fillOpacity: 0.07,
        strokeColor: '#c5b397',
        strokeOpacity: 1,
        strokeWeight: 2,
        clickable: false,
        editable: false,
        zIndex: 1
    }

    map = {
        getKey() {
            return GoogleMapsLoader.KEY
        },

        getZoom() {
            return instance.getZoom()
        },
        zoomIn() {
            instance.setZoom(instance.getZoom() + 1)
        },
        zoomOut() {
            instance.setZoom(instance.getZoom() - 1)
        },
        isMaxZoom() {
            return instance.getZoom() === instance.maxZoom
        },
        isMinZoom() {
            return instance.getZoom() === instance.minZoom
        },
        addGEELayer(mapId, token) {
            let geeLayer = new ee.MapLayerOverlay('https://earthengine.googleapis.com/map', mapId, token, {name: 'gee'})
            instance.overlayMapTypes.push(geeLayer)
        },
        fitBounds(bounds) {
            const googleBounds = toGoogleBounds(bounds)
            !instance.getBounds().equals(googleBounds) && instance.fitBounds(googleBounds)
        },
        getBounds() {
            return fromGoogleBounds(instance.getBounds())
        },
        onBoundsChanged(listener) {
            return instance.addListener('bounds_changed', listener)
        },
        removeListener(listener) {
            if (listener)
                google.maps.event.removeListener(listener)
        },
        getContext(contextId) {
            let context = contextById[contextId]
            if (!context) {
                const layerById = {}
                context = {
                    setLayer({id, layer, destroy$, onInitialized}) {
                        if (!destroy$)
                            throw new Error('destroy$ is missing')
                        const existingLayer = layerById[id]
                        const unchanged = layer === existingLayer || (existingLayer && existingLayer.equals(layer))
                        if (unchanged)
                            return false
                        this.removeLayer(id)
                        if (layer) {
                            layerById[id] = layer
                            layer.__removed$ = new Subject()
                            layer.initialize$()
                                .pipe(
                                    takeUntil(destroy$),
                                    takeUntil(layer.__removed$)
                                )
                                .subscribe(() => {
                                    currentContextId === contextId && layer.addToMap(instance)
                                    onInitialized && onInitialized(layer)
                                })
                        }
                        return true
                    },
                    removeLayer(id) {
                        const layer = layerById[id]
                        if (!layer)
                            return
                        layer.__removed$.next()
                        if (currentContextId === contextId)
                            layer.removeFromMap(instance)
                        delete layerById[id]
                    },
                    fitLayer(id) {
                        const layer = layerById[id]
                        if (layer && layer.bounds && currentContextId === contextId) {
                            const bounds = layer.bounds
                            map.fitBounds(bounds)
                        }
                    },
                    addToMap() {
                        Object.keys(layerById).forEach(id => layerById[id].addToMap(instance))
                    },
                    removeFromMap() {
                        Object.keys(layerById).forEach(id => layerById[id].removeFromMap(instance))
                    },
                    drawPolygon(id, callback) {
                        this._drawingMode = {id, callback}
                        this._drawingManager = this._drawingManager || new google.maps.drawing.DrawingManager({
                            drawingMode: google.maps.drawing.OverlayType.POLYGON,
                            drawingControl: false,
                            drawingControlOptions: {
                                position: google.maps.ControlPosition.TOP_CENTER,
                                drawingModes: ['polygon']
                            },
                            circleOptions: drawingOptions,
                            polygonOptions: drawingOptions,
                            rectangleOptions: drawingOptions
                        })
                        const drawingListener = (e) => {
                            const polygon = e.overlay
                            polygon.setMap(null)
                            const toPolygonPath = (polygon) => polygon.getPaths().getArray()[0].getArray().map((latLng) =>
                                [latLng.lng(), latLng.lat()]
                            )
                            callback(toPolygonPath(polygon))
                        }
                        google.maps.event.addListener(this._drawingManager, 'overlaycomplete', drawingListener)
                        this._drawingManager.setMap(instance)
                    },
                    pauseDrawingMode() {
                        if (this._drawingManager) {
                            this._drawingManager.setMap(null)
                            google.maps.event.clearListeners(this._drawingManager, 'overlaycomplete')
                        }
                    },
                    disableDrawingMode() {
                        this.pauseDrawingMode()
                        this._drawingMode = null
                    },
                }
                contextById[contextId] = context
            }
            return context
        },
        selectLayers(nextContextId) {
            if (currentContextId === nextContextId)
                return
            const prevContextId = currentContextId
            if (prevContextId) {
                const layers = this.getContext(prevContextId)
                layers.pauseDrawingMode()
                layers.removeFromMap()
            }

            currentContextId = nextContextId
            if (nextContextId) {
                const layers = this.getContext(nextContextId)
                layers.addToMap()
                layers._drawingMode && layers.drawPolygon(layers._drawingMode.id, layers._drawingMode.callback)
            }

        },
        deselectLayers(contextIdToDeselect) {
            if (contextIdToDeselect === currentContextId)
                map.selectLayers()
        },
        removeLayers(contextIdToRemove) {
            if (contextIdToRemove === currentContextId) {
                map.clear()
            }
            delete contextById[contextIdToRemove]
        },
        clear() {
            map.selectLayers()
        }
    }
}

export const fromGoogleBounds = (googleBounds) => {
    const sw = googleBounds.getSouthWest()
    const ne = googleBounds.getNorthEast()
    return [
        [sw.lng(), sw.lat()],
        [ne.lng(), ne.lat()]
    ]
}

const toGoogleBounds = (bounds) => {
    return new google.maps.LatLngBounds(
        {lng: bounds[0][0], lat: bounds[0][1]},
        {lng: bounds[1][0], lat: bounds[1][1]}
    )
}


export const polygonOptions = {
    fillColor: '#FBFAF2',
    fillOpacity: 0.07,
    strokeColor: '#FBFAF2',
    strokeOpacity: 0.15,
    strokeWeight: 1
}

// https://developers.google.com/maps/documentation/javascript/style-reference
const defaultStyle = [
    {stylers: [{visibility: 'simplified'}]},
    {stylers: [{color: '#131314'}]},
    {featureType: 'water', stylers: [{color: '#131313'}, {lightness: 4}]},
    {elementType: 'labels.text.fill', stylers: [{visibility: 'off'}, {lightness: 25}]}
]

const mapStateToProps = () => ({
    apiKey: select('map.apiKey')
})

class Map extends React.Component {
    state = {initialized: false}
    mapElement = React.createRef()

    render() {
        return <div ref={this.mapElement} className={this.props.className}/>
    }

    componentDidUpdate() {
        const apiKey = this.props.apiKey
        if (apiKey && !this.state.initialized) { // Create map once there is an API key
            this.setState((prevState) => ({...prevState, initialized: true}))
            createMap(this.mapElement.current)
            this.initialized = true
        }
    }
}

Map.propTypes = {
    className: PropTypes.string
}

export default connect(mapStateToProps)(Map)
