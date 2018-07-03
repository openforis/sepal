import {google, sepalMap} from 'app/home/map/map'
import {NEVER, of} from 'rxjs'

export default class Labels {
    static setLayer({layerIndex, contextId, shown, onInitialized}) {
        const layer = shown ? new Labels(layerIndex) : null
        sepalMap.getContext(contextId).setLayer({id: 'labels', layer, destroy$: NEVER, onInitialized})
        return layer
    }

    constructor(layerIndex) {
        this.layer = new google.maps.StyledMapType(labelsLayerStyle, {name: 'labels'})
        this.bounds = new google.maps.LatLngBounds(
            new google.maps.LatLng(90, -180),
            new google.maps.LatLng(-90, 180)
        )
        this.layerIndex = layerIndex
    }

    equals(o) {
        return o === this || o instanceof Labels
    }

    addToMap(googleMap) {
        googleMap.overlayMapTypes.insertAt(this.layerIndex, this.layer)
    }

    removeFromMap(googleMap) {
            googleMap.overlayMapTypes.setAt(this.layerIndex, null)
    }

    initialize$() {
        return of(this)
    }
}

const labelsLayerStyle = [
    {featureType: 'all', stylers: [{visibility: 'off'}]},
    {featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{color: '#decca6'}, {visibility: 'on'}]},
    {
        featureType: 'administrative.locality',
        elementType: 'labels.text.fill',
        stylers: [{color: '#d59563'}, {visibility: 'on'}]
    },
    {featureType: 'road', elementType: 'geometry', stylers: [{color: '#38414e'}, {visibility: 'on'}]},
    {featureType: 'road', elementType: 'geometry.stroke', stylers: [{color: '#212a37'}, {visibility: 'on'}]},
    {featureType: 'road', elementType: 'labels.text.fill', stylers: [{color: '#9ca5b3'}, {visibility: 'on'}]},
    {featureType: 'road.highway', elementType: 'geometry', stylers: [{color: '#746855'}, {visibility: 'on'}]},
    {featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{color: '#1f2835'}, {visibility: 'on'}]}
]