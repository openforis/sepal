import GoogleMapsLoader from 'google-maps'
import PropTypes from 'prop-types'
import React from 'react'
import {connect} from 'store'
import actionBuilder from 'action-builder'

const mapStateToProps = () => {
}

export let map = null

const initMap = (mapElement) => {
    GoogleMapsLoader.KEY = 'AIzaSyAIi2lE7w25HZOrJkWT-qHH01W-ywyrC0U'
    let instance = null
    GoogleMapsLoader.load((google) => {
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
        instance.setOptions({ styles: defaultStyle })
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
        }
    }
}
class Map extends React.Component {
    constructor(props) {
        super(props)
        this.mapElement = React.createRef()
    }
    render() {
        return (
            <div ref={this.mapElement} className={this.props.className}/>
        )
    }

    componentDidMount() {
        initMap(this.mapElement.current)
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