import {google, map} from 'app/home/map/map'
import {NEVER, of} from 'rxjs'

export default class Labels {
    static setLayer({contextId, shown, onInitialized}) {
        const layer = shown ? new Labels() : null
        map.getLayers(contextId).set({id: 'labels', layer, destroy$: NEVER, onInitialized})
        return layer
    }

    constructor() {
        this.layer = new google.maps.StyledMapType(labelsLayerStyle, {name: 'labels'})
        this.bounds = new google.maps.LatLngBounds(
            new google.maps.LatLng(90, -180),
            new google.maps.LatLng(-90, 180)
        )
    }

    equals(o) {
        return o === this || o instanceof Labels
    }

    addToMap(map) {
        map.overlayMapTypes.push(this.layer)
    }

    removeFromMap(map) {
        const index = map.overlayMapTypes.getArray().findIndex(overlay => overlay.name === 'labels')
        if (index >= 0)
            map.overlayMapTypes.removeAt(index)
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