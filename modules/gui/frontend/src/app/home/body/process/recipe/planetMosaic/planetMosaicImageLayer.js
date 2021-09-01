import {MapAreaLayout} from 'app/home/map/mapAreaLayout'
import {VisualizationSelector} from 'app/home/map/imageLayerSource/visualizationSelector'
import {compose} from 'compose'
import {msg} from 'translate'
import {visualizations} from './visualizations'
import PropTypes from 'prop-types'
import React from 'react'

const defaultLayerConfig = {
    panSharpen: false
}

class _PlanetMosaicImageLayer extends React.Component {
    render() {
        const {layer, map} = this.props
        return (
            <MapAreaLayout
                layer={layer}
                form={this.renderImageLayerForm()}
                map={map}
            />
        )
    }

    renderImageLayerForm() {
        const {recipe, source, layerConfig = {}} = this.props
        const visParamsToOption = visParams => ({
            value: visParams.bands.join(','),
            label: visParams.bands.join(', '),
            visParams
        })

        const bandCombinationOptions = {
            label: msg('process.mosaic.bands.combinations'),
            options: visualizations.BAND_COMBINATIONS.map(visParamsToOption)
        }
        const indexOptions = {
            label: msg('process.mosaic.bands.indexes'),
            options: visualizations.INDEXES.map(visParamsToOption)
        }
        const options = [bandCombinationOptions, indexOptions]
        return (
            <VisualizationSelector
                source={source}
                recipe={recipe}
                presetOptions={options}
                selectedVisParams={layerConfig.visParams}
            />
        )
    }
}

export const PlanetMosaicImageLayer = compose(
    _PlanetMosaicImageLayer
)

PlanetMosaicImageLayer.defaultProps = {
    layerConfig: defaultLayerConfig
}

PlanetMosaicImageLayer.propTypes = {
    recipe: PropTypes.object.isRequired,
    source: PropTypes.object.isRequired,
    layer: PropTypes.object,
    layerConfig: PropTypes.object,
    map: PropTypes.object
}
