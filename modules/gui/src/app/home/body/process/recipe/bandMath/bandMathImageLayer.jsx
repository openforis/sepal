import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'

import {VisualizationSelector} from '~/app/home/map/imageLayerSource/visualizationSelector'
import {MapAreaLayout} from '~/app/home/map/mapAreaLayout'
import {asFunctionalComponent} from '~/classComponent'
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

class _BandMathImageLayer extends React.Component {
    render() {
        const {layer, map, recipe} = this.props
        const hasOutputBands = !!recipe?.model?.outputBands?.outputImages?.length
        return hasOutputBands
            ? (
                <MapAreaLayout
                    layer={this.canRender() ? layer : null}
                    form={this.renderImageLayerForm()}
                    map={map}
                />
            )
            : null
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

export const BandMathImageLayer = compose(
    _BandMathImageLayer,
    connect(mapStateToProps),
    asFunctionalComponent({
        layerConfig: defaultLayerConfig
    })
)

BandMathImageLayer.propTypes = {
    recipe: PropTypes.object.isRequired,
    source: PropTypes.object.isRequired,
    layer: PropTypes.object,
    layerConfig: PropTypes.object,
    map: PropTypes.object
}
