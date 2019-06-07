import './map.module.css'
import {NEVER, Observable, Subject} from 'rxjs'
import {compose} from 'compose'
import {connect, select} from 'store'
import {map, mergeMap, takeUntil} from 'rxjs/operators'
import {msg} from 'translate'
import GoogleMapsLoader from 'google-maps'
import Notifications from 'widget/notifications'
import Portal from 'widget/portal'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import actionBuilder from 'action-builder'
import api from 'api'

export let sepalMap = null
export let google = null
export let googleMap = null

const contextById = {}
let currentContextId

const initListeners = []
const onInit = listener => {
    if (google)
        listener(google)
    else
        initListeners.push(listener)
}

export const initGoogleMapsApi$ = () => {
    const loadGoogleMapsApiKey$ =
        api.map.loadApiKey$().pipe(
            map(({apiKey}) => apiKey)
        )

    const loadGoogleMapsApi$ = apiKey => Observable.create(observer => {
        GoogleMapsLoader.KEY = apiKey
        GoogleMapsLoader.VERSION = '3.35'
        GoogleMapsLoader.LIBRARIES = ['drawing']
        GoogleMapsLoader.load(g => {
            google = g
            initListeners.forEach(listener => listener(google))
            observer.next(apiKey)
            observer.complete()
        })
    })

    return loadGoogleMapsApiKey$.pipe(
        mergeMap(loadGoogleMapsApi$),
        map(apiKey => actionBuilder('SET_GOOGLE_MAPS_API_INITIALIZED', {apiKey: apiKey})
            .set('map.apiKey', apiKey)
            .build()
        )
    )
}

const createMap = mapElement => {
    const mapOptions = {
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
        gestureHandling: 'greedy'
    }

    // https://developers.google.com/maps/documentation/javascript/style-reference
    const sepalStyle = new google.maps.StyledMapType([
        {stylers: [{visibility: 'simplified'}]},
        {stylers: [{color: '#131314'}]},
        {featureType: 'transit.station', stylers: [{visibility: 'off'}]},
        {featureType: 'poi', stylers: [{visibility: 'off'}]},
        {featureType: 'water', stylers: [{color: '#191919'}, {lightness: 4}]},
        {elementType: 'labels.text.fill', stylers: [{visibility: 'off'}, {lightness: 25}]}
    ], {name: 'sepalMap'})

    googleMap = new google.maps.Map(mapElement, mapOptions)
    googleMap.mapTypes.set('sepalStyle', sepalStyle)
    googleMap.setMapTypeId('sepalStyle')

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
        setZoom(zoom) {
            return googleMap.setZoom(zoom)
        },
        zoomIn() {
            googleMap.setZoom(googleMap.getZoom() + 1)
        },
        zoomOut() {
            googleMap.setZoom(googleMap.getZoom() - 1)
        },
        getMetersPerPixel() {
            const latitude = googleMap.getCenter().lat()
            const zoom = googleMap.getZoom()
            return Math.round(
                156543.03392 * Math.cos(latitude * Math.PI / 180) / Math.pow(2, zoom)
            )
        },
        isMaxZoom() {
            return googleMap.getZoom() === googleMap.maxZoom
        },
        isMinZoom() {
            return googleMap.getZoom() === googleMap.minZoom
        },
        fitBounds(bounds) {
            const googleBounds = toGoogleBounds(bounds)
            const boundsChanged = !googleMap.getBounds().equals(googleBounds)
            if (boundsChanged)
                googleMap.fitBounds(googleBounds)
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
                const setZooming = zooming =>
                    actionBuilder('SET_MAP_ZOOMING')
                        .set(['map', contextId, 'zooming'], zooming)
                        .dispatch()
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
                                        layer.__initialized__ = true
                                        currentContextId === contextId && layer.addToMap(googleMap)
                                        onInitialized && onInitialized(layer)
                                    },
                                    error => {
                                        if (onError)
                                            onError(error)
                                        else
                                            Notifications.error({message: msg('app.home.body.process.layer.error'), error})
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
                    isLayerInitialized(id) {
                        return !!(this.hasLayer(id) && layerById[id].__initialized__)
                    },
                    hasLayer(id) {
                        return !!layerById[id]
                    },
                    fitLayer(id) {
                        const layer = layerById[id]
                        if (layer && layer.bounds && currentContextId === contextId) {
                            const bounds = layer.bounds
                            sepalMap.fitBounds(bounds)
                        }
                    },
                    addToMap() {
                        Object.keys(layerById).forEach(id => {
                            const layer = layerById[id]
                            if (layer.__initialized__)
                                layer.addToMap(googleMap)
                        })
                    },
                    removeFromMap() {
                        Object.keys(layerById).forEach(id => layerById[id].removeFromMap(googleMap))
                    },
                    zoomArea() {
                        setZooming(true)
                        this._drawingManager = new google.maps.drawing.DrawingManager({
                            drawingMode: google.maps.drawing.OverlayType.RECTANGLE,
                            drawingControl: false,
                            rectangleOptions: drawingOptions
                        })
                        const drawingListener = e => {
                            const rectangle = e.overlay
                            rectangle.setMap(null)
                            googleMap.fitBounds(rectangle.bounds)
                            this.cancelZoomArea()
                        }
                        google.maps.event.addListener(this._drawingManager, 'overlaycomplete', drawingListener)
                        this._drawingManager.setMap(googleMap)

                    },
                    cancelZoomArea() {
                        setZooming(false)
                        this.disableDrawingMode()
                    },
                    isZooming() {
                        const zooming = select(['map', contextId, 'zooming'])
                        return !!zooming
                    },
                    drawPolygon(id, callback) {
                        this._drawingPolygon = {id, callback}
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
                    },
                    pauseDrawingMode() {
                        if (this._drawingManager) {
                            this._drawingManager.setMap(null)
                            google.maps.event.clearListeners(this._drawingManager, 'overlaycomplete')
                        }
                    },
                    disableDrawingMode() {
                        this.pauseDrawingMode()
                        this._drawingPolygon = null
                    },
                }
                contextById[contextId] = context
            }
            return context
        },
        setContext(contextId) {
            if (currentContextId === contextId)
                return
            const prevContextId = currentContextId
            if (prevContextId) {
                const context = this.getContext(prevContextId)
                context.pauseDrawingMode()
                context.removeFromMap()
            }

            currentContextId = contextId
            if (contextId) {
                const context = this.getContext(contextId)
                context.addToMap()
                context._drawingPolygon && context.drawPolygon(context._drawingPolygon.id, context._drawingPolygon.callback)
                context.isZooming() && context.zoomArea()
            }

        },
        clearContext(contextId) {
            if (contextId === currentContextId)
                sepalMap.clear()
        },
        removeContext(contextId) {
            if (contextId === currentContextId) {
                sepalMap.clear()
            }
            delete contextById[contextId]
        },
        clear() {
            sepalMap.setContext()
        }
    }
}

export const fromGoogleBounds = googleBounds => {
    const sw = googleBounds.getSouthWest()
    const ne = googleBounds.getNorthEast()
    return [
        [sw.lng(), sw.lat()],
        [ne.lng(), ne.lat()]
    ]
}

const toGoogleBounds = bounds => {
    return new google.maps.LatLngBounds(
        {lng: bounds[0][0], lat: bounds[0][1]},
        {lng: bounds[1][0], lat: bounds[1][1]}
    )
}

export const polygonOptions = fill => ({
    fillColor: '#FBFAF2',
    fillOpacity: fill ? 0.07 : 0.000000000000000000000000000001,
    strokeColor: '#FBFAF2',
    strokeOpacity: 0.5,
    strokeWeight: 1
})

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
            this.setState({initialized: true})
            createMap(this.mapElement.current)
            this.initialized = true
        }
    }
}

Map.propTypes = {
    className: PropTypes.string
}

export default compose(
    Map,
    connect(mapStateToProps)
)

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
            ? <Portal type='container' content={content} container={mapPanes.overlayMouseTarget}/>
            : null
    }

    componentWillUnmount() {
        this.overlay.setMap(null)
    }
}

class WrappedMapObject extends React.Component {
    render() {
        const {lat, lng, width, height, className, children} = this.props
        const shown = googleMap.getBounds().contains({lng, lat})
        if (!shown)
            return null
        return (
            <ProjectionContext.Consumer>
                {projection => {
                    if (!projection)
                        return null
                    const point = projection.fromLatLngToDivPixel(new google.maps.LatLng(lat, lng))
                    const style = {
                        position: 'absolute',
                        top: `calc(${point.y}px - ${height} / 2)`,
                        left: `calc(${point.x}px - ${width} / 2)`
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

export const MapObject = connect(state => ({projectionChange: state.map.projectionChange}))(
    WrappedMapObject
)

const ProjectionContext = React.createContext()

let ReactOverlayView
onInit(google =>
    ReactOverlayView = class ReactOverlayView extends google.maps.OverlayView {
        constructor(component) {
            super()
            this.component = component
            this.xyz = null

        }

        onAdd() {
            this.show(true)
        }

        draw() {
            const projection = this.getProjection() // TODO: Zooming changes the projection...
            const point = projection.fromLatLngToDivPixel(new google.maps.LatLng(0, 0))
            const xyz = [point.x, point.y, sepalMap.getZoom()]
            if (!_.isEqual(this.xyz, xyz)) {
                this.xyz = xyz
                this.component.setState({projection})
                actionBuilder('PROJECTION_CHANGED', {xyz})
                    .set('map.projectionChange', xyz)
                    .dispatch()
            }
        }

        onRemove() {
            this.show(false)
            google.maps.event.removeListener(this.projectionChangeListener)
        }

        show(shown) {
            this.component.setState({shown: shown})
        }
    })
