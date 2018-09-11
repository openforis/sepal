import {NEVER, of} from 'rxjs'
import {google, sepalMap} from 'app/home/map/map'
import actionBuilder from 'action-builder'

export default class Labels {
    static showLabelsAction({layerIndex = 1, shown, statePath, mapContext}) {
        return actionBuilder('SET_LABELS_SHOWN', {shown})
            .set([statePath, 'labelsShown'], shown)
            .sideEffect(() => {
                const layer = shown ? new Labels(layerIndex) : null
                sepalMap.getContext(mapContext).setLayer({id: 'labels', layer, destroy$: NEVER})
            })
            .build()
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
        googleMap.overlayMapTypes.setAt(this.layerIndex, this.layer)
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
    {elementType: 'labels.text.fill', stylers: [{color: '#ebd1aa'}, {visibility: 'on'}]},
    {elementType: 'labels.text.stroke', stylers: [{color: '#000000'}, {visibility: 'on'}, {weight: 2}]},
    {elementType: 'geometry.stroke', stylers: [{color: '#000000'}, {visibility: 'on'}]},
    {featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{color: '#ebe5dd'}, {visibility: 'on'}]},
    {
        featureType: 'administrative.locality',
        elementType: 'labels.text.fill',
        stylers: [{color: '#ebd9ca'}, {visibility: 'on'}]
    },
    {featureType: 'road', elementType: 'geometry', stylers: [{color: '#ebd1b1'}, {visibility: 'on'}]},
    {featureType: 'road', elementType: 'geometry.stroke', stylers: [{color: '#212a37'}, {visibility: 'on'}]},
    {featureType: 'road', elementType: 'labels.text.fill', stylers: [{color: '#ebe1db'}, {visibility: 'on'}]},
    {featureType: 'road.highway', elementType: 'geometry', stylers: [{color: '#ebbba2'}, {visibility: 'on'}]},
    {featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{color: '#1f2835'}, {visibility: 'on'}]}
]
