import {MapAreaLayout} from 'app/home/map/mapAreaLayout'
import {Widget} from 'widget/widget'
import EarthEngineLayer from 'app/home/map/earthEngineLayer'
import PropTypes from 'prop-types'
import React from 'react'

const defaultLayerConfig = {
    bands: {
        selection: ['red', 'green', 'blue'] // TODO: Fix...
    }
}

export class OpticalMosaicMap extends React.Component {
    render() {
        const {recipe, layerConfig = defaultLayerConfig, map} = this.props
        // TODO: Not enough to check for AOI.
        //  Will be re-rendered during the wizard after AOI is set
        const initialized = recipe.model.aoi
        const layer = map && initialized
            ? EarthEngineLayer.fromRecipe({recipe, layerConfig, map})
            : null

        return (
            <MapAreaLayout
                layer={layer}
                form={this.renderImageLayerForm()}
                map={map}
            />
        )
    }

    renderImageLayerForm() {
        // TODO: Implement...
        return <Widget>Image layer form goes here</Widget>
    }
}

OpticalMosaicMap.propTypes = {
    layerConfig: PropTypes.object,
    recipe: PropTypes.object.isRequired,
    map: PropTypes.object
}
