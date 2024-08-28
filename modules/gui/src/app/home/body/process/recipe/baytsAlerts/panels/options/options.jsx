import _ from 'lodash'
import React from 'react'

import {RecipeFormPanel, recipeFormPanel} from '~/app/home/body/process/recipeFormPanel'
import {compose} from '~/compose'
import {msg} from '~/translate'
import {Button} from '~/widget/button'
import {Form} from '~/widget/form'
import {Layout} from '~/widget/layout'
import {Panel} from '~/widget/panel/panel'

import {alertsBands} from '../../bands'
import styles from './options.module.css'

const fields = {
    advanced: new Form.Field(),
    previousAlertsAsset: new Form.Field(),
    wetlandMaskAsset: new Form.Field(),
    normalization: new Form.Field(),
    sensitivity: new Form.Field()
        .number()
        .min(0.1)
        .max(10)
        .notBlank(),
    maxDays: new Form.Field()
        .number()
        .min(1)
        .notBlank(),
    highConfidenceThreshold: new Form.Field()
        .number()
        .min(0.5)
        .max(1)
        .notBlank(),
    lowConfidenceThreshold: new Form.Field()
        .number()
        .min(0.1)
        .max(1)
        .notBlank(),
    minNonForestProbability: new Form.Field()
        .number()
        .min(0.1)
        .max(1)
        .notBlank(),
    minChangeProbability: new Form.Field()
        .number()
        .min(0.1)
        .max(1)
        .notBlank()
}

const constraints = {
    confidenceThreshold: new Form.Constraint(['highConfidenceThreshold', 'lowConfidenceThreshold'])
        .skip(({highConfidenceThreshold}) => !highConfidenceThreshold)
        .predicate(({highConfidenceThreshold, lowConfidenceThreshold}) =>
            lowConfidenceThreshold < highConfidenceThreshold, 'process.baytsAlerts.panel.options.form.lowConfidenceThreshold.tooLarge'
        )
}

class _Options extends React.Component {
    constructor(props) {
        super(props)
        this.onPreviousAlertsAssetLoaded = this.onPreviousAlertsAssetLoaded.bind(this)
    }

    render() {
        const {inputs: {advanced}} = this.props
        return (
            <RecipeFormPanel
                className={styles.panel}
                placement='bottom-right'>
                <Panel.Header
                    icon='cog'
                    title={msg('process.baytsAlerts.panel.options.title')}/>
                <Panel.Content>
                    {this.renderContent()}
                </Panel.Content>
                <Form.PanelButtons>
                    <Button
                        label={advanced.value ? msg('button.less') : msg('button.more')}
                        onClick={() => this.setAdvanced(!advanced.value)}/>
                </Form.PanelButtons>
            </RecipeFormPanel>
        )
    }

    renderContent() {
        const {inputs: {advanced}} = this.props
        return advanced.value ? this.renderAdvanced() : this.renderSimple()
    }

    renderSimple() {
        return (
            <Layout>
                {this.renderPreviousAlertsAsset()}
                <Layout type='horizontal'>
                    {this.renderNormalization()}
                    {this.renderSensitivityButtons()}
                </Layout>
                <Layout type='horizontal'>
                    {this.renderHighConfidenceThreshold()}
                    {this.renderLowConfidenceThreshold()}
                </Layout>
            </Layout>
        )
    }

    renderAdvanced() {
        return (
            <Layout>
                {this.renderPreviousAlertsAsset()}
                {this.renderWetlandMaskAsset()}
                {this.renderNormalization()}
                {this.renderSensitivity()}
                <Layout type='horizontal'>
                    {this.renderHighConfidenceThreshold()}
                    {this.renderLowConfidenceThreshold()}
                </Layout>
                <Layout type='horizontal'>
                    {this.renderMinNonForestProbability()}
                    {this.renderChangeProbability()}
                </Layout>
                <Layout>
                    {this.renderMaxDays()}
                </Layout>
            </Layout>
        )
    }

    renderPreviousAlertsAsset() {
        const {inputs: {previousAlertsAsset}} = this.props
        return (
            <Form.AssetCombo
                input={previousAlertsAsset}
                label={msg('process.baytsAlerts.panel.options.form.previousAlertsAsset.label')}
                placeholder={msg('process.baytsAlerts.panel.options.form.previousAlertsAsset.placeholder')}
                tooltip={msg('process.baytsAlerts.panel.options.form.previousAlertsAsset.tooltip')}
                autoFocus
                allowedTypes={['Image', 'ImageCollection']}
                onLoaded={this.onPreviousAlertsAssetLoaded}
            />
        )
    }

    renderWetlandMaskAsset() {
        const {inputs: {wetlandMaskAsset}} = this.props
        return (
            <Form.AssetCombo
                input={wetlandMaskAsset}
                label={msg('process.baytsAlerts.panel.options.form.wetlandMaskAsset.label')}
                placeholder={msg('process.baytsAlerts.panel.options.form.wetlandMaskAsset.placeholder')}
                tooltip={msg('process.baytsAlerts.panel.options.form.wetlandMaskAsset.tooltip')}
                allowedTypes={['Image', 'ImageCollection']}
            />
        )
    }

    renderNormalization() {
        const {inputs: {normalization}} = this.props
        const options = [
            {
                value: 'DISABLED',
                label: msg('process.baytsAlerts.panel.options.form.normalization.disabled.label'),
                tooltip: msg('process.baytsAlerts.panel.options.form.normalization.disabled.tooltip'),
            },
            {
                value: 'ENABLED',
                label: msg('process.baytsAlerts.panel.options.form.normalization.enabled.label'),
                tooltip: msg('process.baytsAlerts.panel.options.form.normalization.enabled.tooltip')
            },
        ]
        return (
            <Form.Buttons
                type='number'
                label={msg('process.baytsAlerts.panel.options.form.normalization.label')}
                tooltip={msg('process.baytsAlerts.panel.options.form.normalization.tooltip')}
                input={normalization}
                options={options}
            />
        )
    }

    renderSensitivityButtons() {
        const {inputs: {sensitivity}} = this.props
        const options = [
            {
                value: 1.2,
                label: msg('process.baytsAlerts.panel.options.form.sensitivityButton.low.label'),
                tooltip: msg('process.baytsAlerts.panel.options.form.sensitivityButton.low.tooltip'),
            },
            {
                value: 1,
                label: msg('process.baytsAlerts.panel.options.form.sensitivityButton.medium.label'),
                tooltip: msg('process.baytsAlerts.panel.options.form.sensitivityButton.medium.tooltip'),
            },
            {
                value: 0.8,
                label: msg('process.baytsAlerts.panel.options.form.sensitivityButton.high.label'),
                tooltip: msg('process.baytsAlerts.panel.options.form.sensitivityButton.high.tooltip'),
            },
        ]
        return (
            <Form.Buttons
                label={msg('process.baytsAlerts.panel.options.form.sensitivity.label')}
                tooltip={msg('process.baytsAlerts.panel.options.form.sensitivityButton.tooltip')}
                input={sensitivity}
                options={options}
            />
        )
    }

    renderSensitivity() {
        const {inputs: {sensitivity}} = this.props
        return (

            <Form.Slider
                label={msg('process.baytsAlerts.panel.options.form.sensitivity.label')}
                tooltip={msg('process.baytsAlerts.panel.options.form.sensitivity.tooltip')}
                input={sensitivity}
                minValue={0.5}
                maxValue={1.5}
                ticks={[0.5, 0.8, 1, 1.2, 1.5]}
                scale='log'
                decimals={2}
                info={value => msg('process.baytsAlerts.panel.options.form.sensitivity.value', {value})}
            />
        )
    }

    renderMaxDays() {
        const {inputs: {maxDays}} = this.props
        return (
            <Form.Input
                className={styles.input}
                type='number'
                label={msg('process.baytsAlerts.panel.options.form.maxDays.label')}
                tooltip={msg('process.baytsAlerts.panel.options.form.maxDays.tooltip')}
                input={maxDays}
            />
        )
    }

    renderLowConfidenceThreshold() {
        const {inputs: {lowConfidenceThreshold}} = this.props
        return (
            <Form.Input
                className={styles.input}
                type='number'
                label={msg('process.baytsAlerts.panel.options.form.lowConfidenceThreshold.label')}
                tooltip={msg('process.baytsAlerts.panel.options.form.lowConfidenceThreshold.tooltip')}
                input={lowConfidenceThreshold}
                errorMessage={[lowConfidenceThreshold, 'confidenceThreshold']}
            />
        )
    }

    renderHighConfidenceThreshold() {
        const {inputs: {highConfidenceThreshold}} = this.props
        return (
            <Form.Input
                className={styles.input}
                type='number'
                label={msg('process.baytsAlerts.panel.options.form.highConfidenceThreshold.label')}
                tooltip={msg('process.baytsAlerts.panel.options.form.highConfidenceThreshold.tooltip')}
                input={highConfidenceThreshold}
            />
        )
    }

    renderMinNonForestProbability() {
        const {inputs: {minNonForestProbability}} = this.props
        return (
            <Form.Input
                className={styles.input}
                type='number'
                label={msg('process.baytsAlerts.panel.options.form.minNonForestProbability.label')}
                tooltip={msg('process.baytsAlerts.panel.options.form.minNonForestProbability.tooltip')}
                input={minNonForestProbability}
            />
        )
    }

    renderChangeProbability() {
        const {inputs: {minChangeProbability}} = this.props
        return (
            <Form.Input
                className={styles.input}
                type='number'
                label={msg('process.baytsAlerts.panel.options.form.minChangeProbability.label')}
                tooltip={msg('process.baytsAlerts.panel.options.form.minChangeProbability.tooltip')}
                input={minChangeProbability}
            />
        )
    }

    onPreviousAlertsAssetLoaded({metadata}) {
        const {inputs: {previousAlertsAsset}} = this.props
        const bands = metadata.bands.map(({id}) => id)
        const requiredBands = Object.keys(alertsBands())
        const missingBands = requiredBands
            .filter(requiredBand => !bands.includes(requiredBand))
        if (missingBands.length) {
            previousAlertsAsset.setInvalid(msg(
                'process.baytsAlerts.panel.options.form.previousAlertsAsset.missingBands',
                {missingBands: missingBands.join(', ')}
            ))
            
        }
    }

    setAdvanced(enabled) {
        const {inputs: {advanced}} = this.props
        advanced.set(enabled)
    }
}
const modelToValues = model => {
    return {
        ...model,
        previousAlertsAsset: model.previousAlertsAsset?.id
    }
}

const valuesToModel = values => {
    return {
        ...values,
        sensitivity: toFloat(values.sensitivity),
        maxDays: toInt(values.maxDays),
        highConfidenceThreshold: toFloat(values.highConfidenceThreshold),
        lowConfidenceThreshold: toFloat(values.lowConfidenceThreshold),
        minNonForestProbability: toFloat(values.minNonForestProbability),
        minChangeProbability: toFloat(values.minChangeProbability),
        previousAlertsAsset: values.previousAlertsAsset
            ? {
                type: 'ASSET',
                id: values.previousAlertsAsset,
            }
            : undefined
    }
}

const toInt = input => {
    input = _.isString(input) ? input : _.toString(input)
    const parsed = parseInt(input)
    return _.isFinite(parsed) ? parsed : null
}

const toFloat = input => {
    input = _.isString(input) ? input : _.toString(input)
    const parsed = parseFloat(input)
    return _.isFinite(parsed) ? parsed : null
}

export const Options = compose(
    _Options,
    recipeFormPanel({id: 'baytsAlertsOptions', fields, constraints, modelToValues, valuesToModel})
)

Options.propTypes = {}
