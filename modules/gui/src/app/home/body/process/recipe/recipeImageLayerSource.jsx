import PropTypes from 'prop-types'
import React from 'react'

import {createAoiFeatureLayerSource} from '~/app/home/map/aoiFeatureLayerSource'
import {createGoogleSatelliteImageLayerSource} from '~/app/home/map/imageLayerSource/googleSatelliteImageLayerSource'
// import {createNicfiPlanetImageLayerSource} from '~/app/home/map/imageLayerSource/planetImageLayerSource'
import {createLabelsFeatureLayerSource} from '~/app/home/map/labelsFeatureLayerSource'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {getLogger} from '~/log'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {toUserErrorMessage} from '~/userError'
import {Notifications} from '~/widget/notifications'

import {isEditableLayerSource} from '../mapLayout/layerSourceEdit'
import {missingMarkPath} from '../mapLayout/missingLayerSources'
import {recipeActionBuilder} from '../recipe'
import {recipeAccess} from '../recipeAccess'
import {withRecipe} from '../recipeContext'

const log = getLogger('recipeImageLayerSource')

const mapStateToProps = (state, {source: {sourceConfig: {recipeId}}}) => ({
    recipe: selectFrom(state, ['process.loadedRecipes', recipeId])
})

const mapRecipeToProps = (recipe, {source}) => ({
    missingMark: selectFrom(recipe, missingMarkPath(source.id))
})

// Reads the recipe a layer source shows, whether or not any map area shows it. A recipe found not to exist is marked
// on the source, for Layers to show where the source is listed (missingLayerSources.js), rather than notified: it is
// what a saved source naming a deleted recipe is expected to find, every time it is opened. Any other failure is
// notified as one. The mark is the read's own answer about the recipe the source names: it goes when a read starts or
// the recipe loads, and an answer about a recipe the source no longer names marks nothing.
class _RecipeImageLayerSource extends React.Component {
    // The recipe a read failed for, not read again until the source names another.
    failedRecipeId = null

    render() {
        return null
    }

    componentDidMount() {
        this.loadRecipe()
    }

    componentDidUpdate(prevProps) {
        const {recipe: prevRecipe, source: prevSource} = prevProps
        const {stream, recipe, source} = this.props
        if (source.sourceConfig.recipeId !== prevSource.sourceConfig.recipeId) {
            this.failedRecipeId = null
            this.loadRecipe()
        } else if (!stream('LOAD_RECIPE').active && (!recipe || recipe?.id !== prevRecipe?.id)) {
            this.loadRecipe()
        }
        if (recipe && toDescription(recipe) !== toDescription(prevRecipe)) {
            this.updateSourceConfig(recipe)
        }
    }

    // A layer entry that names no recipe cannot be loaded, and asking for one is a request for
    // `/api/processing-recipes/undefined`. Saved recipes contain such entries, so this stands rather than
    // relying on none being written again - and it reports nothing, because there is no missing dependency
    // here to report: the entry never referred to anything.
    loadRecipe() {
        const {stream, source, loadRecipe$} = this.props
        const {recipeId} = source.sourceConfig
        if (recipeId && recipeId === this.failedRecipeId) {
            return
        }
        this.unmarkMissing()
        if (!recipeId) {
            return
        }
        stream('LOAD_RECIPE',
            loadRecipe$(recipeId),
            recipe => this.isNamed(recipeId) && this.updateSourceConfig(recipe),
            error => this.isNamed(recipeId) && this.failed(recipeId, error)
        )
    }

    isNamed(recipeId) {
        const {source} = this.props
        return source.sourceConfig.recipeId === recipeId
    }

    failed(recipeId, error) {
        const {source} = this.props
        this.failedRecipeId = recipeId
        log.error(`Failed to load recipe ${recipeId} of layer source ${source.id}`, error)
        if (isMissing(error)) {
            this.markMissing(recipeId)
        } else {
            Notifications.error(loadFailure(source, error))
        }
    }

    markMissing(recipeId) {
        const {source, recipeActionBuilder} = this.props
        recipeActionBuilder('MARK_IMAGE_LAYER_SOURCE_MISSING', {sourceId: source.id})
            .set(missingMarkPath(source.id), {recipeId})
            .dispatch()
    }

    unmarkMissing() {
        const {source, missingMark, recipeActionBuilder} = this.props
        if (missingMark) {
            recipeActionBuilder('UNMARK_IMAGE_LAYER_SOURCE_MISSING', {sourceId: source.id})
                .del(missingMarkPath(source.id))
                .dispatch()
        }
    }

    // The description only, and only of a source the layout added: one derived from the recipe's inputs is named from the
    // listing (dependencyLayerSources.js), and writing here would save an entry for it. The source's styles are not
    // copied here: they are read from the source wherever they are offered, so an edit or a deletion there reaches this
    // recipe rather than leaving a copy behind that nothing can correct. Styles already saved under this layer stay
    // untouched - a copy made by the previous behavior cannot be told apart from a style the user deliberately made here.
    updateSourceConfig(recipe) {
        const {recipeId, source, recipeActionBuilder} = this.props
        this.unmarkMissing()
        const description = toDescription(recipe)
        if (recipeId !== source.sourceConfig.recipeId && isEditableLayerSource(source)) {
            recipeActionBuilder('UPDATE_RECIPE_IMAGE_LAYER_SOURCE', {description})
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

export const initializeLayers = ({recipeId, savedLayers, additionalFeatureLayerSources = [], skipThis, defaultGoogleSatellite}) => {
    const recipeImageLayerSource = !skipThis && createCurrentRecipeImageLayerSource(recipeId)
    // const planetImageLayerSource = createNicfiPlanetImageLayerSource()
    const googleSatelliteImageLayerSource = createGoogleSatelliteImageLayerSource()
    const imageLayerSources = [
        ...skipThis ? [] : [recipeImageLayerSource],
        // planetImageLayerSource,
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
                        sourceId: skipThis || defaultGoogleSatellite ? googleSatelliteImageLayerSource.id : recipeImageLayerSource.id
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

// A recipe the server answers is not there; nothing else says it is gone.
const isMissing = error => error?.status === 404

// Named as the source was saved, the name the user knows it by.
const loadFailure = ({sourceConfig: {recipeId, description}}, error) =>
    ({message: msg('imageLayerSources.Recipe.loadFailed', {description: description || recipeId}), error: toUserErrorMessage(error)})

const toDescription = recipe =>
    recipe && (recipe.title || recipe.placeholder)
