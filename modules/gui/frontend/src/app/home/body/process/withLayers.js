import {selectFrom} from 'stateUtils'
import React from 'react'
import _ from 'lodash'

export const withLayers = () =>
    WrappedComponent =>
        class HigherOrderComponent extends React.Component {
            render() {
                const {recipe} = this.props
                const standardImageLayerSources = selectFrom(recipe, 'ui.imageLayerSources') || []
                const additionalImageLayerSources = selectFrom(recipe, 'layers.additionalImageLayerSources') || []
                const featureLayerSources = selectFrom(recipe, 'ui.featureLayerSources')
                const layers = selectFrom(recipe, 'layers')
                const layerProps = {
                    standardImageLayerSources,
                    additionalImageLayerSources,
                    imageLayerSources: [...standardImageLayerSources, ...additionalImageLayerSources],
                    featureLayerSources,
                    layers
                }
                return React.createElement(WrappedComponent, {...this.props, ...layerProps})
            }
        }
