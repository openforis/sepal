import {CCDCSliceImageLayer} from './ccdcSlice/ccdcSliceImageLayer'
import {ClassificationImageLayer} from './classification/classificationImageLayer'
import {CursorValue} from 'app/home/map/cursorValue'
import {OpticalMosaicImageLayer} from './opticalMosaic/opticalMosaicImageLayer'
import {RadarMosaicImageLayer} from './radarMosaic/radarMosaicImageLayer'
import {Subject} from 'rxjs'
import {compose} from 'compose'
import {connect, select} from 'store'
import {getAllVisualizations} from './visualizations'
import {getRecipeType} from '../recipeTypes'
import {selectFrom} from 'stateUtils'
import {setActive, setComplete} from 'app/home/map/progress'
import {withMapAreaContext} from 'app/home/map/mapAreaContext'
import {withRecipe} from 'app/home/body/process/recipeContext'
import EarthEnginePreviewLayer from 'app/home/map/layer/earthEngine/earthEnginePreviewLayer'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import withSubscriptions from 'subscription'

const mapStateToProps = (state, {source: {sourceConfig: {recipeId}}}) => ({
    recipe: selectFrom(state, ['process.loadedRecipes', recipeId])
})

class _RecipeImageLayer extends React.Component {
    progress$ = new Subject()
    cursorValue$ = new Subject()

    render() {
        const {recipe} = this.props
        return recipe
            ? (
                <CursorValue value$={this.cursorValue$}>
                    {this.renderRecipeLayer()}
                </CursorValue>
            )
            : null
    }

    renderRecipeLayer() {
        const {recipe, source, layerConfig, map, boundsChanged$, dragging$, cursor$} = this.props
        const layer = this.maybeCreateLayer()
        const props = {
            recipe,
            source,
            layer,
            layerConfig,
            map,
            boundsChanged$,
            dragging$,
            cursor$
        }
        switch(recipe.type) {
        case 'MOSAIC': return (
            <OpticalMosaicImageLayer {...props}/>
        )
        case 'RADAR_MOSAIC': return (
            <RadarMosaicImageLayer {...props}/>
        )
        case 'CLASSIFICATION': return (
            <ClassificationImageLayer {...props}/>
        )
        case 'CCDC_SLICE': return (
            <CCDCSliceImageLayer {...props}/>
        )
        default: return null
        }
    }

    componentDidMount() {
        const {recipe, layerConfig: {visParams}, addSubscription} = this.props
        if (!visParams) {
            this.selectVisualization(getAllVisualizations(recipe)[0])
        }

        addSubscription(
            this.progress$.subscribe({
                next: ({complete}) => complete
                    ? this.setComplete('tiles')
                    : this.setActive('tiles')
            })
        )
    }

    componentDidUpdate(prevProps) {
        const {layerConfig: {visParams: prevVisParams}} = prevProps
        const {recipe} = this.props
        if (!recipe) return
        const allVisualizations = getAllVisualizations(recipe)
        if (!allVisualizations.length) return
        if (prevVisParams) {
            const visParams = allVisualizations
                .find(({id, bands}) => id === prevVisParams.id && (prevVisParams.id || _.isEqual(bands, prevVisParams.bands)))
            if (!visParams) {
                this.selectVisualization(allVisualizations[0])
            } else if (!_.isEqual(visParams, prevVisParams)) {
                this.selectVisualization(visParams)
            }
        } else {
            this.selectVisualization(allVisualizations[0])
        }
    }

    componentWillUnmount() {
        this.setComplete('initialize')
        this.setComplete('tiles')
    }

    setActive(name) {
        const {recipeActionBuilder, componentId} = this.props
        setActive(`${name}-${componentId}`, recipeActionBuilder)
    }

    setComplete(name) {
        const {recipeActionBuilder, componentId} = this.props
        setComplete(`${name}-${componentId}`, recipeActionBuilder)
    }

    maybeCreateLayer() {
        const {recipe, layerConfig, map} = this.props
        return map && recipe.ui.initialized && layerConfig && layerConfig.visParams
            ? this.createLayer()
            : null
    }

    createLayer() {
        const {recipe, layerConfig, map, boundsChanged$, dragging$, cursor$} = this.props
        const recipes = [recipe, ...getDependentRecipes(recipe)]
        const availableBands = getRecipeType(recipe.type).getAvailableBands(recipe)
        const dataTypes = _.mapValues(availableBands, 'dataType')
        const {watchedProps: prevWatchedProps} = this.layer || {}
        const previewRequest = {
            recipe: _.omit(recipe, ['ui', 'layers']),
            ...layerConfig
        }
        const watchedProps = {recipes: recipes.map(r => _.omit(r, ['ui', 'layers'])), layerConfig}
        if (!_.isEqual(watchedProps, prevWatchedProps)) {
            this.layer && this.layer.removeFromMap()
            this.layer = new EarthEnginePreviewLayer({
                previewRequest,
                watchedProps,
                dataTypes,
                visParams: layerConfig.visParams,
                map,
                progress$: this.progress$,
                cursorValue$: this.cursorValue$,
                boundsChanged$,
                dragging$,
                cursor$,
                onInitialize: () => this.setActive('initialize'),
                onInitialized: () => this.setComplete('initialize'),
                onError: () => this.setComplete('initialize')
            })
        }
        return this.layer
    }

    selectVisualization(visParams) {
        const {layerConfig: {panSharpen}, mapAreaContext: {updateLayerConfig}} = this.props
        updateLayerConfig({visParams, panSharpen})
    }
}

const getDependentRecipes = recipe =>
    getRecipeType(recipe.type)
        .getDependentRecipeIds(recipe)
        .map(recipeId => select(['process.loadedRecipes', recipeId]))
        .filter(r => r)
        .map(r => getDependentRecipes(r))
        .flat()

export const RecipeImageLayer = compose(
    _RecipeImageLayer,
    connect(mapStateToProps),
    withRecipe(),
    withMapAreaContext(),
    withSubscriptions()
)

RecipeImageLayer.propTypes = {
    layerConfig: PropTypes.object.isRequired,
    source: PropTypes.object.isRequired,
    boundsChanged$: PropTypes.any,
    cursor$: PropTypes.any,
    dragging$: PropTypes.any,
    map: PropTypes.object,
}
