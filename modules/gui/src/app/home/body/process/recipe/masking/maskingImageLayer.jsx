import PropTypes from 'prop-types'
import React from 'react'

import {VisualizationSelector} from '~/app/home/map/imageLayerSource/visualizationSelector'
import {MapAreaLayout} from '~/app/home/map/mapAreaLayout'
import {compose} from '~/compose'
import {msg} from '~/translate'

import {visualizationsWithAvailableBands} from '../visualizationMatching'
import {getAvailableBands} from './bands'
import {getPreSetVisualizations} from './visualizations'

class _MaskingImageLayer extends React.Component {
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

    // The presets were copied from the source when it was selected, so they describe the bands it had then, not
    // the bands it has now. Offering one that names a band since gone puts a choice in the form the map cannot
    // honour. Filtering the candidate list is all this does. Whether the selection can currently be drawn is not
    // Masking's question: RecipeImageLayer withholds the layer when nothing matches, and FeatureLayers withholds
    // the palette that would have described it. The saved selection itself is left alone by all three.
    renderImageLayerForm() {
        const {recipe, source, layerConfig = {}} = this.props
        const availableBands = Object.keys(getAvailableBands(recipe))
        const preSetOptions = visualizationsWithAvailableBands(getPreSetVisualizations(recipe), availableBands)
            .map(visParams => ({
                value: visParams.bands.join(', '),
                label: visParams.bands.join(', '),
                visParams
            }))
        const options = [{
            label: msg('process.masking.layers.imageLayer.preSets'),
            options: preSetOptions
        }]
        return (
            <VisualizationSelector
                source={source}
                recipe={recipe}
                presetOptions={options}
                availableBands={availableBands}
                selectedVisParams={layerConfig.visParams}
            />
        )
    }
}

export const MaskingImageLayer = compose(
    _MaskingImageLayer
)

MaskingImageLayer.propTypes = {
    recipe: PropTypes.object.isRequired,
    source: PropTypes.object.isRequired,
    layer: PropTypes.object,
    layerConfig: PropTypes.object,
    map: PropTypes.object
}
