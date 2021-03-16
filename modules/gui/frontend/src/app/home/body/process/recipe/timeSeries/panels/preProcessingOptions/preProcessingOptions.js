import {Form} from 'widget/form/form'
import {Layout} from 'widget/layout'
import {Panel} from 'widget/panel/panel'
import {RecipeFormPanel, recipeFormPanel} from 'app/home/body/process/recipeFormPanel'
import {compose} from 'compose'
import {msg} from 'translate'
import React from 'react'
import styles from './preProcessingOptions.module.css'

const fields = {
    corrections: new Form.Field(),
    cloudMasking: new Form.Field(),
    snowMasking: new Form.Field()
}

class PreProcessingOptions extends React.Component {
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
                        {this.renderCloudMaskingOptions()}
                        {this.renderSnowMaskingOptions()}
                    </Layout>
                </Panel.Content>
                <Form.PanelButtons/>
            </RecipeFormPanel>
        )
    }

    renderCorrectionsOptions() {
        const {inputs: {corrections}} = this.props
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
                type='horizontal-wrap'
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
            />
        )
    }
}

PreProcessingOptions.propTypes = {}

const valuesToModel = values => ({
    corrections: values.corrections,
    cloudMasking: values.cloudMasking,
    snowMasking: values.snowMasking
})

const modelToValues = model => {
    return ({
        corrections: model.corrections,
        mask: model.mask,
        cloudMasking: model.cloudMasking,
        snowMasking: model.snowMasking
    })
}

export default compose(
    PreProcessingOptions,
    recipeFormPanel({id: 'options', fields, modelToValues, valuesToModel})
)
