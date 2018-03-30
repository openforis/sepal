import GoogleMapsLoader from 'google-maps'
import PropTypes from 'prop-types'
import React from 'react'
import {connect} from 'store'
import styles from './map.module.css'

const mapStateToProps = () => {
}

class Map extends React.Component {

    render() {
        const {className} = this.props
        return (
            <div className={[styles.mapContainer, className].join(' ')}>
                <div
                    ref={(mapElement) => this.mapElement = mapElement}
                    className={styles.map}/>
                {/*<div className={styles.mapOverlay}/>*/}
            </div>
        )
    }

    componentDidMount() {
        // const options = {KEY: 'AIzaSyAIi2lE7w25HZOrJkWT-qHH01W-ywyrC0U'}
        const options = {}
        GoogleMapsLoader.KEY = 'AIzaSyAIi2lE7w25HZOrJkWT-qHH01W-ywyrC0U'
        GoogleMapsLoader.load((google) => {
            this.map = new google.maps.Map(this.mapElement, {
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

            this.map.setOptions({styles: defaultStyle})

        })
    }
}

const defaultStyle = [
    {
        "stylers": [ { "visibility": "simplified" } ]
    }
    , {
        "stylers": [ { "color": "#131314" } ]
    }
    , {
        "featureType": "water",
        "stylers"    : [ { "color": "#131313" }, { "lightness": 4 }
        ]
    }
    , {
        "elementType": "labels.text.fill"
        , "stylers"  : [ { "visibility": "off" }, { "lightness": 25 } ]
    }
]


Map.propTypes = {
    className: PropTypes.string
}

export default Map = connect(mapStateToProps)(Map)