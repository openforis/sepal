import {MapAreaLayout} from 'app/home/map/mapAreaLayout'
import {VisualizationSelector} from 'app/home/map/imageLayerSource/visualizationSelector'
import {compose} from 'compose'
import {getAllVisualizations} from './ccdcSliceRecipe'
import {msg} from 'translate'
import {selectFrom} from 'stateUtils'
import {withMapAreaContext} from 'app/home/map/mapAreaContext'
import {withRecipeLayer} from '../withRecipeLayer'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'

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
        const {recipe, source, layerConfig = {}} = this.props
        const visParamsToOption = visParams => ({
            value: visParams.id || visParams.bands.join(','),
            label: visParams.bands.join(', '),
            visParams
        })
        const visualizations = selectFrom(recipe, 'model.source.visualizations') || []
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

    componentDidMount() {
        const {recipe, layerConfig: {visParams}} = this.props
        if (!visParams) {
            this.selectVisualization(getAllVisualizations(recipe)[0])
        }
    }

    componentDidUpdate(prevProps) {
        const {layerConfig: {visParams: prevVisParams}} = prevProps
        const {recipe} = this.props
        const allVisualizations = getAllVisualizations(recipe)
        if (prevVisParams) {
            const visParams = allVisualizations.find(({id}) => id === prevVisParams.id)
                || allVisualizations.find(({bands}) => _.isEqual(bands, prevVisParams.bands))
            if (!visParams) {
                allVisualizations.length && this.selectVisualization(allVisualizations[0])
            } else if (!_.isEqual(visParams, prevVisParams)) {
                this.selectVisualization(visParams)
            }
        } else {
            allVisualizations.length && this.selectVisualization(allVisualizations[0])
        }
    }

    selectVisualization(visParams) {
        const {layerConfig: {panSharpen}, mapAreaContext: {updateLayerConfig}} = this.props
        updateLayerConfig({visParams, panSharpen})
    }
}

export const CCDCSliceImageLayer = compose(
    _CCDCSliceImageLayer,
    withMapAreaContext(),
    withRecipeLayer({
        toRecipeIds: recipe => recipe.model.source.type === 'RECIPE_REF'
            ? [recipe.id, recipe.model.source.id]
            : [recipe.id]
    })
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
