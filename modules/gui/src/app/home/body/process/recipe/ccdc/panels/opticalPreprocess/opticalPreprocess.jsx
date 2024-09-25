import _ from 'lodash'
import React from 'react'

import {RecipeFormPanel, recipeFormPanel} from '~/app/home/body/process/recipeFormPanel'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {Button} from '~/widget/button'
import {Form} from '~/widget/form'
import {Layout} from '~/widget/layout'
import {Panel} from '~/widget/panel/panel'

import styles from './opticalPreprocess.module.css'

const fields = {
    advanced: new Form.Field(),
    corrections: new Form.Field(),
    histogramMatching: new Form.Field(),
    cloudDetection: new Form.Field(),
    cloudMasking: new Form.Field(),
    shadowMasking: new Form.Field(),
    snowMasking: new Form.Field(),
    orbitOverlap: new Form.Field(),
    tileOverlap: new Form.Field(),
}

const mapRecipeToProps = recipe => ({
    sources: selectFrom(recipe, 'model.sources.dataSets'),
    dataSetType: selectFrom(recipe, 'model.sources.dataSetType'),
})

class _OpticalPreprocess extends React.Component {
    render() {
        const {inputs: {advanced}} = this.props
        return (
            <RecipeFormPanel
                className={styles.panel}
                placement='bottom-right'>
                <Panel.Header
                    icon='cog'
                    title={msg('process.ccdc.panel.preprocess.title')}/>
                <Panel.Content>
                    {advanced.value ? this.renderAdvanced() : this.renderSimple()}
                </Panel.Content>
                <Form.PanelButtons>
                    <Button
                        label={advanced.value ? msg('button.less') : msg('button.more')}
                        onClick={() => this.setAdvanced(!advanced.value)}/>
                </Form.PanelButtons>
            </RecipeFormPanel>
        )
    }

    renderSimple() {
        return (
            <Layout>
                {this.renderCorrectionsOptions()}
                {this.renderHistogramMatching()}
                {this.renderCloudDetectionOptions()}
                {this.renderCloudMaskingOptions()}
                <Layout type="horizontal" alignment="left" spacing="loose">
                    {this.renderShadowMaskingOptions()}
                    {this.renderSnowMaskingOptions()}
                </Layout>
            </Layout>
        )
    }

    renderAdvanced() {
        const {sources} = this.props
        const sentinel2 = Object.keys(sources).includes('SENTINEL_2')
        return (
            <Layout>
                {this.renderCorrectionsOptions()}
                {this.renderHistogramMatching()}
                {sentinel2 ? this.renderOrbitOverlap() : null}
                {sentinel2 ? this.renderTileOverlap() : null}
                {this.renderCloudDetectionOptions()}
                {this.renderCloudMaskingOptions()}
                <Layout type="horizontal" alignment="left" spacing="loose">
                    {this.renderShadowMaskingOptions()}
                    {this.renderSnowMaskingOptions()}
                </Layout>
            </Layout>
        )
    }

    renderCorrectionsOptions() {
        const {dataSetType, inputs: {corrections}} = this.props
        if (dataSetType === 'PLANET') {
            return null
        }
        return (
            <Form.Buttons
                label={msg('process.ccdc.panel.preprocess.form.corrections.label')}
                input={corrections}
                multiple={true}
                options={[{
                    value: 'SR',
                    label: msg('process.ccdc.panel.preprocess.form.corrections.surfaceReflectance.label'),
                    tooltip: msg('process.ccdc.panel.preprocess.form.corrections.surfaceReflectance.tooltip')
                }, {
                    value: 'BRDF',
                    label: msg('process.ccdc.panel.preprocess.form.corrections.brdf.label'),
                    tooltip: msg('process.ccdc.panel.preprocess.form.corrections.brdf.tooltip')
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
                label={msg('process.ccdc.panel.preprocess.form.cloudDetection.label')}
                input={cloudDetection}
                multiple
                options={[
                    {
                        value: 'QA',
                        label: msg('process.ccdc.panel.preprocess.form.cloudDetection.qa.label'),
                        tooltip: msg('process.ccdc.panel.preprocess.form.cloudDetection.qa.tooltip')
                    },
                    {
                        value: 'CLOUD_SCORE',
                        label: msg('process.ccdc.panel.preprocess.form.cloudDetection.cloudScore.label'),
                        tooltip: msg('process.ccdc.panel.preprocess.form.cloudDetection.cloudScore.tooltip')
                    },
                    {
                        value: 'PINO_26',
                        label: msg('process.ccdc.panel.preprocess.form.cloudDetection.pino26.label'),
                        tooltip: msg('process.ccdc.panel.preprocess.form.cloudDetection.pino26.tooltip'),
                        neverSelected: pino26Disabled
                    }
                ]}
                type='horizontal'
            />
        )
    }

    renderCloudMaskingOptions() {
        const {inputs: {cloudMasking}} = this.props
        return (
            <Form.Buttons
                label={msg('process.ccdc.panel.preprocess.form.cloudMasking.label')}
                input={cloudMasking}
                options={[{
                    value: 'MODERATE',
                    label: msg('process.ccdc.panel.preprocess.form.cloudMasking.moderate.label'),
                    tooltip: msg('process.ccdc.panel.preprocess.form.cloudMasking.moderate.tooltip')
                }, {
                    value: 'AGGRESSIVE',
                    label: msg('process.ccdc.panel.preprocess.form.cloudMasking.aggressive.label'),
                    tooltip: msg('process.ccdc.panel.preprocess.form.cloudMasking.aggressive.tooltip')
                }]}
                type='horizontal'
            />
        )
    }

    renderShadowMaskingOptions() {
        const {inputs: {shadowMasking}} = this.props
        return (
            <Form.Buttons
                label={msg('process.ccdc.panel.preprocess.form.shadowMasking.label')}
                input={shadowMasking}
                options={[{
                    value: 'OFF',
                    label: msg('process.ccdc.panel.preprocess.form.shadowMasking.off.label'),
                    tooltip: msg('process.ccdc.panel.preprocess.form.shadowMasking.off.tooltip')
                }, {
                    value: 'ON',
                    label: msg('process.ccdc.panel.preprocess.form.shadowMasking.on.label'),
                    tooltip: msg('process.ccdc.panel.preprocess.form.shadowMasking.on.tooltip')
                }]}
                type='horizontal-nowrap'
            />
        )
    }

    renderSnowMaskingOptions() {
        const {inputs: {snowMasking}} = this.props
        return (
            <Form.Buttons
                label={msg('process.ccdc.panel.preprocess.form.snowMasking.label')}
                input={snowMasking}
                options={[{
                    value: 'OFF',
                    label: msg('process.ccdc.panel.preprocess.form.snowMasking.off.label'),
                    tooltip: msg('process.ccdc.panel.preprocess.form.snowMasking.off.tooltip')
                }, {
                    value: 'ON',
                    label: msg('process.ccdc.panel.preprocess.form.snowMasking.on.label'),
                    tooltip: msg('process.ccdc.panel.preprocess.form.snowMasking.on.tooltip')
                }]}
                type='horizontal-nowrap'
            />
        )
    }

    renderOrbitOverlap() {
        const {inputs: {orbitOverlap}} = this.props
        return (
            <Form.Buttons
                label={msg('process.ccdc.panel.preprocess.form.orbitOverlap.label')}
                input={orbitOverlap}
                options={[{
                    value: 'KEEP',
                    label: msg('process.ccdc.panel.preprocess.form.orbitOverlap.keep.label'),
                    tooltip: msg('process.ccdc.panel.preprocess.form.orbitOverlap.keep.tooltip')
                }, {
                    value: 'REMOVE',
                    label: msg('process.ccdc.panel.preprocess.form.orbitOverlap.remove.label'),
                    tooltip: msg('process.ccdc.panel.preprocess.form.orbitOverlap.remove.tooltip')
                }]}
                type='horizontal-nowrap'
            />
        )
    }

    renderTileOverlap() {
        const {inputs: {tileOverlap}} = this.props
        return (
            <Form.Buttons
                label={msg('process.ccdc.panel.preprocess.form.tileOverlap.label')}
                input={tileOverlap}
                options={[{
                    value: 'KEEP',
                    label: msg('process.ccdc.panel.preprocess.form.tileOverlap.keep.label'),
                    tooltip: msg('process.ccdc.panel.preprocess.form.tileOverlap.keep.tooltip')
                }, {
                    value: 'QUICK_REMOVE',
                    label: msg('process.ccdc.panel.preprocess.form.tileOverlap.quickRemove.label'),
                    tooltip: msg('process.ccdc.panel.preprocess.form.tileOverlap.quickRemove.tooltip')
                }, {
                    value: 'REMOVE',
                    label: msg('process.ccdc.panel.preprocess.form.tileOverlap.remove.label'),
                    tooltip: msg('process.ccdc.panel.preprocess.form.tileOverlap.remove.tooltip')
                }]}
                type='horizontal-nowrap'
            />
        )
    }

    componentDidMount() {
        const {inputs: {histogramMatching, orbitOverlap, tileOverlap}} = this.props
        if (!histogramMatching.value) {
            histogramMatching.set('DISABLED')
        }
        if (!orbitOverlap.value) {
            orbitOverlap.set('KEEP')
        }
        if (!tileOverlap.value) {
            tileOverlap.set('KEEP')
        }
    }

    setAdvanced(enabled) {
        const {inputs: {advanced}} = this.props
        advanced.set(enabled)
    }
}

const valuesToModel = values => ({
    corrections: values.corrections,
    histogramMatching: values.histogramMatching,
    cloudDetection: values.cloudDetection,
    cloudMasking: values.cloudMasking,
    shadowMasking: values.shadowMasking,
    snowMasking: values.snowMasking,
    orbitOverlap: values.orbitOverlap,
    tileOverlap: values.tileOverlap,
})

const modelToValues = model => {
    return ({
        corrections: model.corrections,
        histogramMatching: model.histogramMatching,
        cloudDetection: model.cloudDetection,
        cloudMasking: model.cloudMasking,
        shadowMasking: model.shadowMasking,
        snowMasking: model.snowMasking,
        orbitOverlap: model.orbitOverlap,
        tileOverlap: model.tileOverlap,
    })
}

export const OpticalPreprocess = compose(
    _OpticalPreprocess,
    recipeFormPanel({id: 'options', fields, modelToValues, valuesToModel, mapRecipeToProps})
)

OpticalPreprocess.propTypes = {}
