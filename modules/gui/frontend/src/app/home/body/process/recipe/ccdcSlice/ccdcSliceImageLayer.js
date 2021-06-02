import {MapAreaLayout} from 'app/home/map/mapAreaLayout'
import {VisualizationSelector} from 'app/home/map/imageLayerSource/visualizationSelector'
import {compose} from 'compose'
import {msg} from 'translate'
import {withMapAreaContext} from 'app/home/map/mapAreaContext'
import {withSourceDetails} from './withSourceDetails'
import PropTypes from 'prop-types'
import React from 'react'

const defaultLayerConfig = {
    panSharpen: false
}

class _CCDCSliceImageLayer extends React.Component {
    render() {
        const {layer, map} = this.props
        return (
            <React.Fragment>
                <MapAreaLayout
                    layer={layer}
                    form={this.renderImageLayerForm()}
                    map={map}
                />
            </React.Fragment>
        )
    }

    renderImageLayerForm() {
        const {sourceDetails: {visualizations = []} = {}, recipe, source, layerConfig = {}} = this.props
        const visParamsToOption = visParams => ({
            value: visParams.id || visParams.bands.join(','),
            label: visParams.bands.join(', '),
            visParams
        })
        const options = [{
            label: msg('process.classification.layers.imageLayer.preSets'),
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

    // TODO: Get preSet visualizations
    //  To do that, we ask ccdcRecipe, passing the source. The source is a RECIPE_REF though, so no way to tell if
    //  optical or radar. Try to use actual recipe instead, or do some workaround.
    //  Right now, visualizations are loaded statically when selecting a recipe.
    //  If recipe is updated, things might break...
    // componentDidMount() {
    //     const {recipe, layerConfig: {visParams}} = this.props
    //     if (!visParams) {
    //         this.selectVisualization(getAllVisualizations(recipe.model.source)[0])
    //     }
    // }
    //
    // componentDidUpdate(prevProps) {
    //     const {layerConfig: {visParams: prevVisParams}} = prevProps
    //     const {recipe} = this.props
    //     if (prevVisParams) {
    //         const allVisualizations = getAllVisualizations(recipe.model.source)
    //         const visParams = allVisualizations.find(({id, bands}) =>
    //             _.isEqual([id, bands], [prevVisParams.id, prevVisParams.bands])
    //         )
    //         if (!visParams) {
    //             this.selectVisualization(allVisualizations[0])
    //         } else if (!_.isEqual(visParams, prevVisParams)) {
    //             this.selectVisualization(visParams)
    //         }
    //     }
    // }

    selectVisualization(visParams) {
        const {layerConfig: {panSharpen}, mapAreaContext: {updateLayerConfig}} = this.props
        updateLayerConfig({visParams, panSharpen})
    }
}

export const CCDCSliceImageLayer = compose(
    _CCDCSliceImageLayer,
    withMapAreaContext(),
    withSourceDetails()
)

CCDCSliceImageLayer.defaultProps = {
    layerConfig: defaultLayerConfig
}

CCDCSliceImageLayer.propTypes = {
    recipe: PropTypes.object.isRequired,
    source: PropTypes.object.isRequired,
    layer: PropTypes.object,
    layerConfig: PropTypes.object,
    map: PropTypes.object
}

export const ccdcSliceDataTypes = () => {} // TODO: Data types?
