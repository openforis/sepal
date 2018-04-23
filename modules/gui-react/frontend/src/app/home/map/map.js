import actionBuilder from 'action-builder'
import GoogleMapsLoader from 'google-maps'
import Http from 'http-client'
import PropTypes from 'prop-types'
import React from 'react'
import earthengine from 'earthengine-api'
import {connect, select} from 'store'

const mapStateToProps = () => ({
    apiKey: select('map.apiKey')
})

export let map = null

export const loadGoogleMapsApiKey$ = () =>
    Http.get$('/api/data/google-maps-api-key')
        .map((e) => actionBuilder('SET_GOOGLE_MAPS_API_KEY', {apiKey: e.response})
            .set('map.apiKey', e.response.apiKey)
            .build()
        )

const initMap = (mapElement, apiKey) => {
    console.log('apiKey', apiKey)
    GoogleMapsLoader.KEY = apiKey
    let googleInstance = null
    let ee = earthengine.ee
    let instance = null
    GoogleMapsLoader.load((google) => {
        googleInstance = google
        instance = new google.maps.Map(mapElement, {
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
            gestureHandling: 'greedy'
        })
        instance.setOptions({styles: defaultStyle})
        instance.addListener('zoom_changed', () =>
            actionBuilder('SET_MAP_ZOOM')
                .set('map.zoom', instance.getZoom())
                .dispatch()
        )
    })

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
            let  geeLayer = new ee.MapLayerOverlay('https://earthengine.googleapis.com/map', mapId, token, { name: 'gee' })
           instance.overlayMapTypes.push(geeLayer);
        },
        showLabelsLayer(shown) {
            // https://developers.google.com/maps/documentation/javascript/style-reference
            if (shown) {
                var labelsLayerStyle = [
                    {
                        featureType: 'all',
                        stylers: [
                            {visibility: 'off'}
                        ]
                    }, {
                        elementType: 'labels.text.fill',
                        stylers: [
                            { visibility: 'on' }
                        ],
                    }, {
                        featureType: 'road',
                        elementType: 'geometry',
                        stylers: [
                            { visibility: 'on' }
                        ]
                    }
                ]
                let labelsLayer = new googleInstance.maps.StyledMapType(labelsLayerStyle, { name: 'labels' })
                instance.overlayMapTypes.push(labelsLayer)
            } else {
                let index = instance.overlayMapTypes.getArray().findIndex(x => x.name === 'labels')
                instance.overlayMapTypes.removeAt(index)
            }
        }
    }
}

class Map extends React.Component {
    state = {initialized: false}
    mapElement = React.createRef()

    render() {
        return <div ref={this.mapElement} className={this.props.className}/>
    }

    componentDidUpdate() {
        const apiKey = this.props.apiKey
        if (apiKey && !this.state.initialized) {
            this.setState((prevState) => ({...prevState, initialized: true}))
            initMap(this.mapElement.current, apiKey)
            this.initialized = true
        }
    }
}

const defaultStyle = [
    {'stylers': [{'visibility': 'simplified'}]},
    {'stylers': [{'color': '#131314'}]},
    {'featureType': 'water', 'stylers': [{'color': '#131313'}, {'lightness': 4}]},
    {'elementType': 'labels.text.fill', 'stylers': [{'visibility': 'off'}, {'lightness': 25}]}
]

Map.propTypes = {
    className: PropTypes.string
}

export default connect(mapStateToProps)(Map)