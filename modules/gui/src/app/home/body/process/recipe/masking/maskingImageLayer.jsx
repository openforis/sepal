import PropTypes from 'prop-types'
import React from 'react'

import {VisualizationSelector} from '~/app/home/map/imageLayerSource/visualizationSelector'
import {MapAreaLayout} from '~/app/home/map/mapAreaLayout'
import {compose} from '~/compose'
import {msg} from '~/translate'

import {renderableVisualizations} from '../visualizationMatching'
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
        const availableBands = getAvailableBands(recipe)
        // Identified by id where the style has one. Two inherited styles can describe the same bands, and
        // keying the option by its band list would collapse them into one choice the selection cannot tell
        // apart. An unidentified preset still has only its bands to be known by.
        const preSetOptions = renderableVisualizations(getPreSetVisualizations(recipe), availableBands)
            .map(visParams => ({
                value: visParams.id || visParams.bands.join(', '),
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
