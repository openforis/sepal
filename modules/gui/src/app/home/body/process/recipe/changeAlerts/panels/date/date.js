import {Form} from 'widget/form'
import {Layout} from 'widget/layout'
import {Panel} from 'widget/panel/panel'
import {RecipeFormPanel, recipeFormPanel} from 'app/home/body/process/recipeFormPanel'
import {Widget} from 'widget/widget'
import {compose} from 'compose'
import {maxDate, minDate} from 'widget/form/datePicker'
import {msg} from 'translate'
import {selectFrom} from 'stateUtils'
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
        .notBlank(),
    calibrationDuration: new Form.Field()
        .notBlank()
        .int(),
    calibrationDurationUnit: new Form.Field()
        .notBlank()
}

const mapRecipeToProps = recipe => ({
    segmentsStartDate: selectFrom(recipe, 'model.reference.startDate'),
    segmentsEndDate: selectFrom(recipe, 'model.reference.endDate')
})

class _Date extends React.Component {
    render() {
        return (
            <RecipeFormPanel
                className={styles.panel}
                placement='bottom-right'>
                <Panel.Header
                    icon='cog'
                    title={msg('process.changeAlerts.panel.date.title')}/>
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
                {this.renderDuration('calibration')}
                {this.renderReferenceDates()}
            </Layout>
        )
    }

    renderMonitoringEnd() {
        const {inputs: {monitoringEnd}} = this.props
        var dateRange = this.dateRange()
        return (
            <Form.DatePicker
                label={msg('process.changeAlerts.panel.date.form.monitoringEnd.label')}
                tooltip={msg('process.changeAlerts.panel.date.form.monitoringEnd.tooltip')}
                tooltipPlacement='top'
                input={monitoringEnd}
                startDate={dateRange.start}
                endDate={dateRange.end}
            />
        )
    }

    dateRange() {
        const {segmentsStartDate, segmentsEndDate} = this.props
        const start = minDate(
            maxDate(
                moment(segmentsStartDate).add(1, 'year'),
                moment('1982-08-22', DATE_FORMAT)),
            moment()
        ).format(DATE_FORMAT)
        const end = minDate(
            moment(segmentsEndDate).add(1, 'year'),
            moment()
        ).format(DATE_FORMAT)
        return {start, end}
    }

    renderDuration(period) {
        const {inputs} = this.props
        const duration = inputs[`${period}Duration`]
        const durationUnit = inputs[`${period}DurationUnit`]

        return (
            <Widget
                label={msg(`process.changeAlerts.panel.date.form.${period}.duration.label`)}
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
                    placeholder={msg('process.changeAlerts.panel.date.form.durationUnit.placeholder')}
                    options={[
                        {value: 'days', label: msg('process.changeAlerts.panel.date.form.durationUnit.DAYS')},
                        {value: 'weeks', label: msg('process.changeAlerts.panel.date.form.durationUnit.WEEKS')},
                        {value: 'months', label: msg('process.changeAlerts.panel.date.form.durationUnit.MONTHS')}
                    ]}
                    className={styles.durationUnit}
                />
            </Widget>
        )
    }

    renderReferenceDates() {
        const {segmentsStartDate, segmentsEndDate} = this.props
        return segmentsStartDate && segmentsEndDate
            ? (
                <p className={styles.dateRange}>
                    {msg('process.changeAlerts.panel.date.form.range', {segmentsStartDate, segmentsEndDate})}
                </p>
            )
            : (
                <p className={styles.dateRange}>
                    {msg('process.changeAlerts.panel.date.form.noRange', {segmentsStartDate, segmentsEndDate})}
                </p>
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
    recipeFormPanel({id: 'date', fields, mapRecipeToProps})
)

Date.propTypes = {}
