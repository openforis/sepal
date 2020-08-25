import {Form} from 'widget/form/form'
import {Layout} from 'widget/layout'
import {Panel} from 'widget/panel/panel'
import {RecipeActions} from '../../ccdcRecipe'
import {RecipeFormPanel, recipeFormPanel} from 'app/home/body/process/recipeFormPanel'
import {compose} from 'compose'
import {msg} from 'translate'
import React from 'react'
import styles from './options.module.css'
import {Button} from 'widget/button'
import {breakDetectionOptions} from '../../ccdcRecipe'
import _ from 'lodash'

const fields = {
    advanced: new Form.Field(),
    breakDetection: new Form.Field(),
    minObservations: new Form.Field(),
    chiSquareProbability: new Form.Field(),
    minNumOfYearsScaler: new Form.Field(),
    lambda: new Form.Field(),
    maxIterations: new Form.Field()
}

class Options extends React.Component {
    constructor(props) {
        super(props)
        this.recipeActions = RecipeActions(props.recipeId)
    }

    render() {
        const {inputs: {advanced}} = this.props
        return (
            <RecipeFormPanel
                className={advanced.value ? styles.advanced : styles.simple}
                placement='bottom-right'>
                <Panel.Header
                    icon='cog'
                    title={msg('process.ccdc.panel.options.title')}/>
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

    renderAdvanced() {
        const {inputs: {minObservations, chiSquareProbability, minNumOfYearsScaler, lambda, maxIterations}} = this.props
        return (
            <Layout>
                <Form.Input
                    label={msg('process.ccdc.panel.options.form.minObservations')}
                    input={minObservations}
                />
                <Form.Input
                    label={msg('process.ccdc.panel.options.form.chiSquareProbability')}
                    input={chiSquareProbability}
                />
                <Form.Input
                    label={msg('process.ccdc.panel.options.form.minNumOfYearsScaler')}
                    input={minNumOfYearsScaler}
                />
                <Form.Input
                    label={msg('process.ccdc.panel.options.form.lambda')}
                    input={lambda}
                />
                <Form.Input
                    label={msg('process.ccdc.panel.options.form.maxIterations')}
                    input={maxIterations}
                />
            </Layout>
        )
    }

    renderSimple() {
        const {inputs: {breakDetection}} = this.props
        return (
            <Layout>
                <Form.Buttons
                    label={msg('process.ccdc.panel.options.form.breakDetection.label')}
                    input={breakDetection}
                    multiple={false}
                    options={[
                        {
                            value: 'conservative',
                            label: msg('process.ccdc.panel.options.form.breakDetection.conservative.label'),
                            tooltip: msg('process.ccdc.panel.options.form.breakDetection.conservative.tooltip')
                        },
                        {
                            value: 'moderate',
                            label: msg('process.ccdc.panel.options.form.breakDetection.moderate.label'),
                            tooltip: msg('process.ccdc.panel.options.form.breakDetection.moderate.tooltip')
                        },
                        {
                            value: 'aggressive',
                            label: msg('process.ccdc.panel.options.form.breakDetection.aggressive.label'),
                            tooltip: msg('process.ccdc.panel.options.form.breakDetection.aggressive.tooltip')
                        }
                    ]}
                />
            </Layout>
        )
    }

    setAdvanced(enabled) {
        const {inputs: {advanced, breakDetection}} = this.props
        const values = breakDetectionOptions[breakDetection.value]
        if (values) {
            Object.keys(values).forEach(field => this.props.inputs[field].set(values[field]))
        }
        advanced.set(enabled)
    }
}

Options.propTypes = {}

const valuesToModel = values => {
    if (values.advanced) {
        return {
            minObservations: values.minObservations,
            chiSquareProbability: values.chiSquareProbability,
            minNumOfYearsScaler: values.minNumOfYearsScaler,
            lambda: values.lambda,
            maxIterations: values.maxIterations
        }
    } else {
        return breakDetectionOptions[values.breakDetection]
    }
}

const modelToValues = model => {
    const breakDetection = modelToBreakDetection(model)
    console.log({breakDetection, model})
    return ({
        advanced: !breakDetection,
        breakDetection,
        ...model
    })
}

const modelToBreakDetection = model =>
    Object.keys(breakDetectionOptions).find(breakDetection =>
        _.isEqual(breakDetectionOptions[breakDetection], model)
    )

export default compose(
    Options,
    recipeFormPanel({id: 'ccdcOptions', fields, modelToValues, valuesToModel})
)
