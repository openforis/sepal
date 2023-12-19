import {AssetImageLayer} from './asset/assetImageLayer'
import {BaytsAlertsImageLayer} from './baytsAlerts/baytsAlertsImageLayer'
import {BaytsHistoricalImageLayer} from './baytsHistorical/baytsHistoricalImageLayer'
import {CCDCSliceImageLayer} from './ccdcSlice/ccdcSliceImageLayer'
import {ChangeAlertsImageLayer} from './changeAlerts/changeAlertsImageLayer'
import {ClassChangeImageLayer} from './classChange/classChangeImageLayer'
import {ClassificationImageLayer} from './classification/classificationImageLayer'
import {CursorValueContext} from 'app/home/map/cursorValue'
import {IndexChangeImageLayer} from './indexChange/indexChangeImageLayer'
import {MaskingImageLayer} from './masking/maskingImageLayer'
import {OpticalMosaicImageLayer} from './opticalMosaic/opticalMosaicImageLayer'
import {PhenologyImageLayer} from './phenology/phenologyImageLayer'
import {PlanetMosaicImageLayer} from './planetMosaic/planetMosaicImageLayer'
import {RadarMosaicImageLayer} from './radarMosaic/radarMosaicImageLayer'
import {RemappingImageLayer} from './remapping/remappingImageLayer'
import {Subject} from 'rxjs'
import {compose} from 'compose'
import {connect, select} from 'store'
import {getAllVisualizations, getUserDefinedVisualizations} from './visualizations'
import {getRecipeType} from '../recipeTypes'
import {selectFrom} from 'stateUtils'
import {withMapArea} from 'app/home/map/mapAreaContext'
import {withSubscriptions} from 'subscription'
import {withTab} from 'widget/tabs/tabContext'
import EarthEngineImageLayer from 'app/home/map/layer/earthEngineImageLayer'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'

const mapStateToProps = (state, {source: {id, sourceConfig: {recipeId}}}) => ({
    sourceId: id,
    recipe: selectFrom(state, ['process.loadedRecipes', recipeId])
})

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
        switch (recipe.type) {
        case 'MOSAIC':
            return (
                <OpticalMosaicImageLayer {...props}/>
            )
        case 'RADAR_MOSAIC':
            return (
                <RadarMosaicImageLayer {...props}/>
            )
        case 'PLANET_MOSAIC':
            return (
                <PlanetMosaicImageLayer {...props}/>
            )
        case 'CLASSIFICATION':
            return (
                <ClassificationImageLayer {...props}/>
            )
        case 'CLASS_CHANGE':
            return (
                <ClassChangeImageLayer {...props}/>
            )
        case 'INDEX_CHANGE':
            return (
                <IndexChangeImageLayer {...props}/>
            )
        case 'REMAPPING':
            return (
                <RemappingImageLayer {...props}/>
            )
        case 'CHANGE_ALERTS':
            return (
                <ChangeAlertsImageLayer {...props}/>
            )
        case 'CCDC_SLICE':
            return (
                <CCDCSliceImageLayer {...props}/>
            )
        case 'PHENOLOGY':
            return (
                <PhenologyImageLayer {...props}/>
            )
        case 'MASKING':
            return (
                <MaskingImageLayer {...props}/>
            )
        case 'BAYTS_HISTORICAL':
            return (
                <BaytsHistoricalImageLayer {...props}/>
            )
        case 'BAYTS_ALERTS':
            return (
                <BaytsAlertsImageLayer {...props}/>
            )
        case 'ASSET_MOSAIC':
            return (
                <AssetImageLayer {...props}/>
            )
        default:
            return null
        }
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
        const {recipe, layerConfig, map, boundsChanged$, dragging$, cursor$, tab: {busy$}} = this.props
        const recipes = [recipe, ...getDependentRecipes(recipe)]
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
                busy$,
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
