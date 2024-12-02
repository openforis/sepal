import moment from 'moment'
import React from 'react'

import {RecipeFormPanel, recipeFormPanel} from '~/app/home/body/process/recipeFormPanel'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {Form} from '~/widget/form'
import {maxDate, minDate, momentDate} from '~/widget/form/datePicker'
import {Layout} from '~/widget/layout'
import {Panel} from '~/widget/panel/panel'

import styles from './date.module.css'

const DATE_FORMAT = 'YYYY-MM-DD'

const fields = {
    dateType: new Form.Field()
        .notBlank(),
    date: new Form.Field()
        .skip((date, {dateType}) => dateType !== 'SINGLE')
        .notBlank()
        .date(DATE_FORMAT),
    startDate: new Form.Field()
        .skip((date, {dateType}) => dateType !== 'RANGE')
        .notBlank()
        .date(DATE_FORMAT),
    endDate: new Form.Field()
        .skip((date, {dateType}) => dateType !== 'RANGE')
        .notBlank()
        .date(DATE_FORMAT)
}

const mapRecipeToProps = recipe => ({
    segmentsStartDate: selectFrom(recipe, 'model.source.startDate'),
    segmentsEndDate: selectFrom(recipe, 'model.source.endDate')
})

class _Date extends React.Component {
    render() {
        return (
            <RecipeFormPanel
                className={styles.panel}
                placement='bottom-right'>
                <Panel.Header
                    icon='cog'
                    title={msg('process.ccdcSlice.panel.date.title')}/>
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
        const {segmentsStartDate, segmentsEndDate, inputs: {dateType}} = this.props
        return (
            <Layout type='vertical'>
                {this.renderDateType()}
                {dateType.value === 'RANGE'
                    ? this.renderDateRange()
                    : this.renderDate()}

                {segmentsStartDate && segmentsEndDate
                    ? <p className={styles.dateRange}>
                        {msg('process.ccdcSlice.panel.date.form.date.range', {segmentsStartDate, segmentsEndDate})}
                    </p>
                    : null}
            </Layout>
        )
    }

    renderDateType() {
        const {inputs: {dateType}} = this.props
        const options = [
            {value: 'SINGLE', label: msg('process.ccdcSlice.panel.date.form.dateType.SINGLE')},
            {value: 'RANGE', label: msg('process.ccdcSlice.panel.date.form.dateType.RANGE')},
        ]
        return (
            <Form.Buttons
                label={msg('process.ccdcSlice.panel.date.form.dateType.label')}
                input={dateType}
                options={options}
            />
        )
    }

    renderDateRange() {
        const {inputs: {startDate, endDate}} = this.props
        const [fromStart, fromEnd] = this.fromDateRange(endDate.value)
        const [toStart, toEnd] = this.toDateRange(startDate.value)
        return (
            <Layout type='horizontal'>
                <Form.DatePicker
                    label={msg('process.ccdcSlice.panel.date.form.startDate.label')}
                    tooltip={msg('process.ccdcSlice.panel.date.form.endDate.tooltip')}
                    tooltipPlacement='top'
                    input={startDate}
                    startDate={fromStart}
                    endDate={fromEnd}
                />
                <Form.DatePicker
                    label={msg('process.ccdcSlice.panel.date.form.endDate.label')}
                    tooltip={msg('process.ccdcSlice.panel.date.form.endDate.tooltip')}
                    tooltipPlacement='top'
                    input={endDate}
                    startDate={toStart}
                    endDate={toEnd}
                />
            </Layout>
        )
    }

    renderDate() {
        const {segmentsStartDate, inputs: {date}} = this.props
        return (
            <Form.DatePicker
                label={msg('process.ccdcSlice.panel.date.form.date.label')}
                tooltip={msg('process.ccdcSlice.panel.date.form.date.tooltip')}
                tooltipPlacement='top'
                input={date}
                startDate={segmentsStartDate || '1982-08-22'}
                endDate={moment().add(1, 'year')}
            />
        )
    }

    componentDidMount() {
        this.defaultDate()
    }

    componentDidUpdate() {
        this.defaultDate()
    }

    defaultDate() {
        const {segmentsStartDate, segmentsEndDate, inputs: {date, startDate, endDate}} = this.props
        if (!date.value && segmentsStartDate && segmentsEndDate) {
            const middle = moment((
                moment(segmentsStartDate, DATE_FORMAT).valueOf()
                + moment(segmentsEndDate, DATE_FORMAT).valueOf()
            ) / 2).format(DATE_FORMAT)
            date.set(middle)
        }
        if (!startDate.value && segmentsStartDate) {
            startDate.set(moment(segmentsStartDate, DATE_FORMAT).format(DATE_FORMAT))
        }
        if (!endDate.value && segmentsEndDate) {
            endDate.set(moment(segmentsEndDate, DATE_FORMAT).format(DATE_FORMAT))
        }
    }

    fromDateRange(toDate) {
        const {segmentsStartDate, segmentsEndDate} = this.props
        const dayBeforeToDate = momentDate(toDate).subtract(1, 'day')
        return [
            segmentsStartDate || '1982-08-22',
            minDate(minDate(moment().add(1, 'year'), dayBeforeToDate), segmentsEndDate || moment().add(1, 'year'))
        ]
    }

    toDateRange(fromDate) {
        const {segmentsStartDate, segmentsEndDate} = this.props
        const dayAfterFromDate = momentDate(fromDate).add(1, 'day')
        return [
            maxDate(maxDate('1982-08-22', dayAfterFromDate), segmentsStartDate || '1982-08-22'),
            segmentsEndDate || moment().add(1, 'year')
        ]
    }

}

const modelToValues = model => ({
    dateType: 'SINGLE',
    ...model
})

export const Date = compose(
    _Date,
    recipeFormPanel({id: 'date', fields, mapRecipeToProps, modelToValues})
)

Date.propTypes = {}
