import {MapAreaLayout} from 'app/home/map/mapAreaLayout'
import {VisualizationSelector} from 'app/home/map/imageLayerSource/visualizationSelector'
import {compose} from 'compose'
import {dataTypes} from './dataTypes'
import {getAllVisualizations} from './radarMosaicRecipe'
import {msg} from 'translate'
import {selectFrom} from 'stateUtils'
import {visualizations} from './visualizations'
import {withMapAreaContext} from 'app/home/map/mapAreaContext'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'

const defaultLayerConfig = {
    panSharpen: false
}

class _RadarMosaicImageLayer extends React.Component {
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
            value: visParams.bands.join(','),
            label: visParams.bands.join(', '),
            visParams
        })
        const type = selectFrom(recipe, 'model.dates').targetDate
            ? 'POINT_IN_TIME'
            : 'TIME_SCAN'
        const bandCombinationOptions = {
            label: msg('process.mosaic.bands.combinations'),
            options: visualizations[type].map(visParamsToOption),
        }
        const metadataOptions = {
            label: msg('process.mosaic.bands.metadata'),
            options: visualizations.METADATA.map(visParamsToOption)
        }
        const options = type === 'TIME_SCAN'
            ? [bandCombinationOptions]
            : [bandCombinationOptions, metadataOptions]
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
        if (prevVisParams) {
            const allVisualizations = getAllVisualizations(recipe)
            const visParams = allVisualizations.find(({id, bands}) =>
                _.isEqual([id, bands], [prevVisParams.id, prevVisParams.bands])
            )
            if (!visParams) {
                this.selectVisualization(allVisualizations[0])
            } else if (!_.isEqual(visParams, prevVisParams)) {
                this.selectVisualization(visParams)
            }
        }
    }

    selectVisualization(visParams) {
        const {layerConfig: {panSharpen}, mapAreaContext: {updateLayerConfig}} = this.props
        updateLayerConfig({visParams, panSharpen})
    }
}

export const RadarMosaicImageLayer = compose(
    _RadarMosaicImageLayer,
    withMapAreaContext()
)

RadarMosaicImageLayer.defaultProps = {
    layerConfig: defaultLayerConfig
}

RadarMosaicImageLayer.propTypes = {
    recipe: PropTypes.object.isRequired,
    source: PropTypes.object.isRequired,
    layer: PropTypes.object,
    layerConfig: PropTypes.object,
    map: PropTypes.object
}

export const radarMosaicDataTypes = () => dataTypes
