import {compose} from 'compose'
import {getImageLayerSource} from './imageLayerSourceRegistry'
import {selectFrom} from 'stateUtils'
import {withMapArea} from 'app/home/map/mapAreaContext'
import {withRecipe} from './recipeContext'
import React from 'react'

const mapRecipeToProps = recipe => ({
    layers: selectFrom(recipe, 'layers'),
    standardImageLayerSources: selectFrom(recipe, 'ui.imageLayerSources') || [],
    recipeFeatureLayerSources: selectFrom(recipe, 'ui.featureLayerSources') || [],
    recipe
})

export const withLayers = () =>
    WrappedComponent =>
        compose(
            class WithLayersHOC extends React.Component {
                render() {
                    const {
                        recipe,
                        layers,
                        standardImageLayerSources,
                        recipeFeatureLayerSources,
                        mapArea: {area} = {}
                    } = this.props
                    const {additionalImageLayerSources = [], areas = {}} = layers
                    const {imageLayer: {sourceId, layerConfig} = {}, featureLayerSources: areaFeatureLayerSources = []} = areas[area] || {}
    
                    const imageLayerSources = [...standardImageLayerSources, ...additionalImageLayerSources]
                    const source = imageLayerSources.find(({id}) => id === sourceId)
                    const {getFeatureLayerSources} = getImageLayerSource({recipe, source, layerConfig})
                    const featureLayerSources = [
                        ...recipeFeatureLayerSources,
                        ...areaFeatureLayerSources,
                        ...((getFeatureLayerSources && getFeatureLayerSources()) || [])
                    ]
    
                    const layerProps = {
                        standardImageLayerSources,
                        additionalImageLayerSources,
                        imageLayerSources,
                        featureLayerSources,
                        layers
                    }
                    return React.createElement(WrappedComponent, {...this.props, ...layerProps})
                }
            },
            withRecipe(mapRecipeToProps),
            withMapArea()
        )
