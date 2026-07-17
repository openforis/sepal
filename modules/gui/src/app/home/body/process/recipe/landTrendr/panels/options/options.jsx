import React from 'react'

import {RecipeFormPanel, recipeFormPanel} from '~/app/home/body/process/recipeFormPanel'
import {compose} from '~/compose'
import {msg} from '~/translate'
import {Form} from '~/widget/form'
import {Layout} from '~/widget/layout'
import {Panel} from '~/widget/panel/panel'

import styles from './options.module.css'

const fields = {
    changeDirection: new Form.Field()
        .notBlank(),
    maxSegments: new Form.Field()
        .int()
        .greaterThan(0),
    spikeThreshold: new Form.Field(),
    vertexCountOvershoot: new Form.Field()
        .int(),
    preventOneYearRecovery: new Form.Field(),
    recoveryThreshold: new Form.Field(),
    pvalThreshold: new Form.Field(),
    bestModelProportion: new Form.Field(),
    minObservationsNeeded: new Form.Field()
        .int()
}

class _Options extends React.Component {
    render() {
        const {
            inputs: {
                changeDirection, maxSegments, spikeThreshold, vertexCountOvershoot, preventOneYearRecovery,
                recoveryThreshold, pvalThreshold, bestModelProportion, minObservationsNeeded
            }
        } = this.props
        return (
            <RecipeFormPanel
                className={styles.panel}
                placement='bottom-right'>
                <Panel.Header
                    icon='cog'
                    title={msg('process.landTrendr.panel.options.title')}/>
                <Panel.Content>
                    <Layout>
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
                        <Form.Input
                            label={msg('process.landTrendr.panel.options.form.maxSegments.label')}
                            tooltip={msg('process.landTrendr.panel.options.form.maxSegments.tooltip')}
                            input={maxSegments}
                            type='number'
                        />
                        <Form.Input
                            label={msg('process.landTrendr.panel.options.form.spikeThreshold.label')}
                            tooltip={msg('process.landTrendr.panel.options.form.spikeThreshold.tooltip')}
                            input={spikeThreshold}
                            type='number'
                        />
                        <Form.Input
                            label={msg('process.landTrendr.panel.options.form.vertexCountOvershoot.label')}
                            tooltip={msg('process.landTrendr.panel.options.form.vertexCountOvershoot.tooltip')}
                            input={vertexCountOvershoot}
                            type='number'
                        />
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
                        <Form.Input
                            label={msg('process.landTrendr.panel.options.form.recoveryThreshold.label')}
                            tooltip={msg('process.landTrendr.panel.options.form.recoveryThreshold.tooltip')}
                            input={recoveryThreshold}
                            type='number'
                        />
                        <Form.Input
                            label={msg('process.landTrendr.panel.options.form.pvalThreshold.label')}
                            tooltip={msg('process.landTrendr.panel.options.form.pvalThreshold.tooltip')}
                            input={pvalThreshold}
                            type='number'
                        />
                        <Form.Input
                            label={msg('process.landTrendr.panel.options.form.bestModelProportion.label')}
                            tooltip={msg('process.landTrendr.panel.options.form.bestModelProportion.tooltip')}
                            input={bestModelProportion}
                            type='number'
                        />
                        <Form.Input
                            label={msg('process.landTrendr.panel.options.form.minObservationsNeeded.label')}
                            tooltip={msg('process.landTrendr.panel.options.form.minObservationsNeeded.tooltip')}
                            input={minObservationsNeeded}
                            type='number'
                        />
                    </Layout>
                </Panel.Content>
                <Form.PanelButtons/>
            </RecipeFormPanel>
        )
    }
}

const valuesToModel = values => ({
    changeDirection: values.changeDirection,
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
