import React from 'react'

import {RecipeFormPanel, recipeFormPanel} from '~/app/home/body/process/recipeFormPanel'
import {compose} from '~/compose'
import {msg} from '~/translate'
import {Form} from '~/widget/form'
import {Layout} from '~/widget/layout'
import {Panel} from '~/widget/panel/panel'

import {ForestMask, forestMaskFields} from './forestMask/forestMask'
import {forestMaskToValues, toForestMask} from './forestMask/forestMaskModel'
import styles from './options.module.css'

const fields = {
    threshold: new Form.Field()
        .notBlank()
        .number(),
    consecutiveObservations: new Form.Field()
        .notBlank()
        .int(),
    ...forestMaskFields
}

class _Options extends React.Component {
    render() {
        return (
            <RecipeFormPanel
                className={styles.panel}
                placement='bottom-right'>
                <Panel.Header
                    icon='cog'
                    title={msg('process.dias.panel.options.title')}/>
                <Panel.Content>
                    <Layout>
                        {this.renderThreshold()}
                        {this.renderConsecutiveObservations()}
                        <ForestMask inputs={this.props.inputs}/>
                    </Layout>
                </Panel.Content>
                <Form.PanelButtons/>
            </RecipeFormPanel>
        )
    }

    renderThreshold() {
        const {inputs: {threshold}} = this.props
        return (
            <Form.Slider
                label={msg('process.dias.panel.options.form.threshold.label')}
                tooltip={msg('process.dias.panel.options.form.threshold.tooltip')}
                input={threshold}
                minValue={0.5}
                maxValue={6}
                decimals={1}
                ticks={[0.5, 1, 2, 3, 4, 5, 6]}
                info={value => msg('process.dias.panel.options.form.threshold.value', {value})}
            />
        )
    }

    renderConsecutiveObservations() {
        const {inputs: {consecutiveObservations}} = this.props
        return (
            <Form.Slider
                label={msg('process.dias.panel.options.form.consecutiveObservations.label')}
                tooltip={msg('process.dias.panel.options.form.consecutiveObservations.tooltip')}
                input={consecutiveObservations}
                minValue={2}
                maxValue={8}
                ticks={[2, 3, 4, 5, 6, 7, 8]}
                snap
            />
        )
    }
}

const modelToValues = ({threshold, consecutiveObservations, forestMask}) => ({
    threshold,
    consecutiveObservations,
    ...forestMaskToValues(forestMask)
})

const valuesToModel = values => ({
    threshold: values.threshold,
    consecutiveObservations: values.consecutiveObservations,
    forestMask: toForestMask(values)
})

export const Options = compose(
    _Options,
    recipeFormPanel({id: 'diasOptions', fields, modelToValues, valuesToModel})
)

Options.propTypes = {}
