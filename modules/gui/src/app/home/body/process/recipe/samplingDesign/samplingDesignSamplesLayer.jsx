import PropTypes from 'prop-types'
import React from 'react'

import api from '~/apiRegistry'
import {EarthEngineTableLayer} from '~/app/home/map/layer/earthEngineTableLayer'
import {compose} from '~/compose'
import {withSubscriptions} from '~/subscription'
import {withTab} from '~/widget/tabs/tabContext'

import {validateRetrieve} from './sampling/validateRetrieve'
import {toTaskRecipe} from './samplingDesignRecipe'

// Server-rendered preview of the Sampling Design samples (EE tile layer; features never enter the
// browser). The preview uses the canonical task recipe so it samples the same allocation rows export
// does, and only renders once the design passes the retrieve preflight - an invalid/incomplete design
// would make the endpoint error and EarthEngineTableLayer can't handle a null map response.
class _SamplingDesignSamplesLayer extends React.Component {
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
        const {id, map} = this.props
        const layer = this.createLayer()
        if (layer) {
            map.setLayer({id, layer})
        } else {
            // Recipe is incomplete/invalid - drop any previously rendered preview so no stale tiles remain.
            map.removeLayer(id)
        }
    }

    createLayer() {
        const {recipe, layerIndex, map, tab: {busy}} = this.props
        const ready = recipe.ui?.initialized && validateRetrieve(recipe.model).length === 0
        return ready
            ? new EarthEngineTableLayer({
                map,
                mapId$: api.gee.samplingDesignSamplesMap$({recipe: toTaskRecipe(recipe)}),
                layerIndex,
                watchedProps: recipe.model,
                busy
            })
            : null
    }
}

export const SamplingDesignSamplesLayer = compose(
    _SamplingDesignSamplesLayer,
    withTab(),
    withSubscriptions()
)

SamplingDesignSamplesLayer.propTypes = {
    id: PropTypes.string.isRequired,
    layerIndex: PropTypes.number.isRequired,
    map: PropTypes.any.isRequired,
    recipe: PropTypes.object.isRequired
}
