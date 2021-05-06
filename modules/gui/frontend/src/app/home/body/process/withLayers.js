import {compose} from 'compose'
import {selectFrom} from 'stateUtils'
import {withMapAreaContext} from 'app/home/map/mapAreaContext'
import {withRecipe} from './recipeContext'
import React from 'react'

const mapRecipeToProps = recipe => ({
    layers: selectFrom(recipe, 'layers'),
    standardImageLayerSources: selectFrom(recipe, 'ui.imageLayerSources') || [],
    recipeFeatureLayerSources: selectFrom(recipe, 'ui.featureLayerSources') || []
})

export const withLayers = () =>
    WrappedComponent => {
        class HigherOrderComponent extends React.Component {
            render() {
                const {
                    layers,
                    standardImageLayerSources,
                    recipeFeatureLayerSources,
                    mapAreaContext: {area} = {}
                } = this.props
                const {additionalImageLayerSources = [], areas = {}} = layers
                const {featureLayerSources: areaFeatureLayerSources = []} = areas[area] || {}
                const layerProps = {
                    standardImageLayerSources,
                    additionalImageLayerSources,
                    imageLayerSources: [...standardImageLayerSources, ...additionalImageLayerSources],
                    featureLayerSources: [...recipeFeatureLayerSources, ...areaFeatureLayerSources],
                    layers
                }
                return React.createElement(WrappedComponent, {...this.props, ...layerProps})
            }
        }

        return compose(
            HigherOrderComponent,
            withRecipe(mapRecipeToProps),
            withMapAreaContext(),
        )
    }
