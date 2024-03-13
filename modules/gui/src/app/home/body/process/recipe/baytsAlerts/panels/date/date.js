import {Form} from 'widget/form'
import {Layout} from 'widget/layout'
import {Panel} from 'widget/panel/panel'
import {RecipeFormPanel, recipeFormPanel} from 'app/home/body/process/recipeFormPanel'
import {Widget} from 'widget/widget'
import {compose} from 'compose'
import {msg} from 'translate'
import React from 'react'
import moment from 'moment'
import styles from './date.module.css'

const DATE_FORMAT = 'YYYY-MM-DD'

const fields = {
    monitoringEnd: new Form.Field()
        .notBlank()
        .date(DATE_FORMAT),
    monitoringDuration: new Form.Field()
        .notBlank()
        .int(),
    monitoringDurationUnit: new Form.Field()
        .notBlank()
}

class _Date extends React.Component {
    render() {
        return (
            <RecipeFormPanel
                className={styles.panel}
                placement='bottom-right'>
                <Panel.Header
                    icon='cog'
                    title={msg('process.baytsAlerts.panel.date.title')}/>
                <Panel.Content>
                    <Layout>
                        {this.renderContent()}
                    </Layout>
                </Panel.Content>
                <Form.PanelButtons/>
            </RecipeFormPanel>
        )
    }

    renderContent() {
        return (
            <Layout type='vertical'>
                {this.renderMonitoringEnd()}
                {this.renderDuration('monitoring')}
            </Layout>
        )
    }

    renderMonitoringEnd() {
        const {inputs: {monitoringEnd}} = this.props
        var dateRange = this.dateRange()
        return (
            <Form.DatePicker
                label={msg('process.baytsAlerts.panel.date.form.monitoringEnd.label')}
                tooltip={msg('process.baytsAlerts.panel.date.form.monitoringEnd.tooltip')}
                tooltipPlacement='top'
                input={monitoringEnd}
                startDate={dateRange.start}
                endDate={dateRange.end}
            />
        )
    }

    dateRange() {
        const start = '2014-06-15'
        const end = moment().format(DATE_FORMAT)
        return {start, end}
    }

    renderDuration(period) {
        const {inputs} = this.props
        const duration = inputs[`${period}Duration`]
        const durationUnit = inputs[`${period}DurationUnit`]

        return (
            <Widget
                label={msg(`process.baytsAlerts.panel.date.form.${period}.duration.label`)}
                layout='horizontal-nowrap'
                spacing='normal'
                alignment='left'>
                <Form.Input
                    type='number'
                    input={duration}
                    className={styles.unit}
                />
                <Form.Combo
                    input={durationUnit}
                    placeholder={msg('process.baytsAlerts.panel.date.form.durationUnit.placeholder')}
                    options={[
                        {value: 'days', label: msg('process.baytsAlerts.panel.date.form.durationUnit.DAYS')},
                        {value: 'weeks', label: msg('process.baytsAlerts.panel.date.form.durationUnit.WEEKS')},
                        {value: 'months', label: msg('process.baytsAlerts.panel.date.form.durationUnit.MONTHS')}
                    ]}
                    className={styles.durationUnit}
                />
            </Widget>
        )
    }

    componentDidMount() {
        this.defaultMonitoringEnd()
    }

    componentDidUpdate() {
        this.defaultMonitoringEnd()
    }

    defaultMonitoringEnd() {
        const {inputs: {monitoringEnd}} = this.props
        if (!monitoringEnd.value) {
            monitoringEnd.set(this.dateRange().end)
        }
    }
}

export const Date = compose(
    _Date,
    recipeFormPanel({id: 'date', fields})
)

Date.propTypes = {}
