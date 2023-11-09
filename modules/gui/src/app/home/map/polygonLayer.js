import {GooglePolygonLayer} from './layer2/googlePolygonLayer'
import PropTypes from 'prop-types'
import React from 'react'

export class PolygonLayer extends React.Component {
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
        const {id, path, map} = this.props
        if (path) {
            const layer = new GooglePolygonLayer({map, path})
            map.setLayer({id, layer})
        }
    }
}

PolygonLayer.propTypes = {
    id: PropTypes.string.isRequired,
    map: PropTypes.any,
    path: PropTypes.any
}
