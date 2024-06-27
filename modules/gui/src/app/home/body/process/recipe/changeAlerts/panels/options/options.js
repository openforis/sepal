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
    advanced: new Form.Field(),
    minConfidence: new Form.Field(),
    numberOfObservations: new Form.Field(),
    minNumberOfChanges: new Form.Field(),
    mustBeConfirmedInMonitoring: new Form.Field(),
    mustBeStableBeforeChange: new Form.Field(),
    mustStayChanged: new Form.Field(),
}

class _Options extends React.Component {
    render() {
        const {inputs: {advanced}} = this.props
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
        return (
            <Layout>
                {this.renderMinConfidence()}
                {this.renderNumberOfObservations()}
                {this.renderMinNumberOfChanges()}
                {advanced.value ? this.renderAdvanced() : null}
            </Layout>
        )
    }

    renderAdvanced() {
        const {inputs: {mustBeConfirmedInMonitoring, mustBeStableBeforeChange, mustStayChanged}} = this.props
        const options = [
            {value: true, label: msg('button.enabled')},
            {value: false, label: msg('button.disabled')}
        ]
        return (
            <React.Fragment>
                <Form.Buttons
                    label={msg('process.changeAlerts.panel.options.form.mustBeConfirmedInMonitoring.label')}
                    tooltip={msg('process.changeAlerts.panel.options.form.mustBeConfirmedInMonitoring.tooltip')}
                    input={mustBeConfirmedInMonitoring}
                    options={options}
                />
                <Form.Buttons
                    label={msg('process.changeAlerts.panel.options.form.mustBeStableBeforeChange.label')}
                    tooltip={msg('process.changeAlerts.panel.options.form.mustBeStableBeforeChange.tooltip')}
                    input={mustBeStableBeforeChange}
                    options={options}
                />
                <Form.Buttons
                    label={msg('process.changeAlerts.panel.options.form.mustStayChanged.label')}
                    tooltip={msg('process.changeAlerts.panel.options.form.mustStayChanged.tooltip')}
                    input={mustStayChanged}
                    options={options}
                />
            </React.Fragment>
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
                snap
            />
        )
    }

    componentDidMount() {
        const {inputs: {mustBeConfirmedInMonitoring, mustBeStableBeforeChange, mustStayChanged}} = this.props
        if (typeof mustBeConfirmedInMonitoring.value != 'boolean') {
            mustBeConfirmedInMonitoring.set(true)
        }
        if (typeof mustBeStableBeforeChange.value != 'boolean') {
            mustBeStableBeforeChange.set(true)
        }
        if (typeof mustStayChanged.value != 'boolean') {
            mustStayChanged.set(true)
        }
    }

    setAdvanced(enabled) {
        const {inputs: {advanced}} = this.props
        advanced.set(enabled)
    }
}

export const Options = compose(
    _Options,
    recipeFormPanel({id: 'changeAlertsOptions', fields})
)

Options.propTypes = {}
