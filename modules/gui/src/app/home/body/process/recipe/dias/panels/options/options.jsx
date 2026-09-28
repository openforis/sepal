import React from 'react'

import {RecipeFormPanel, recipeFormPanel} from '~/app/home/body/process/recipeFormPanel'
import {compose} from '~/compose'
import {msg} from '~/translate'
import {Form} from '~/widget/form'
import {Layout} from '~/widget/layout'
import {Panel} from '~/widget/panel/panel'

import styles from './options.module.css'

const fields = {
    threshold: new Form.Field()
        .notBlank()
        .number(),
    consecutiveObservations: new Form.Field()
        .notBlank()
        .int(),
    cloudMasking: new Form.Field()
        .notBlank()
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
                        {this.renderCloudMasking()}
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

    renderCloudMasking() {
        const {inputs: {cloudMasking}} = this.props
        return (
            <Form.Buttons
                label={msg('process.dias.panel.options.form.cloudMasking.label')}
                tooltip={msg('process.dias.panel.options.form.cloudMasking.tooltip')}
                input={cloudMasking}
                options={[
                    {value: 'OFF', label: msg('process.dias.panel.options.form.cloudMasking.OFF')},
                    {value: 'LIGHT', label: msg('process.dias.panel.options.form.cloudMasking.LIGHT'), tooltip: msg('process.dias.panel.options.form.cloudMasking.LIGHT.tooltip')},
                    {value: 'MODERATE', label: msg('process.dias.panel.options.form.cloudMasking.MODERATE')},
                    {value: 'AGGRESSIVE', label: msg('process.dias.panel.options.form.cloudMasking.AGGRESSIVE')}
                ]}
            />
        )
    }
}

export const Options = compose(
    _Options,
    recipeFormPanel({id: 'diasOptions', fields})
)

Options.propTypes = {}
