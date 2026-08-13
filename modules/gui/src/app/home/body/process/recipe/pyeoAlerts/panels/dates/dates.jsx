import moment from 'moment'
import React from 'react'

import {withRecipe} from '~/app/home/body/process/recipeContext'
import {RecipeFormPanel, recipeFormPanel} from '~/app/home/body/process/recipeFormPanel'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {Form} from '~/widget/form'
import {Layout} from '~/widget/layout'
import {Panel} from '~/widget/panel/panel'
import {Widget} from '~/widget/widget'

import styles from './dates.module.css'

const DATE_FORMAT = 'YYYY-MM-DD'
const MIN_DATE = '1982-08-22'

const fields = {
    baselineStart: new Form.Field()
        .notBlank('process.pyeoAlerts.panel.dates.form.baselineStart.required')
        .date(DATE_FORMAT, 'process.pyeoAlerts.panel.dates.form.baselineStart.malformed'),
    baselineEnd: new Form.Field()
        .notBlank('process.pyeoAlerts.panel.dates.form.baselineEnd.required')
        .date(DATE_FORMAT, 'process.pyeoAlerts.panel.dates.form.baselineEnd.malformed'),
    monitoringStart: new Form.Field()
        .notBlank('process.pyeoAlerts.panel.dates.form.monitoringStart.required')
        .date(DATE_FORMAT, 'process.pyeoAlerts.panel.dates.form.monitoringStart.malformed'),
    monitoringEnd: new Form.Field()
        .notBlank('process.pyeoAlerts.panel.dates.form.monitoringEnd.required')
        .date(DATE_FORMAT, 'process.pyeoAlerts.panel.dates.form.monitoringEnd.malformed')
}

const constraints = {
    baselineStartBeforeEnd: new Form.Constraint(['baselineStart', 'baselineEnd'])
        .skip(({baselineEnd}) => !baselineEnd)
        .predicate(({baselineStart, baselineEnd}) => baselineStart < baselineEnd,
            'process.pyeoAlerts.panel.dates.form.baselineStart.beforeEnd'),
    monitoringStartBeforeEnd: new Form.Constraint(['monitoringStart', 'monitoringEnd'])
        .skip(({monitoringEnd}) => !monitoringEnd)
        .predicate(({monitoringStart, monitoringEnd}) => monitoringStart < monitoringEnd,
            'process.pyeoAlerts.panel.dates.form.monitoringStart.beforeEnd'),
    baselineBeforeMonitoring: new Form.Constraint(['baselineEnd', 'monitoringStart'])
        .skip(({baselineEnd, monitoringStart}) => !baselineEnd || !monitoringStart)
        .predicate(({baselineEnd, monitoringStart}) => baselineEnd <= monitoringStart,
            'process.pyeoAlerts.panel.dates.form.baselineEnd.beforeMonitoring')
}

const mapRecipeToProps = recipe => ({
    derived: selectFrom(recipe, 'model.dates.derived')
})

class _Dates extends React.Component {
    render() {
        return (
            <RecipeFormPanel
                className={styles.panel}
                placement='bottom-right'>
                <Panel.Header
                    icon='calendar'
                    title={msg('process.pyeoAlerts.panel.dates.title')}/>
                <Panel.Content>
                    <Layout>
                        {this.props.derived ? this.renderDerivedInfo() : this.renderBaseline()}
                        {this.renderMonitoring()}
                    </Layout>
                </Panel.Content>
                <Form.PanelButtons/>
            </RecipeFormPanel>
        )
    }

    renderDerivedInfo() {
        const {inputs: {baselineStart, baselineEnd}} = this.props
        return (
            <Form.FieldSet
                label={msg('process.pyeoAlerts.panel.dates.form.baseline.label')}
                layout='horizontal'>
                <Widget
                    label={msg('process.pyeoAlerts.panel.dates.form.baselineStart.label')}
                    disabled>
                    {baselineStart.value}
                </Widget>
                <Widget
                    label={msg('process.pyeoAlerts.panel.dates.form.baselineEnd.label')}
                    disabled>
                    {baselineEnd.value}
                </Widget>
            </Form.FieldSet>
        )
    }

    renderBaseline() {
        const {inputs: {baselineStart, baselineEnd, monitoringStart}} = this.props
        return (
            <Form.FieldSet
                label={msg('process.pyeoAlerts.panel.dates.form.baseline.label')}
                layout='horizontal'
                errorMessage={[baselineStart, baselineEnd, 'baselineStartBeforeEnd']}>
                <Form.DatePicker
                    label={msg('process.pyeoAlerts.panel.dates.form.baselineStart.label')}
                    input={baselineStart}
                    startDate={MIN_DATE}
                    endDate={baselineEnd.value || moment()}
                />
                <Form.DatePicker
                    label={msg('process.pyeoAlerts.panel.dates.form.baselineEnd.label')}
                    input={baselineEnd}
                    startDate={baselineStart.value || MIN_DATE}
                    endDate={monitoringStart.value || moment()}
                />
            </Form.FieldSet>
        )
    }

    renderMonitoring() {
        const {inputs: {baselineEnd, monitoringStart, monitoringEnd}} = this.props
        return (
            <Form.FieldSet
                label={msg('process.pyeoAlerts.panel.dates.form.monitoring.label')}
                layout='horizontal'
                errorMessage={[
                    monitoringStart,
                    monitoringEnd,
                    'monitoringStartBeforeEnd',
                    'baselineBeforeMonitoring'
                ]}>
                <Form.DatePicker
                    label={msg('process.pyeoAlerts.panel.dates.form.monitoringStart.label')}
                    input={monitoringStart}
                    startDate={baselineEnd.value || MIN_DATE}
                    endDate={monitoringEnd.value || moment()}
                    disabled={this.props.derived}
                />
                <Form.DatePicker
                    label={msg('process.pyeoAlerts.panel.dates.form.monitoringEnd.label')}
                    input={monitoringEnd}
                    startDate={monitoringStart.value || baselineEnd.value || MIN_DATE}
                    endDate={moment()}
                />
            </Form.FieldSet>
        )
    }
}

export const Dates = compose(
    _Dates,
    withRecipe(mapRecipeToProps),
    recipeFormPanel({id: 'dates', fields, constraints})
)
