import {Form} from 'widget/form/form'
import {Layout} from 'widget/layout'
import {Panel} from 'widget/panel/panel'
import {RecipeFormPanel, recipeFormPanel} from 'app/home/body/process/recipeFormPanel'
import {compose} from 'compose'
import {maxDate, minDate, momentDate} from 'widget/form/datePicker'
import {msg} from 'translate'
import {selectFrom} from 'stateUtils'
import React from 'react'
import moment from 'moment'
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
    startDate: selectFrom(recipe, 'model.source.startDate'),
    endDate: selectFrom(recipe, 'model.source.endDate')
})

class Date extends React.Component {
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
        const {inputs: {dateType}} = this.props
        const {startDate, endDate} = this.props
        return (
            <Layout type='vertical'>
                {this.renderDateType()}
                {dateType.value === 'RANGE'
                    ? this.renderDateRange()
                    : this.renderDate()}

                {startDate && endDate
                    ? <p className={styles.dateRange}>
                        {msg('process.ccdcSlice.panel.date.form.date.range', {startDate, endDate})}
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
                    errorMessage
                />
                <Form.DatePicker
                    label={msg('process.ccdcSlice.panel.date.form.endDate.label')}
                    tooltip={msg('process.ccdcSlice.panel.date.form.endDate.tooltip')}
                    tooltipPlacement='top'
                    input={endDate}
                    startDate={toStart}
                    endDate={toEnd}
                    errorMessage
                />
            </Layout>
        )
    }

    renderDate() {
        const {startDate, inputs: {date}} = this.props
        return (
            <Form.DatePicker
                label={msg('process.ccdcSlice.panel.date.form.date.label')}
                tooltip={msg('process.ccdcSlice.panel.date.form.date.tooltip')}
                tooltipPlacement='top'
                input={date}
                startDate={startDate || '1982-08-22'}
                endDate={moment().add(1, 'year')}
                errorMessage
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
        const {startDate, endDate, inputs: {date}} = this.props
        if (!date.value && startDate && endDate) {
            const middle = moment((
                moment(startDate, DATE_FORMAT).valueOf()
                + moment(endDate, DATE_FORMAT).valueOf()
            ) / 2).format(DATE_FORMAT)
            date.set(middle)
        }
    }

    fromDateRange(toDate) {
        const {startDate, endDate} = this.props
        const dayBeforeToDate = momentDate(toDate).subtract(1, 'day')
        return [
            startDate || '1982-08-22',
            minDate(minDate(moment().add(1, 'year'), dayBeforeToDate), endDate)
        ]
    }

    toDateRange(fromDate) {
        const {startDate, endDate} = this.props
        const dayAfterFromDate = momentDate(fromDate).add(1, 'day')
        return [
            maxDate(maxDate('1982-08-22', dayAfterFromDate), startDate),
            endDate || moment().add(1, 'year')
        ]
    }

}

const modelToValues = model => ({
    dateType: 'SINGLE',
    ...model
})

Date.propTypes = {}

export default compose(
    Date,
    recipeFormPanel({id: 'date', fields, mapRecipeToProps, modelToValues})
)
