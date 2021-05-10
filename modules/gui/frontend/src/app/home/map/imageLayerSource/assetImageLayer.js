import {MapAreaLayout} from '../mapAreaLayout'
import {Subject} from 'rxjs'
import {VisualizationSelector} from './visualizationSelector'
import {compose} from 'compose'
import {createLegendFeatureLayerSource} from 'app/home/map/legendFeatureLayerSource'
import {msg} from 'translate'
import {setActive, setComplete} from '../progress'
import {withMapAreaContext} from '../mapAreaContext'
import {withRecipe} from 'app/home/body/process/recipeContext'
import EarthEngineLayer from '../earthEngineLayer'
import PropTypes from 'prop-types'
import React from 'react'
import withSubscriptions from 'subscription'

class _AssetImageLayer extends React.Component {
     progress$ = new Subject()

     render() {
         const {map} = this.props
         return (
             <MapAreaLayout
                 layer={this.createLayer()}
                 form={this.renderImageLayerForm()}
                 map={map}
             />
         )
     }

     renderImageLayerForm() {
         const {source, layerConfig = {}} = this.props
         const recipe = {
             type: 'ASSET',
             id: source.sourceConfig.asset
         }

         const visParamsToOption = visParams => ({
             value: visParams.id,
             label: visParams.bands.join(', '),
             visParams
         })
         const visualizations = source.sourceConfig.visualizations || []
         const options = [{
             label: msg('map.layout.addImageLayerSource.types.Asset.presets'),
             options: visualizations.map(visParamsToOption)
         }]
         return (
             <VisualizationSelector
                 source={source}
                 recipe={recipe}
                 presetOptions={options}
                 selectedVisParams={layerConfig.visParams}
             />
         )
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
             const source = createLegendFeatureLayerSource()
             type === 'continuous'
                 ? includeAreaFeatureLayerSource(source)
                 : excludeAreaFeatureLayerSource(source)
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

     createLayer() {
         const {layerConfig, map, source: {sourceConfig: {asset}}} = this.props
         return map && layerConfig && layerConfig.visParams
             ? EarthEngineLayer.fromAsset({
                 asset,
                 layerConfig,
                 map,
                 progress$: this.progress$,
                 onInitialize: () => this.setActive('initialize'),
                 onInitialized: () => this.setComplete('initialize')})
             : null
     }
}

export const AssetImageLayer = compose(
    _AssetImageLayer,
    withSubscriptions(),
    withRecipe(),
    withMapAreaContext()
)

AssetImageLayer.propTypes = {
    source: PropTypes.any.isRequired,
    layerConfig: PropTypes.object,
    map: PropTypes.object
}
