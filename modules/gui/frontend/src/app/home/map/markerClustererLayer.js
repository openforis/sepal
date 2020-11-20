import {of} from 'rxjs'
import MarkerClusterer from '@googlemaps/markerclustererplus'
import _ from 'lodash'
import styles from './markerClustererLayer.module.css'

export default class MarkerClustererLayer {
    constructor({mapContext: {google, googleMap, sepalMap}, id, label, description}) {
        this.type = 'MarkerClustererLayer'
        this.toggleable = true
        this.google = google
        this.googleMap = googleMap
        this.sepalMap = sepalMap
        this.id = id
        this.label = label
        this.description = description

        // Path borrowed from https://github.com/scottdejonge/map-icons
        this.icon = {
            path: "M25.015 2.4c-7.8 0-14.121 6.204-14.121 13.854 0 7.652 14.121 32.746 14.121 32.746s14.122-25.094 14.122-32.746c0-7.65-6.325-13.854-14.122-13.854z",
            fillOpacity: .6,
            anchor: new google.maps.Point(0, 0),
            strokeWeight: 1,
            strokeColor: '#000000',
            scale: 0.5
        }

        this.markerCluster = new MarkerClusterer(null, [], {
            clusterClass: styles.cluster,
            minimumClusterSize: 5
        })
        this.markerCluster.setStyles(
            this.markerCluster.getStyles().map(style => ({...style, textColor: 'white'}))
        )
    }

    setMarkers(markers) {
        const google = this.google
        this.markers = markers
            .map(({x, y, color, onClick}) => {
                const marker = new google.maps.Marker({
                    position: new google.maps.LatLng(y, x),
                    // map: this.googleMap,
                    draggable: false,
                    icon: {...this.icon, fillColor: color}
                })
                marker.addListener("click", () => {
                    onClick && onClick({x, y, color})
                })

                return marker
            })

        this.markerCluster.clearMarkers()
        this.markerCluster.addMarkers(this.markers)
    }

    equals(o) {
        return _.isEqual(o && o.props, this.props)
    }

    addToMap() {
        this.markerCluster.clearMarkers()
        this.markerCluster.addMarkers(this.markers)
        this.markerCluster.setMap(this.googleMap)
    }

    removeFromMap() {
        this.markerCluster.clearMarkers()
        this.markerCluster.setMap(null)
    }

    hide(hidden) {
        hidden ? this.removeFromMap() : this.addToMap()
    }

    initialize$() {
        return of(this)
    }
}
