import {MapAreaLayout} from 'app/home/map/mapAreaLayout'
import {VisualizationSelector} from 'app/home/map/imageLayerSource/visualizationSelector'
import {compose} from 'compose'
import {msg} from 'translate'
import {normalize} from 'app/home/map/visParams/visParams'
import {selectFrom} from 'stateUtils'
import {supportProbability, supportRegression} from './classificationRecipe'
import {withMapAreaContext} from 'app/home/map/mapAreaContext'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'

const defaultLayerConfig = {
    panSharpen: false
}

class _ClassificationImageLayer extends React.Component {
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
        return (
            <VisualizationSelector
                source={source}
                recipe={recipe}
                presetOptions={this.visualizationOptions()}
                selectedVisParams={layerConfig.visParams}
            />
        )
    }

    visualizationOptions() {
        const {recipe} = this.props
        const legend = selectFrom(recipe, 'model.legend') || {}
        const classifierType = selectFrom(recipe, 'model.classifier.type')
        const entries = _.sortBy(legend.entries, 'value')
        const min = entries[0].value
        const max = _.last(entries).value
        const probabilityPalette = ['#000000', '#480000', '#710101', '#BA0000', '#FF0000', '#FFA500', '#FFFF00',
            '#79C900', '#006400']
        return [
            {
                value: 'class',
                label: msg('process.classification.bands.class'),
                visParams: normalize({
                    type: 'categorical',
                    bands: ['class'],
                    min,
                    max,
                    values: entries.map(({value}) => value),
                    labels: entries.map(({label}) => label),
                    palette: entries.map(({color}) => color),
                })
            },
            supportRegression(classifierType) && {
                value: 'regression',
                label: msg('process.classification.bands.regression'),
                visParams: normalize({
                    type: 'continuous',
                    bands: ['regression'],
                    min,
                    max,
                    palette: entries.map(({color}) => color),
                })
            },
            supportProbability(classifierType) && {
                value: 'class_probability',
                label: msg('process.classification.bands.classProbability'),
                visParams: normalize({
                    type: 'continuous',
                    bands: ['class_probability'],
                    min: 0,
                    max: 100,
                    palette: probabilityPalette
                })
            },
            ...legend.entries.map(({value, label}) => supportProbability(classifierType) && {
                value: `probability_${value}`,
                label: msg('process.classification.bands.probability', {class: label}),
                visParams: normalize({
                    type: 'continuous',
                    bands: [`probability_${value}`],
                    min: 0,
                    max: 100,
                    palette: probabilityPalette
                })
            })
        ].filter(option => option)
    }

    componentDidMount() {
        const {layerConfig: {visParams}} = this.props
        if (!visParams) {
            this.selectVisualization(this.visualizationOptions()[0].visParams)
        }
    }

    componentDidUpdate(prevProps) {
        const {layerConfig: {visParams: prevVisParams}} = prevProps
        const {recipe} = this.props
        if (prevVisParams) {
            const allVisualizations = [
                ...Object.values((selectFrom(recipe, ['layers.userDefinedVisualizations', 'this-recipe']) || {})),
                ...this.visualizationOptions().map(({visParams}) => visParams)
            ]
            const visParams = allVisualizations.find(({bands}) => _.isEqual(bands, prevVisParams.bands))
            if (!visParams) {
                this.selectVisualization(this.visualizationOptions()[0].visParams)
            } else if (!_.isEqual(visParams, prevVisParams)) {
                this.selectVisualization(visParams)
            }
        }
    }

    selectVisualization(visParams) {
        const {mapAreaContext: {updateLayerConfig}} = this.props
        updateLayerConfig({visParams})
    }
}

export const ClassificationImageLayer = compose(
    _ClassificationImageLayer,
    withMapAreaContext()
)

ClassificationImageLayer.defaultProps = {
    layerConfig: defaultLayerConfig
}

ClassificationImageLayer.propTypes = {
    recipe: PropTypes.object.isRequired,
    source: PropTypes.object.isRequired,
    layer: PropTypes.object,
    layerConfig: PropTypes.object,
    map: PropTypes.object
}

export const classificationDataTypes = recipe => {
    const legend = selectFrom(recipe, 'model.legend') || {}
    const classifierType = selectFrom(recipe, 'model.classifier.type')
    const entries = _.sortBy(legend.entries, 'value')
    const min = entries[0].value
    const max = _.last(entries).value
    const dataTypes = {};
    [
        {band: 'class', precision: 'int', min, max},
        {band: 'regression', precision: 'float', min, max},
        {band: 'class_probability', precision: 'int', min: 0, max: 100},
        ...legend.entries.map(({value}) => supportProbability(classifierType) && {
            band: `probability_${value}`, precision: 'int', min: 0, max: 100
        })
    ].filter(o => o).forEach(({band, precision, min, max}) => dataTypes[band] = {precision, min, max})
    return dataTypes
}
