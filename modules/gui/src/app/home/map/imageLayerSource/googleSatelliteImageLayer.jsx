import PropTypes from 'prop-types'
import React from 'react'

import {withRecipe} from '~/app/home/body/process/recipeContext'
import {compose} from '~/compose'
import {withSubscriptions} from '~/subscription'

import {GoogleSatelliteLayer} from '../layer/googleSatelliteLayer'
import {MapAreaLayout} from '../mapAreaLayout'

export class _GoogleSatelliteImageLayer extends React.Component {
    render() {
        const {map} = this.props
        const layer = new GoogleSatelliteLayer({map})
        this.layer = layer
        return (
            <MapAreaLayout
                layer={layer}
                map={map}
            />
        )
    }
}

export const GoogleSatelliteImageLayer = compose(
    _GoogleSatelliteImageLayer,
    withSubscriptions(),
    withRecipe()
)

GoogleSatelliteImageLayer.propTypes = {
    map: PropTypes.object
}
