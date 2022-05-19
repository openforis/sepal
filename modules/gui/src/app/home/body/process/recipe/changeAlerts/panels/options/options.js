import {Form} from 'widget/form/form'
import {Layout} from 'widget/layout'
import {Panel} from 'widget/panel/panel'
import {RecipeFormPanel, recipeFormPanel} from 'app/home/body/process/recipeFormPanel'
import {compose} from 'compose'
import {msg} from 'translate'
import React from 'react'
import styles from './options.module.css'

const fields = {
    minConfidence: new Form.Field(),
    numberOfObservations: new Form.Field(),
    minNumberOfChanges: new Form.Field()
}

class Options extends React.Component {
    render() {
        return (
            <RecipeFormPanel
                className={styles.panel}
                placement='bottom-right'>
                <Panel.Header
                    icon='cog'
                    title={msg('process.changeAlerts.panel.options.title')}/>
                <Panel.Content>
                    {this.renderContent()}
                </Panel.Content>
                <Form.PanelButtons/>
            </RecipeFormPanel>
        )
    }

    renderContent() {
        return (
            <Layout>
                {this.renderMinConfidence()}
                {this.renderNumberOfObservations()}
                {this.renderMinNumberOfChanges()}
            </Layout>
        )
    }

    renderMinConfidence() {
        const {inputs: {minConfidence}} = this.props
        return (
            <Form.Slider
                label={msg('process.changeAlerts.panel.options.form.minConfidence.label')}
                tooltip={msg('process.changeAlerts.panel.options.form.minConfidence.tooltip')}
                input={minConfidence}
                minValue={0}
                maxValue={10}
                decimals={1}
                ticks={[0, 1, 3, 5, 10]}
                range='high'
                scale='log'
                info={value => msg('process.changeAlerts.panel.options.form.minConfidence.value', {value})}
            />
        )
    }

    renderNumberOfObservations() {
        const {inputs: {numberOfObservations}} = this.props
        return (
            <Form.Slider
                label={msg('process.changeAlerts.panel.options.form.numberOfObservations.label')}
                tooltip={msg('process.changeAlerts.panel.options.form.numberOfObservations.tooltip')}
                input={numberOfObservations}
                minValue={1}
                maxValue={10}
                ticks={[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]}
                snap
            />
        )
    }

    renderMinNumberOfChanges() {
        const {inputs: {numberOfObservations, minNumberOfChanges}} = this.props
        const count = numberOfObservations.value || 0
        const minValue = Math.ceil(count / 2)
        const maxValue = count

        return (
            <Form.Slider
                label={msg('process.changeAlerts.panel.options.form.minNumberOfChanges.label')}
                tooltip={msg('process.changeAlerts.panel.options.form.minNumberOfChanges.tooltip')}
                input={minNumberOfChanges}
                minValue={minValue}
                maxValue={maxValue}
                ticks={[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]}
                range='high'
                snap
            />
        )
    }
}

Options.propTypes = {}

export default compose(
    Options,
    recipeFormPanel({id: 'changeAlertsOptions', fields})
)
