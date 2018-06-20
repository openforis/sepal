import actionBuilder from 'action-builder'
import Notifications from 'app/notifications'
import ee from 'earthengine-api'
import GoogleMapsLoader from 'google-maps'
import Http from 'http-client'
import PropTypes from 'prop-types'
import React from 'react'
import ReactDOM from 'react-dom'
import {NEVER, Observable, Subject} from 'rxjs'
import {map, mergeMap, takeUntil} from 'rxjs/operators'
import {connect, select} from 'store'
import './map.module.css'

export let sepalMap = null
export let google = null
export let googleMap = null

const contextById = {}
let currentContextId

const initListeners = []
const onInit = (listener) => {
    if (google)
        listener(google)
    else
        initListeners.push(listener)
}

export const initGoogleMapsApi$ = () => {
    const loadGoogleMapsApiKey$ =
        Http.get$('/api/data/google-maps-api-key').pipe(
            map((e) => e.response.apiKey)
        )

    const loadGoogleMapsApi$ = (apiKey) => Observable.create((observer) => {
        GoogleMapsLoader.KEY = apiKey
        GoogleMapsLoader.LIBRARIES = ['drawing']
        GoogleMapsLoader.load((g) => {
            google = g
            initListeners.forEach((listener) => listener(google))
            observer.next(apiKey)
            observer.complete()
        })
    })

    return loadGoogleMapsApiKey$.pipe(
        mergeMap(loadGoogleMapsApi$),
        map((apiKey) => actionBuilder('SET_GOOGLE_MAPS_API_INITIALIZED', {apiKey: apiKey})
            .set('map.apiKey', apiKey)
            .build()
        )
    )
}

const createMap = (mapElement) => {
    googleMap = new google.maps.Map(mapElement, {
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
    googleMap.mapTypes.set('styled_map', new google.maps.StyledMapType(defaultStyle, {name: 'sepalMap'}))
    googleMap.setMapTypeId('styled_map')
    googleMap.addListener('zoom_changed', () =>
        actionBuilder('SET_MAP_ZOOM')
            .set('map.zoom', googleMap.getZoom())
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

    sepalMap = {
        getKey() {
            return GoogleMapsLoader.KEY
        },

        getZoom() {
            return googleMap.getZoom()
        },
        zoomIn() {
            googleMap.setZoom(googleMap.getZoom() + 1)
        },
        zoomOut() {
            googleMap.setZoom(googleMap.getZoom() - 1)
        },
        isMaxZoom() {
            return googleMap.getZoom() === googleMap.maxZoom
        },
        isMinZoom() {
            return googleMap.getZoom() === googleMap.minZoom
        },
        addGEELayer(mapId, token) {
            let geeLayer = new ee.MapLayerOverlay('https://earthengine.googleapis.com/map', mapId, token, {name: 'gee'})
            googleMap.overlayMapTypes.push(geeLayer)
        },
        fitBounds(bounds) {
            const googleBounds = toGoogleBounds(bounds)
            !googleMap.getBounds().equals(googleBounds) && googleMap.fitBounds(googleBounds)
        },
        getBounds() {
            return fromGoogleBounds(googleMap.getBounds())
        },
        onBoundsChanged(listener) {
            return googleMap.addListener('bounds_changed', listener)
        },
        addListener(mapObject, event, listener) {
            return google.maps.event.addListener(mapObject, event, listener)
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
                    setLayer({id, layer, destroy$ = NEVER, onInitialized, onError}) {
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
                                .subscribe(
                                    () => {
                                        currentContextId === contextId && layer.addToMap(googleMap)
                                        onInitialized && onInitialized(layer)
                                    },
                                    (e) => {
                                        if (onError)
                                            onError()
                                        else
                                            Notifications.caught('map.layer', {}, e)
                                                .dispatch()
                                    }
                                )
                        }
                        return true
                    },
                    hideLayer(id, hidden) {
                        const layer = layerById[id]
                        if (layer)
                            layer.hide(googleMap, hidden)
                    },
                    removeLayer(id) {
                        const layer = layerById[id]
                        if (!layer)
                            return
                        layer.__removed$.next()
                        if (currentContextId === contextId)
                            layer.removeFromMap(googleMap)
                        delete layerById[id]
                    },
                    fitLayer(id) {
                        const layer = layerById[id]
                        if (layer && layer.bounds && currentContextId === contextId) {
                            const bounds = layer.bounds
                            sepalMap.fitBounds(bounds)
                        }
                    },
                    addToMap() {
                        Object.keys(layerById).forEach(id => layerById[id].addToMap(googleMap))
                    },
                    removeFromMap() {
                        Object.keys(layerById).forEach(id => layerById[id].removeFromMap(googleMap))
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
                        this._drawingManager.setMap(googleMap)
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
                sepalMap.clear()
        },
        removeLayers(contextIdToRemove) {
            if (contextIdToRemove === currentContextId) {
                sepalMap.clear()
            }
            delete contextById[contextIdToRemove]
        },
        clear() {
            sepalMap.selectLayers()
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


export const polygonOptions = (fill) => ({
    fillColor: '#FBFAF2',
    fillOpacity: fill ? 0.07 : 0.000000000000000000000000000001,
    strokeColor: '#FBFAF2',
    strokeOpacity: 0.15,
    strokeWeight: 1
})

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


export class MapLayer extends React.Component {
    state = {
        shown:
            false, projection: null
    }

    constructor(props) {
        super(props)
        this.overlay = new ReactOverlayView(this)
        this.overlay.setMap(googleMap)
    }

    render() {
        const {shown, projection} = this.state
        const {className, children} = this.props
        const mapPanes = this.overlay.getPanes()
        const content = (
            <div className={className}>
                <ProjectionContext.Provider value={projection}>
                    {children}
                </ProjectionContext.Provider>
            </div>
        )
        return shown && mapPanes
            ? ReactDOM.createPortal(content, mapPanes.overlayMouseTarget)
            : null
    }

    componentWillUnmount() {
        this.overlay.setMap(null)
    }
}

export class MapObject extends React.Component {
    render() {
        const {lat, lng, width, height, className, children} = this.props
        return (
            <ProjectionContext.Consumer>
                {projection => {
                    if (!projection)
                        return null
                    const point = projection.fromLatLngToDivPixel(new google.maps.LatLng(lat, lng))
                    const style = {
                        position: 'absolute',
                        top: `calc(${point.y}px - ${height} / 2)`,
                        left: `calc(${point.x}px - ${width} /2)`
                    }
                    return <div style={style} className={className}>
                        {children}
                    </div>
                }
                }
            </ProjectionContext.Consumer>
        )
    }
}

const ProjectionContext = React.createContext()

let ReactOverlayView
onInit((google) =>
    ReactOverlayView = class ReactOverlayView extends google.maps.OverlayView {
        constructor(component) {
            super()
            this.component = component
        }

        onAdd() {
            this.show(true)
        }

        draw() {
            this.component.setState((prevState) => ({...prevState, projection: this.getProjection()}))
        }

        onRemove() {
            this.show(false)
        }

        show(shown) {
            this.component.setState((prevState) => ({...prevState, shown: shown}))
        }
    })
