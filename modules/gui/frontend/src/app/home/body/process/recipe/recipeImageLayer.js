import {ClassificationImageLayer, classificationDataTypes} from './classification/classificationImageLayer'
import {CursorValue} from 'app/home/map/cursorValue'
import {OpticalMosaicImageLayer, opticalMosaicDataTypes} from './opticalMosaic/opticalMosaicImageLayer'
import {RadarMosaicImageLayer, radarMosaicDataTypes} from './radarMosaic/radarMosaicImageLayer'
import {Subject} from 'rxjs'
import {compose} from 'compose'
import {connect} from 'store'
import {createLegendFeatureLayerSource} from 'app/home/map/legendFeatureLayerSource'
import {createPaletteFeatureLayerSource} from 'app/home/map/paletteFeatureLayerSource'
import {createValuesFeatureLayerSource} from 'app/home/map/valuesFeatureLayerSource'
import {selectFrom} from 'stateUtils'
import {setActive, setComplete} from 'app/home/map/progress'
import {withMapAreaContext} from 'app/home/map/mapAreaContext'
import {withRecipe} from '../recipeContext'
import EarthEngineLayer from 'app/home/map/earthEngineLayer'
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
        const {recipe, source, layerConfig, map} = this.props
        switch(recipe.type) {
        case 'MOSAIC': return (
            <OpticalMosaicImageLayer
                recipe={recipe}
                source={source}
                layerConfig={layerConfig}
                layer={this.maybeCreateLayer(opticalMosaicDataTypes(recipe))}
                map={map}/>
        )
        case 'RADAR_MOSAIC': return (
            <RadarMosaicImageLayer
                recipe={recipe}
                source={source}
                layerConfig={layerConfig}
                layer={this.maybeCreateLayer(radarMosaicDataTypes(recipe))}
                map={map}/>
        )
        case 'CLASSIFICATION': return (
            <ClassificationImageLayer
                recipe={recipe}
                source={source}
                layerConfig={layerConfig}
                layer={this.maybeCreateLayer(classificationDataTypes(recipe))}
                map={map}/>
        )
        default: return null
        }
    }

    componentDidMount() {
        const {addSubscription, layerConfig: {visParams: {type} = {}} = {}} = this.props
        addSubscription(this.progress$.subscribe(
            ({complete}) => complete
                ? this.setComplete('tiles')
                : this.setActive('tiles')
        ))
        this.toggleLegend(type)

    }

    componentDidUpdate(prevProps) {
        const {layerConfig: {visParams: {type: prevType} = {}} = {}} = prevProps
        const {layerConfig: {visParams: {type} = {}} = {}} = this.props
        if (type !== prevType) {
            this.toggleLegend(type)
        }
    }

    toggleLegend(type) {
        const {mapAreaContext: {includeAreaFeatureLayerSource, excludeAreaFeatureLayerSource} = {}} = this.props
        if (includeAreaFeatureLayerSource) {
            const legendSource = createLegendFeatureLayerSource()
            const paletteSource = createPaletteFeatureLayerSource()
            const valuesSource = createValuesFeatureLayerSource()
            switch(type) {
            case 'continuous':
                includeAreaFeatureLayerSource(paletteSource)
                excludeAreaFeatureLayerSource(legendSource)
                excludeAreaFeatureLayerSource(valuesSource)
                return
            case 'categorical':
                includeAreaFeatureLayerSource(legendSource)
                excludeAreaFeatureLayerSource(paletteSource)
                excludeAreaFeatureLayerSource(valuesSource)
                return
            case 'rgb':
            case 'hsv':
                includeAreaFeatureLayerSource(valuesSource)
                excludeAreaFeatureLayerSource(legendSource)
                excludeAreaFeatureLayerSource(paletteSource)
                return
            }
        }
    }

    componentWillUnmount() {
        this.setComplete('initialize')
        this.setComplete('tiles')
        this.layer && this.layer.close()
    }

    maybeCreateLayer(dataTypes) {
        const {recipe, layerConfig, map} = this.props
        return map && recipe.ui.initialized && layerConfig && layerConfig.visParams
            ? this.createLayer(dataTypes)
            : null
    }

    createLayer(dataTypes) {
        const {recipe, layerConfig, map, boundsChanged$, dragging$, cursor$} = this.props
        const {props: prevPreviewRequest} = this.layer || {}
        const previewRequest = {
            recipe: _.omit(recipe, ['ui', 'layers']),
            ...layerConfig
        }
        if (!_.isEqual(previewRequest, prevPreviewRequest)) {
            this.layer && this.layer.close()
            this.layer = EarthEngineLayer.create({
                previewRequest,
                dataTypes,
                visParams: layerConfig.visParams,
                map,
                progress$: this.progress$,
                cursorValue$: this.cursorValue$,
                boundsChanged$,
                dragging$,
                cursor$,
                onInitialize: () => this.setActive('initialize'),
                onInitialized: () => this.setComplete('initialize')
            })
        }
        return this.layer
    }

    setActive(name) {
        const {recipeActionBuilder, componentId} = this.props
        setActive(`${name}-${componentId}`, recipeActionBuilder)
    }

    setComplete(name) {
        const {recipeActionBuilder, componentId} = this.props
        setComplete(`${name}-${componentId}`, recipeActionBuilder)
    }
}

export const RecipeImageLayer = compose(
    _RecipeImageLayer,
    connect(mapStateToProps),
    withRecipe(),
    withSubscriptions(),
    withMapAreaContext()
)

RecipeImageLayer.propTypes = {
    layerConfig: PropTypes.object.isRequired,
    source: PropTypes.object.isRequired,
    map: PropTypes.object
}
