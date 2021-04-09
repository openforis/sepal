import {MapAreaLayout} from 'app/home/map/mapAreaLayout'
import {PlanetMap} from '../../../../map/planetMap'
import EarthEngineLayer from 'app/home/map/earthEngineLayer'
import PropTypes from 'prop-types'
import React from 'react'

export class OpticalMosaicMap extends React.Component {
    render() {
        const {recipe, layerConfig, map} = this.props
        const layer = map
            ? EarthEngineLayer.fromRecipe({recipe, layerConfig, map})
            : null

        return (
            <MapAreaLayout
                form={null}
                layer={layer}
                map={map}
            />
        )
    }
}

OpticalMosaicMap.propTypes = {
    layerConfig: PropTypes.object.isRequired,
    recipe: PropTypes.object.isRequired,
    map: PropTypes.object
}
