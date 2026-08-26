import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'
import {Subject} from 'rxjs'

import {CursorValueContext} from '~/app/home/map/cursorValue'
import {EarthEngineImageLayer} from '~/app/home/map/layer/earthEngineImageLayer'
import {withMapArea} from '~/app/home/map/mapAreaContext'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {selectFrom} from '~/stateUtils'
import {withSubscriptions} from '~/subscription'
import {withTab} from '~/widget/tabs/tabContext'

import {getRecipeImageLayer} from '../recipeImageLayerRegistry'
import {getRecipeType} from '../recipeTypeRegistry'
import {buildMapDependencyGraph} from './mapDependencyGraph'
import {getAllVisualizations, getUserDefinedVisualizations} from './visualizations'

// The graph is derived HERE rather than in the component, because an edit to a watched dependency has to
// change these props for the layer to hear about it at all. Reading `process.loadedRecipes` whole is what
// makes that possible; returning the derived graph rather than the object is what keeps an unrelated recipe
// edit from propagating - connect's deep comparison sees identical props and suppresses the update.
//
// A selector runs on every dispatched action, not only on recipe edits, so the adapter caches the graph by the
// identity of `loadedRecipes` and of the root recipe. Unrelated actions reuse it; any recipe edit produces new
// objects and recomputes.
const mapStateToProps = (state, {source: {id, sourceConfig: {recipeId}}}) => {
    const recipe = selectFrom(state, ['process.loadedRecipes', recipeId])
    const loadedRecipes = selectFrom(state, 'process.loadedRecipes')
    return {
        sourceId: id,
        recipe,
        dependencyGraph: recipe
            ? buildMapDependencyGraph({recipe, loadedRecipes})
            : null
    }
}

class _RecipeImageLayer extends React.Component {
    cursorValue$ = new Subject()

    render() {
        const {recipe} = this.props
        return recipe
            ? (
                <CursorValueContext cursorValue$={this.cursorValue$}>
                    {this.renderRecipeLayer()}
                </CursorValueContext>
            )
            : null
    }

    renderRecipeLayer() {
        const {currentRecipe, recipe, source, layerConfig, map, boundsChanged$, dragging$, cursor$} = this.props
        const layer = this.maybeCreateLayer()
        const props = {
            currentRecipe,
            recipe,
            source,
            layer,
            layerConfig,
            map,
            boundsChanged$,
            dragging$,
            cursor$
        }
        return React.createElement(getRecipeImageLayer(recipe.type), props)
    }

    componentDidMount() {
        if (this.selfManagedVisualizations()) {
            return
        }
        const {layerConfig: {visParams}} = this.props
        if (!visParams) {
            this.selectVisualization((this.toAllVis())[0])
        }
    }

    componentDidUpdate(prevProps) {
        if (this.selfManagedVisualizations()) {
            return
        }
        const {layerConfig: {visParams: prevVisParams}} = prevProps
        const {recipe} = this.props
        if (!recipe) return
        const allVisualizations = this.toAllVis()
        if (!allVisualizations.length) {
            this.layer && this.layer.removeFromMap()
            return
        }
        if (prevVisParams) {
            const visParams = allVisualizations
                .find(({id, bands}) =>
                    id === prevVisParams.id && (prevVisParams.id || _.isEqual(bands, prevVisParams.bands))
                )
            if (!visParams) {
                this.selectVisualization(allVisualizations[0])
            } else if (!_.isEqual(visParams, prevVisParams)) {
                this.selectVisualization(visParams)
            }
        } else {
            this.selectVisualization(allVisualizations[0])
        }
    }

    selfManagedVisualizations() {
        const {recipe} = this.props
        return recipe && ['CCDC_SLICE', 'CHANGE_ALERTS'].includes(recipe.type)
    }

    toAllVis() {
        const {currentRecipe, recipe, sourceId} = this.props
        return [
            ...getUserDefinedVisualizations(currentRecipe, sourceId),
            ...getAllVisualizations(recipe),
        ]
    }

    maybeCreateLayer() {
        const {recipe, layerConfig, map} = this.props
        return map && recipe.ui.initialized && layerConfig && layerConfig.visParams
            ? this.createLayer()
            : null
    }

    createLayer() {
        const {recipe, dependencyGraph, layerConfig, map, boundsChanged$, dragging$, cursor$, tab: {busy}} = this.props
        // The graph already starts with the root, so it is the complete watched list. Its diagnostics are
        // carried but deliberately unread: reporting a missing dependency is a separate change.
        const recipes = dependencyGraph.recipes
        const availableBands = getRecipeType(recipe.type).getAvailableBands(recipe)
        const dataTypes = _.mapValues(availableBands, 'dataType')
        const {watchedProps: prevWatchedProps} = this.layer || {}
        const previewRequest = {
            recipe: _.omit(recipe, ['ui', 'layers']),
            ...layerConfig
        }
        const watchedProps = {recipes: recipes.map(r => _.omit(r, ['ui', 'layers', 'title'])), layerConfig}
        if (!_.isEqual(watchedProps, prevWatchedProps)) {
            this.layer && this.layer.removeFromMap()
            this.layer = new EarthEngineImageLayer({
                previewRequest,
                watchedProps,
                dataTypes,
                visParams: layerConfig.visParams,
                map,
                busy,
                cursorValue$: this.cursorValue$,
                boundsChanged$,
                dragging$,
                cursor$
            })
        }
        return this.layer
    }

    selectVisualization(visParams) {
        const {layerConfig, mapArea: {updateLayerConfig}} = this.props
        updateLayerConfig({...layerConfig, visParams})
    }
}

export const RecipeImageLayer = compose(
    _RecipeImageLayer,
    connect(mapStateToProps),
    withMapArea(),
    withTab(),
    withSubscriptions()
)

RecipeImageLayer.propTypes = {
    layerConfig: PropTypes.object.isRequired,
    source: PropTypes.object.isRequired,
    boundsChanged$: PropTypes.any,
    cursor$: PropTypes.any,
    dragging$: PropTypes.any,
    map: PropTypes.object
}
