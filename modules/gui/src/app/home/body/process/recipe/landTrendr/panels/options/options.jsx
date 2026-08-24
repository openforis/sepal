import React from 'react'

import {RecipeFormPanel, recipeFormPanel} from '~/app/home/body/process/recipeFormPanel'
import {compose} from '~/compose'
import {msg} from '~/translate'
import {Button} from '~/widget/button'
import {Form} from '~/widget/form'
import {Layout} from '~/widget/layout'
import {Panel} from '~/widget/panel/panel'

import styles from './options.module.css'

const fields = {
    changeDirection: new Form.Field()
        .notBlank(),
    minMagnitude: new Form.Field()
        .number()
        .min(0)
        .notBlank(),
    maxSegments: new Form.Field()
        .int()
        .greaterThan(0)
        .notBlank(),
    spikeThreshold: new Form.Field()
        .number()
        .min(0)
        .max(1)
        .notBlank(),
    vertexCountOvershoot: new Form.Field()
        .int()
        .min(0)
        .notBlank(),
    preventOneYearRecovery: new Form.Field(),
    recoveryThreshold: new Form.Field()
        .number()
        .min(0)
        .max(1)
        .notBlank(),
    pvalThreshold: new Form.Field()
        .number()
        .min(0)
        .max(1)
        .notBlank(),
    bestModelProportion: new Form.Field()
        .number()
        .min(0)
        .max(1)
        .notBlank(),
    minObservationsNeeded: new Form.Field()
        .int()
        .min(1)
        .notBlank()
}

class _Options extends React.Component {
    state = {advanced: false}

    render() {
        const {advanced} = this.state
        return (
            <RecipeFormPanel
                className={styles.panel}
                placement='bottom-right'>
                <Panel.Header
                    icon='cog'
                    title={msg('process.landTrendr.panel.options.title')}/>
                <Panel.Content>
                    <Layout>
                        {this.renderChangeDirection()}
                        {this.renderMinMagnitude()}
                        {advanced ? this.renderAdvanced() : this.renderSimple()}
                    </Layout>
                </Panel.Content>
                <Form.PanelButtons>
                    <Button
                        label={advanced ? msg('button.less') : msg('button.more')}
                        onClick={() => this.setState(({advanced}) => ({advanced: !advanced}))}/>
                </Form.PanelButtons>
            </RecipeFormPanel>
        )
    }

    renderSimple() {
        return this.renderMaxSegments()
    }

    renderAdvanced() {
        return (
            <div className={styles.twoColumns}>
                {this.renderMaxSegments()}
                {this.renderVertexCountOvershoot()}
                {this.renderSpikeThreshold()}
                {this.renderRecoveryThreshold()}
                {this.renderPvalThreshold()}
                {this.renderBestModelProportion()}
                {this.renderMinObservationsNeeded()}
                {this.renderPreventOneYearRecovery()}
            </div>
        )
    }

    renderChangeDirection() {
        const {inputs: {changeDirection}} = this.props
        return (
            <Form.Buttons
                label={msg('process.landTrendr.panel.options.form.changeDirection.label')}
                tooltip={msg('process.landTrendr.panel.options.form.changeDirection.tooltip')}
                input={changeDirection}
                multiple={false}
                options={[
                    {
                        value: 'GREATEST',
                        label: msg('process.landTrendr.panel.options.form.changeDirection.GREATEST.label'),
                        tooltip: msg('process.landTrendr.panel.options.form.changeDirection.GREATEST.tooltip')
                    },
                    {
                        value: 'LOSS',
                        label: msg('process.landTrendr.panel.options.form.changeDirection.LOSS.label'),
                        tooltip: msg('process.landTrendr.panel.options.form.changeDirection.LOSS.tooltip')
                    },
                    {
                        value: 'GAIN',
                        label: msg('process.landTrendr.panel.options.form.changeDirection.GAIN.label'),
                        tooltip: msg('process.landTrendr.panel.options.form.changeDirection.GAIN.tooltip')
                    }
                ]}
            />
        )
    }

    renderMinMagnitude() {
        const {inputs: {minMagnitude}} = this.props
        return (
            <Form.Input
                label={msg('process.landTrendr.panel.options.form.minMagnitude.label')}
                tooltip={msg('process.landTrendr.panel.options.form.minMagnitude.tooltip')}
                input={minMagnitude}
                type='number'
            />
        )
    }

    renderMaxSegments() {
        const {inputs: {maxSegments}} = this.props
        return (
            <Form.Input
                label={msg('process.landTrendr.panel.options.form.maxSegments.label')}
                tooltip={msg('process.landTrendr.panel.options.form.maxSegments.tooltip')}
                input={maxSegments}
                type='number'
            />
        )
    }

    renderSpikeThreshold() {
        const {inputs: {spikeThreshold}} = this.props
        return (
            <Form.Input
                label={msg('process.landTrendr.panel.options.form.spikeThreshold.label')}
                tooltip={msg('process.landTrendr.panel.options.form.spikeThreshold.tooltip')}
                input={spikeThreshold}
                type='number'
            />
        )
    }

    renderVertexCountOvershoot() {
        const {inputs: {vertexCountOvershoot}} = this.props
        return (
            <Form.Input
                label={msg('process.landTrendr.panel.options.form.vertexCountOvershoot.label')}
                tooltip={msg('process.landTrendr.panel.options.form.vertexCountOvershoot.tooltip')}
                input={vertexCountOvershoot}
                type='number'
            />
        )
    }

    renderPreventOneYearRecovery() {
        const {inputs: {preventOneYearRecovery}} = this.props
        return (
            <Form.Buttons
                label={msg('process.landTrendr.panel.options.form.preventOneYearRecovery.label')}
                tooltip={msg('process.landTrendr.panel.options.form.preventOneYearRecovery.tooltip')}
                input={preventOneYearRecovery}
                multiple={false}
                options={[
                    {value: true, label: msg('button.enabled')},
                    {value: false, label: msg('button.disabled')}
                ]}
            />
        )
    }

    renderRecoveryThreshold() {
        const {inputs: {recoveryThreshold}} = this.props
        return (
            <Form.Input
                label={msg('process.landTrendr.panel.options.form.recoveryThreshold.label')}
                tooltip={msg('process.landTrendr.panel.options.form.recoveryThreshold.tooltip')}
                input={recoveryThreshold}
                type='number'
            />
        )
    }

    renderPvalThreshold() {
        const {inputs: {pvalThreshold}} = this.props
        return (
            <Form.Input
                label={msg('process.landTrendr.panel.options.form.pvalThreshold.label')}
                tooltip={msg('process.landTrendr.panel.options.form.pvalThreshold.tooltip')}
                input={pvalThreshold}
                type='number'
            />
        )
    }

    renderBestModelProportion() {
        const {inputs: {bestModelProportion}} = this.props
        return (
            <Form.Input
                label={msg('process.landTrendr.panel.options.form.bestModelProportion.label')}
                tooltip={msg('process.landTrendr.panel.options.form.bestModelProportion.tooltip')}
                input={bestModelProportion}
                type='number'
            />
        )
    }

    renderMinObservationsNeeded() {
        const {inputs: {minObservationsNeeded}} = this.props
        return (
            <Form.Input
                label={msg('process.landTrendr.panel.options.form.minObservationsNeeded.label')}
                tooltip={msg('process.landTrendr.panel.options.form.minObservationsNeeded.tooltip')}
                input={minObservationsNeeded}
                type='number'
            />
        )
    }
}

const valuesToModel = values => ({
    changeDirection: values.changeDirection,
    minMagnitude: parseFloat(values.minMagnitude),
    maxSegments: parseInt(values.maxSegments),
    spikeThreshold: parseFloat(values.spikeThreshold),
    vertexCountOvershoot: parseInt(values.vertexCountOvershoot),
    preventOneYearRecovery: values.preventOneYearRecovery,
    recoveryThreshold: parseFloat(values.recoveryThreshold),
    pvalThreshold: parseFloat(values.pvalThreshold),
    bestModelProportion: parseFloat(values.bestModelProportion),
    minObservationsNeeded: parseInt(values.minObservationsNeeded)
})

const modelToValues = model => ({...model})

export const Options = compose(
    _Options,
    recipeFormPanel({id: 'landTrendrOptions', fields, modelToValues, valuesToModel})
)

Options.propTypes = {}
