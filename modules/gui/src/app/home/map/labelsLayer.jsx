import PropTypes from 'prop-types'
import React from 'react'

import {GoogleLabelsLayer} from './layer/googleLabelsLayer'
import {resolveLabelsStyle} from './layer/labelsLayerStyle'

export class LabelsLayer extends React.Component {
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
        const {id, layerConfig, layerIndex, map} = this.props
        const {categories} = resolveLabelsStyle(layerConfig)
        map.setLayer({id, layer: new GoogleLabelsLayer({map, layerIndex, settings: categories})})
    }
}

LabelsLayer.propTypes = {
    id: PropTypes.string.isRequired,
    layerConfig: PropTypes.object,
    layerIndex: PropTypes.number,
    map: PropTypes.any
}
