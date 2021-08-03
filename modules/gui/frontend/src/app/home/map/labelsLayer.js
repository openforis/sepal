import {GoogleLabelsLayer} from './layer/googleLabelsLayer'
import {compose} from 'compose'
import {connect} from 'store'
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
        const {id, layerIndex, map} = this.props
        const layer = new GoogleLabelsLayer({map, layerIndex})
        map.setLayer({id, layer})
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
