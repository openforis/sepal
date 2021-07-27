import {of} from 'rxjs'
import Layer from './layer'

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

export class GoogleLabelsLayer extends Layer {
    constructor({map, layerIndex}) {
        super({map, layerIndex})
        const {google} = map.getGoogle()
        this.layer = new google.maps.StyledMapType(labelsLayerStyle, {name: 'labels'})
    }

    equals(o) {
        return o === this || o instanceof GoogleLabelsLayer
    }

    addToMap() {
        this.map.addToMap(this.layerIndex, this.layer)
    }

    removeFromMap() {
        this.map.removeFromMap(this.layerIndex)
    }

    hide(_hidden) {
        // No-op
    }

    initialize$() {
        return of(this)
    }
}
