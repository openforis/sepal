import {EETableLayer} from './eeTableLayer'
import {compose} from 'compose'
import {connect} from 'store'
import {of} from 'rxjs'
import PropTypes from 'prop-types'
import React from 'react'

class _LabelsLayer extends React.Component {
    render() {
        return null
    }

    componentDidMount() {
        this.setLayer()
    }

    componentDidUpdate() {
        this.setLayer()
    }

    componentWillUnmount() {
        const {id, map} = this.props
        map.removeLayer(id)
    }

    setLayer() {
        const {id, layerIndex, map, componentWillUnmount$} = this.props
        const layer = new Layer({map, layerIndex})
        map.setLayer({
            id,
            layer,
            destroy$: componentWillUnmount$
        })
    }
}

export const LabelsLayer = compose(
    _LabelsLayer,
    connect()
)

LabelsLayer.propTypes = {
    id: PropTypes.string.isRequired,
    layerIndex: PropTypes.number,
    map: PropTypes.any
}

class Layer {
    constructor({map, layerIndex}) {
        this.map = map
        const {google} = map.getGoogle()
        this.layer = new google.maps.StyledMapType(labelsLayerStyle, {name: 'labels'})
        this.layerIndex = layerIndex
    }

    equals(o) {
        return o === this || o instanceof LabelsLayer
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
