import actionBuilder from 'action-builder'
import earthengine from 'earthengine-api'
import GoogleMapsLoader from 'google-maps'
import Http from 'http-client'
import PropTypes from 'prop-types'
import React from 'react'
import {Observable} from 'rxjs'
import {map as rxMap, mergeMap} from 'rxjs/operators'
import {connect, select} from 'store'
import './map.module.css'

export let map = null
export const ee = earthengine.ee
export let google = null
let instance = null
let drawingManager = null

const layers = {}

const setLayer = (id, layer) => {
    if (id in layers) {
        const currentLayer = layers[id]
        if (currentLayer && currentLayer.equals(layer))
            return false
        removeLayer(id)
    }
    if (layer) {
        layer.addToMap(instance)
        layers[id] = layer
    }
    return true
}

const removeLayer = (id) => {
    if (layers[id])
        layers[id].removeFromMap(instance)
    delete layers[id]
}


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
        // styles: defaultStyle
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
        fitLayer(mapObjectName) {
            const mapObject = layers[mapObjectName]
            if (mapObject && mapObject.bounds) {
                const bounds = mapObject.bounds
                !instance.getBounds().equals(bounds) && instance.fitBounds(bounds)
            }
        },
        fitBounds(bounds) {
            instance.fitBounds(bounds)
        },
        getBounds() {
            return instance.getBounds()
        },
        drawPolygon(id, callback) {
            if (drawingManager === null) {
                drawingManager = new google.maps.drawing.DrawingManager({
                    drawingMode: google.maps.drawing.OverlayType.POLYGON,
                    drawingControl: false,
                    drawingControlOptions: {
                        position: google.maps.ControlPosition.TOP_CENTER,
                        // drawingModes: [ 'marker', 'circle', 'polygon', 'polyline', 'rectangle' ]
                        drawingModes: ['polygon']
                    },
                    circleOptions: drawingOptions,
                    polygonOptions: drawingOptions,
                    rectangleOptions: drawingOptions
                })
            }
            const drawingListener = (e) => {
                const polygon = e.overlay
                polygon.setMap(null)
                const toPolygonPath = (polygon) => polygon.getPaths().getArray()[0].getArray().map((latLng) =>
                    [latLng.lng(), latLng.lat()]
                )
                callback(toPolygonPath(polygon))
            }
            google.maps.event.addListener(drawingManager, 'overlaycomplete', drawingListener)
            drawingManager.setMap(instance)
        },
        disableDrawingMode() {
            if (drawingManager) {
                drawingManager.setMap(null)
                drawingManager = null
            }
        },
        getLayer(id) {
            return layers[id]
        },
        setLayer({id, layer}) {
            return setLayer(id, layer)
        },
        removeLayer(id) {
            removeLayer(id)
        }
    }
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