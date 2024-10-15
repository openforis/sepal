import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'

import {VisualizationSelector} from '~/app/home/map/imageLayerSource/visualizationSelector'
import {MapAreaLayout} from '~/app/home/map/mapAreaLayout'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {selectFrom} from '~/stateUtils'

import {visualizationOptions} from './visualizations'

const defaultLayerConfig = {
    panSharpen: false
}

const mapStateToProps = state => {
    const recipes = selectFrom(state, 'process.recipes')
    return {recipes}
}

class _StackImageLayer extends React.Component {
    render() {
        const {layer, map} = this.props
        return (
            <MapAreaLayout
                layer={this.canRender() ? layer : null}
                form={this.renderImageLayerForm()}
                map={map}
            />
        )
    }

    renderImageLayerForm() {
        const {recipes, recipe, source, layerConfig = {}} = this.props
        const images = recipe.model.inputImagery?.images || []
        const recipeNameById = {}
        images
            .filter(image => image.type === 'RECIPE_REF')
            .map(image => recipes.find(({id}) => id === image.id))
            .filter(recipe => recipe)
            .forEach(recipe => recipeNameById[recipe.id] = recipe.name)
        const options = visualizationOptions(recipe, recipeNameById)
        return (
            <VisualizationSelector
                source={source}
                recipe={recipe}
                presetOptions={options}
                selectedVisParams={layerConfig.visParams}
            />
        )
    }

    canRender() {
        const {recipe} = this.props
        const inputImagery = selectFrom(recipe, ['model.inputImagery.images']) || []
        return inputImagery.length
    }
}

export const StackImageLayer = compose(
    _StackImageLayer,
    connect(mapStateToProps),
)

StackImageLayer.defaultProps = {
    layerConfig: defaultLayerConfig
}

StackImageLayer.propTypes = {
    recipe: PropTypes.object.isRequired,
    source: PropTypes.object.isRequired,
    layer: PropTypes.object,
    layerConfig: PropTypes.object,
    map: PropTypes.object
}
