import {GoogleLabelsLayer} from './layer/googleLabelsLayer'
import PropTypes from 'prop-types'
import React from 'react'

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
        const {id, layerIndex, map} = this.props
        const layer = new GoogleLabelsLayer({map, layerIndex})
        map.setLayer({id, layer})
    }
}

LabelsLayer.propTypes = {
    id: PropTypes.string.isRequired,
    layerIndex: PropTypes.number,
    map: PropTypes.any
}
