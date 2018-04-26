import actionBuilder from 'action-builder'
import earthengine from 'earthengine-api'
import GoogleMapsLoader from 'google-maps'
import Http from 'http-client'
import PropTypes from 'prop-types'
import React from 'react'
import Rx from 'rxjs'
import {connect, select} from 'store'
import './map.module.css'

export let map = null
const ee = earthengine.ee
let google = null

export const initGoogleMapsApi$ = () => {
    const loadGoogleMapsApiKey$ =
        Http.get$('/api/data/google-maps-api-key')
            .map((e) => e.response.apiKey)

    const loadGoogleMapsApi$ = (apiKey) => Rx.Observable.create((observer) => {
        GoogleMapsLoader.KEY = apiKey
        GoogleMapsLoader.load((g) => {
            google = g
            observer.next(apiKey)
            observer.complete()
        })
    })

    return loadGoogleMapsApiKey$
        .mergeMap(loadGoogleMapsApi$)
        .map((apiKey) => actionBuilder('SET_GOOGLE_MAPS_API_INITIALIZED', {apiKey: apiKey})
            .set('map.apiKey', apiKey)
            .build()
        )
}

const createMap = (mapElement) => {
    const instance = new google.maps.Map(mapElement, {
        zoom: 3,
        minZoom: 3,
        maxZoom: 15,
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
        styles: defaultStyle
    })
    instance.addListener('zoom_changed', () =>
        actionBuilder('SET_MAP_ZOOM')
            .set('map.zoom', instance.getZoom())
            .dispatch()
    )

    const addLayer = (layer) => {
        instance.overlayMapTypes.push(layer)
    }

    const removeLayer = (name) => {
        let index = instance.overlayMapTypes.getArray().findIndex(x => x.name === name)
        instance.overlayMapTypes.removeAt(index)
    }

    map = {
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
        showLabelsLayer(shown) {
            if (shown)
                addLayer(
                    new google.maps.StyledMapType(labelsLayerStyle, {name: 'labels'})
                )
            else
                removeLayer('labels')
        }
    }
}

// https://developers.google.com/maps/documentation/javascript/style-reference
const defaultStyle = [
    {stylers: [{visibility: 'simplified'}]},
    {stylers: [{color: '#131314'}]},
    {featureType: 'water', stylers: [{color: '#131313'}, {lightness: 4}]},
    {elementType: 'labels.text.fill', stylers: [{visibility: 'off'}, {lightness: 25}]}
]

const labelsLayerStyle = [
    {featureType: 'all', stylers: [{visibility: 'off'}]},
    {featureType: 'road', elementType: 'geometry', stylers: [{visibility: 'on'}]},
    {elementType: 'labels.text.fill', stylers: [{visibility: 'on'}]},
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