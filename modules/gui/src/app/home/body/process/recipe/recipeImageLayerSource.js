import PropTypes from 'prop-types'
import React from 'react'

import {createAoiFeatureLayerSource} from '~/app/home/map/aoiFeatureLayerSource'
import {createGoogleSatelliteImageLayerSource} from '~/app/home/map/imageLayerSource/googleSatelliteImageLayerSource'
import {createNicfiPlanetImageLayerSource} from '~/app/home/map/imageLayerSource/planetImageLayerSource'
import {createLabelsFeatureLayerSource} from '~/app/home/map/labelsFeatureLayerSource'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {Notifications} from '~/widget/notifications'

import {recipeActionBuilder} from '../recipe'
import {recipeAccess} from '../recipeAccess'
import {withRecipe} from '../recipeContext'

const mapStateToProps = (state, {source: {sourceConfig: {recipeId}}}) => ({
    recipe: selectFrom(state, ['process.loadedRecipes', recipeId])
})

const mapRecipeToProps = (recipe, {source: {id}}) => ({
    currentUserDefinedVisualizations: selectFrom(recipe, ['layers.userDefinedVisualizations', id]) || []
})

class _RecipeImageLayerSource extends React.Component {
    state = {
        recipeFailedToLoad: false
    }

    render() {
        return null
    }

    componentDidMount() {
        this.loadRecipe()
    }

    componentDidUpdate(prevProps) {
        const {recipe: prevRecipe} = prevProps
        const {stream, recipe} = this.props
        if (!stream('LOAD_RECIPE').active && (!recipe || recipe?.id !== prevRecipe?.id)) {
            this.loadRecipe()
        }
        if (recipe && toDescription(recipe) !== toDescription(prevRecipe)) {
            this.updateSourceConfig(recipe)
        }
    }

    loadRecipe() {
        const {stream, source: {sourceConfig: {recipeId}}, loadRecipe$} = this.props
        const {recipeFailedToLoad} = this.state
        if (!recipeFailedToLoad) {
            stream('LOAD_RECIPE',
                loadRecipe$(recipeId),
                recipe => this.updateSourceConfig(recipe),
                error => {
                    this.setState({recipeFailedToLoad: true})
                    Notifications.error({message: msg('imageLayerSources.Recipe.loadError', {error}), error})
                }
            )
        }
    }

    updateSourceConfig(recipe) {
        const {currentUserDefinedVisualizations, recipeId, source, recipeActionBuilder} = this.props
        const description = toDescription(recipe)
        if (recipeId !== source.sourceConfig.recipeId) {
            const userDefinedVisualizations = selectFrom(recipe, 'layers.userDefinedVisualizations.this-recipe') || []
            const currentVisualizationIds = currentUserDefinedVisualizations.map(({id}) => id)
            userDefinedVisualizations
                .reduce(
                    (builder, visualization) =>
                        currentVisualizationIds.includes(visualization.id)
                            ? builder
                            : builder.push(['layers.userDefinedVisualizations', source.id], visualization),
                    recipeActionBuilder('UPDATE_RECIPE_IMAGE_LAYER_SOURCE', {description})
                )
                .set(['layers.additionalImageLayerSources', {id: source.id}, 'sourceConfig.description'], description)
                .dispatch()
        }
    }
}

export const RecipeImageLayerSource = compose(
    _RecipeImageLayerSource,
    connect(mapStateToProps),
    withRecipe(mapRecipeToProps),
    recipeAccess()
)

RecipeImageLayerSource.propTypes = {
    source: PropTypes.object.isRequired
}

export const initializeLayers = ({recipeId, savedLayers, additionalFeatureLayerSources = [], skipThis}) => {
    const recipeImageLayerSource = !skipThis && createCurrentRecipeImageLayerSource(recipeId)
    const planetImageLayerSource = createNicfiPlanetImageLayerSource()
    const googleSatelliteImageLayerSource = createGoogleSatelliteImageLayerSource()
    const imageLayerSources = [
        ...skipThis ? [] : [recipeImageLayerSource],
        planetImageLayerSource,
        googleSatelliteImageLayerSource
    ]

    const aoiLayerSource = createAoiFeatureLayerSource()
    const labelsLayerSource = createLabelsFeatureLayerSource()
    const featureLayerSources = [
        aoiLayerSource,
        labelsLayerSource,
        ...additionalFeatureLayerSources
    ]
    const layers = savedLayers && savedLayers.areas
        ? savedLayers
        : {
            areas: {
                'center': {
                    id: 'default-layer',
                    imageLayer: {
                        sourceId: skipThis ? googleSatelliteImageLayerSource.id : recipeImageLayerSource.id
                    },
                    featureLayers: [
                        {sourceId: aoiLayerSource.id}
                    ]
                }
            },
            mode: 'grid'
        }
    const actionBuilder = recipeActionBuilder(recipeId)
    actionBuilder('INITIALIZE_LAYER_SOURCES')
        .setAll({
            'ui.imageLayerSources': imageLayerSources,
            'ui.featureLayerSources': featureLayerSources,
            layers,
        })
        .dispatch()
}

const createCurrentRecipeImageLayerSource = recipeId => ({
    id: 'this-recipe',
    type: 'Recipe',
    sourceConfig: {
        recipeId,
        description: msg('imageLayerSources.Recipe.thisRecipeDescription'),
    }
})

const toDescription = recipe =>
    recipe && (recipe.title || recipe.placeholder)
