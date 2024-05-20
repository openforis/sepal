import _ from 'lodash'
import React from 'react'

import {RecipeFormPanel, recipeFormPanel} from '~/app/home/body/process/recipeFormPanel'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {Form} from '~/widget/form'
import {Layout} from '~/widget/layout'
import {Panel} from '~/widget/panel/panel'

import styles from './preProcessingOptions.module.css'

const fields = {
    corrections: new Form.Field(),
    histogramMatching: new Form.Field(),
    cloudDetection: new Form.Field().notEmpty(),
    cloudMasking: new Form.Field(),
    snowMasking: new Form.Field()
}

const mapRecipeToProps = recipe => ({
    sources: selectFrom(recipe, 'model.sources.dataSets'),
    dataSetType: selectFrom(recipe, 'model.sources.dataSetType')
})

class _PreProcessingOptions extends React.Component {
    render() {
        return (
            <RecipeFormPanel
                className={styles.panel}
                placement='bottom-right'>
                <Panel.Header
                    icon='cog'
                    title={msg('process.timeSeries.panel.preprocess.title')}/>
                <Panel.Content>
                    <Layout>
                        {this.renderCorrectionsOptions()}
                        {this.renderHistogramMatching()}
                        {this.renderCloudDetectionOptions()}
                        {this.renderCloudMaskingOptions()}
                        {this.renderSnowMaskingOptions()}
                    </Layout>
                </Panel.Content>
                <Form.PanelButtons/>
            </RecipeFormPanel>
        )
    }

    renderCorrectionsOptions() {
        const {dataSetType, inputs: {corrections}} = this.props
        if (dataSetType === 'PLANET') {
            return null
        }
        return (
            <Form.Buttons
                label={msg('process.timeSeries.panel.preprocess.form.corrections.label')}
                input={corrections}
                multiple={true}
                options={[{
                    value: 'SR',
                    label: msg('process.timeSeries.panel.preprocess.form.corrections.surfaceReflectance.label'),
                    tooltip: msg('process.timeSeries.panel.preprocess.form.corrections.surfaceReflectance.tooltip')
                }, {
                    value: 'BRDF',
                    label: msg('process.timeSeries.panel.preprocess.form.corrections.brdf.label'),
                    tooltip: msg('process.timeSeries.panel.preprocess.form.corrections.brdf.tooltip')
                }]}
            />
        )
    }

    renderHistogramMatching() {
        const {dataSetType, inputs: {histogramMatching}} = this.props
        if (dataSetType !== 'PLANET') {
            return null
        }
        const options = [
            {value: 'ENABLED', label: msg('process.planetMosaic.panel.options.form.histogramMatching.options.ENABLED')},
            {value: 'DISABLED', label: msg('process.planetMosaic.panel.options.form.histogramMatching.options.DISABLED')},
        ]
        return (
            <Form.Buttons
                label={msg('process.planetMosaic.panel.options.form.histogramMatching.label')}
                tooltip={msg('process.planetMosaic.panel.options.form.histogramMatching.tooltip')}
                input={histogramMatching}
                options={options}
            />
        )
    }

    renderCloudDetectionOptions() {
        const {sources, inputs: {corrections, cloudDetection}} = this.props
        const pino26Disabled = corrections.value.includes('SR') || !_.isEqual(Object.keys(sources), ['SENTINEL_2'])
        return (
            <Form.Buttons
                label={msg('process.timeSeries.panel.preprocess.form.cloudDetection.label')}
                input={cloudDetection}
                multiple
                options={[
                    {
                        value: 'QA',
                        label: msg('process.timeSeries.panel.preprocess.form.cloudDetection.qa.label'),
                        tooltip: msg('process.timeSeries.panel.preprocess.form.cloudDetection.qa.tooltip')
                    },
                    {
                        value: 'CLOUD_SCORE',
                        label: msg('process.timeSeries.panel.preprocess.form.cloudDetection.cloudScore.label'),
                        tooltip: msg('process.timeSeries.panel.preprocess.form.cloudDetection.cloudScore.tooltip')
                    },
                    {
                        value: 'PINO_26',
                        label: msg('process.timeSeries.panel.preprocess.form.cloudDetection.pino26.label'),
                        tooltip: msg('process.timeSeries.panel.preprocess.form.cloudDetection.pino26.tooltip'),
                        neverSelected: pino26Disabled
                    }
                ]}
                type='horizontal'
                disabled={this.noProcessing()}
            />
        )
    }

    renderCloudMaskingOptions() {
        const {inputs: {cloudMasking}} = this.props
        return (
            <Form.Buttons
                label={msg('process.timeSeries.panel.preprocess.form.cloudMasking.label')}
                input={cloudMasking}
                options={[{
                    value: 'MODERATE',
                    label: msg('process.timeSeries.panel.preprocess.form.cloudMasking.moderate.label'),
                    tooltip: msg('process.timeSeries.panel.preprocess.form.cloudMasking.moderate.tooltip')
                }, {
                    value: 'AGGRESSIVE',
                    label: msg('process.timeSeries.panel.preprocess.form.cloudMasking.aggressive.label'),
                    tooltip: msg('process.timeSeries.panel.preprocess.form.cloudMasking.aggressive.tooltip')
                }]}
                type='horizontal'
                disabled={this.noProcessing()}
            />
        )
    }

    renderSnowMaskingOptions() {
        const {inputs: {snowMasking}} = this.props
        return (
            <Form.Buttons
                label={msg('process.timeSeries.panel.preprocess.form.snowMasking.label')}
                input={snowMasking}
                options={[{
                    value: 'OFF',
                    label: msg('process.timeSeries.panel.preprocess.form.snowMasking.off.label'),
                    tooltip: msg('process.timeSeries.panel.preprocess.form.snowMasking.off.tooltip')
                }, {
                    value: 'ON',
                    label: msg('process.timeSeries.panel.preprocess.form.snowMasking.on.label'),
                    tooltip: msg('process.timeSeries.panel.preprocess.form.snowMasking.on.tooltip')
                }]}
                type='horizontal-nowrap'
                disabled={this.noProcessing()}
            />
        )
    }

    componentDidMount() {
        const {inputs: {histogramMatching}} = this.props
        if (!histogramMatching.value) {
            histogramMatching.set('DISABLED')
        }
    }

    noProcessing() {
        const {sources, inputs: {histogramMatching}} = this.props
        return Object.values(sources).flat().includes('DAILY') && histogramMatching.value !== 'ENABLED'
    }
}

const valuesToModel = values => ({
    corrections: values.corrections,
    histogramMatching: values.histogramMatching,
    cloudDetection: values.cloudDetection,
    cloudMasking: values.cloudMasking,
    snowMasking: values.snowMasking
})

const modelToValues = model => {
    return ({
        corrections: model.corrections,
        histogramMatching: model.histogramMatching,
        mask: model.mask,
        cloudDetection: model.cloudDetection,
        cloudMasking: model.cloudMasking,
        snowMasking: model.snowMasking
    })
}

export const PreProcessingOptions = compose(
    _PreProcessingOptions,
    recipeFormPanel({id: 'options', fields, modelToValues, valuesToModel, mapRecipeToProps})
)

PreProcessingOptions.propTypes = {}
