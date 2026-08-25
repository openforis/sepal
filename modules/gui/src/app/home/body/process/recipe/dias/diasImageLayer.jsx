import PropTypes from 'prop-types'
import React from 'react'

import {VisualizationSelector} from '~/app/home/map/imageLayerSource/visualizationSelector'
import {MapAreaLayout} from '~/app/home/map/mapAreaLayout'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'

import {withRecipe} from '../../recipeContext'
import {getAvailableBands} from './bands'
import {visualizationOptions} from './visualizations'

const mapRecipeToProps = recipe => ({
    initialized: selectFrom(recipe, 'ui.initialized')
})

class _DiasImageLayer extends React.Component {
    render() {
        const {initialized, layer, map} = this.props
        return initialized
            ? (
                <MapAreaLayout
                    layer={layer}
                    form={this.renderImageLayerForm()}
                    map={map}
                />
            )
            : null
    }

    renderImageLayerForm() {
        const {recipe, source, layerConfig = {}} = this.props
        const availableBands = getAvailableBands(recipe)
        const options = visualizationOptions(recipe)
            .map(group => ({
                ...group,
                options: group.options.filter(({value}) => availableBands[value])
            }))
        return (
            <VisualizationSelector
                source={source}
                recipe={recipe}
                presetOptions={options}
                availableBands={Object.keys(availableBands)}
                selectedVisParams={layerConfig.visParams}
            />
        )
    }
}

export const DiasImageLayer = compose(
    _DiasImageLayer,
    withRecipe(mapRecipeToProps)
)

DiasImageLayer.propTypes = {
    recipe: PropTypes.object.isRequired,
    source: PropTypes.object.isRequired,
    layer: PropTypes.object,
    layerConfig: PropTypes.object,
    map: PropTypes.object
}
