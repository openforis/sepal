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
import {collectDependentHashes, dependentHashesChanged} from './dependentHashes'
import {getAllVisualizations, getUserDefinedVisualizations} from './visualizations'

const mapStateToProps = (state, {source: {id, sourceConfig: {recipeId}}}) => {
    const recipe = selectFrom(state, ['process.loadedRecipes', recipeId])
    return {
        sourceId: id,
        recipe,
        dependentHashes: recipe ? collectDependentHashes(state, recipe) : {}
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
        const {recipe, dependentHashes, layerConfig, map, boundsChanged$, dragging$, cursor$, tab: {busy}} = this.props
        const availableBands = getRecipeType(recipe.type).getAvailableBands(recipe)
        const dataTypes = _.mapValues(availableBands, 'dataType')
        const previewRequest = {
            recipe: _.omit(recipe, ['ui', 'layers']),
            ...layerConfig
        }
        const watchedProps = {
            recipe: _.omit(recipe, ['ui', 'layers', 'title']),
            dependentHashes,
            layerConfig
        }
        if (this.shouldRecreateLayer(watchedProps)) {
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

    shouldRecreateLayer(watchedProps) {
        const prev = this.layer?.watchedProps
        if (!prev) return true
        if (!_.isEqual(prev.recipe, watchedProps.recipe)) return true
        if (!_.isEqual(prev.layerConfig, watchedProps.layerConfig)) return true
        return dependentHashesChanged(prev.dependentHashes, watchedProps.dependentHashes)
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
