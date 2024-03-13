import {Form} from '~/widget/form'
import {Layout} from '~/widget/layout'
import {Panel} from '~/widget/panel/panel'
import {RecipeFormPanel, recipeFormPanel} from '~/app/home/body/process/recipeFormPanel'
import {compose} from '~/compose'
import {maxDate, minDate, momentDate} from '~/widget/form/datePicker'
import {msg} from '~/translate'
import React from 'react'
import moment from 'moment'
import styles from './dates.module.css'

const DATE_FORMAT = 'YYYY-MM-DD'

const fromDateRange = toDate => {
    const dayBeforeToDate = momentDate(toDate).subtract(1, 'day')
    return [
        '1970-01-01',
        minDate(moment(), dayBeforeToDate)
    ]
}

const toDateRange = fromDate => {
    const dayAfterFromDate = momentDate(fromDate).add(1, 'day')
    return [
        maxDate('1970-01-01', dayAfterFromDate),
        moment()
    ]
}

const valuesToModel = values => {
    const yearlyDateRange = values.type === 'YEAR'
    return {
        type: values.type,
        fromDate: yearlyDateRange ? `${values.year}-01-01` : values.fromDate,
        toDate: yearlyDateRange ? `${Number(values.year) + 1}-01-01` : values.toDate
    }
}

const modelToValues = (model = {}) => {
    const fromDate = moment(model.fromDate, DATE_FORMAT)
    return {
        type: model.type,
        year: fromDate.year() || new Date().getFullYear(),
        fromDate: model.fromDate,
        toDate: model.toDate
    }
}

const fields = {
    type: new Form.Field(),
    year: new Form.Field()
        .skip((_, {type}) => type === 'CUSTOM_DATE_RANGE')
        .int('process.asset.panel.dates.form.year.malformed'),
    fromDate: new Form.Field(),
    toDate: new Form.Field()
}

class _Dates extends React.Component {
    render() {
        return (
            <RecipeFormPanel
                className={styles.panel}
                placement='bottom-right'>
                <Panel.Header
                    icon='calendar-alt'
                    title={msg('process.asset.panel.dates.title')}/>
                <Panel.Content>
                    <Layout>
                        {this.renderTypeSelector()}
                        {this.renderDatePickers()}
                    </Layout>
                </Panel.Content>
                <Form.PanelButtons/>
            </RecipeFormPanel>
        )
    }

    renderTypeSelector() {
        const {inputs: {type}} = this.props
        const options = ['ALL_DATES', 'YEAR', 'CUSTOM_DATE_RANGE']
            .map(value => ({
                value,
                label: msg([`process.asset.panel.dates.form.type.${value}.label`]),
                tooltip: msg([`process.asset.panel.dates.form.type.${value}.tooltip`])
            }))
        return (
            <Form.Buttons
                label={msg(['process.asset.panel.dates.form.type.label'])}
                className={styles.types}
                input={type}
                options={options}/>
        )
    }
    
    renderDatePickers() {
        const {inputs: {type}} = this.props
        switch(type.value) {
        case 'YEAR': return this.renderYear()
        case 'CUSTOM_DATE_RANGE': return this.renderCustomDateRange()
        default: return this.renderAllDates()
        }
    }

    renderAllDates() {
        return (
            <p className={styles.description}>Include imagery for all dates</p>
        )
    }

    renderYear() {
        const {inputs: {year}} = this.props
        return (
            <Form.YearPicker
                label={msg('process.asset.panel.dates.form.year.label')}
                placement='above'
                input={year}
                startYear='2014'
                endYear={moment().year()}/>
        )
    }

    renderCustomDateRange() {
        const {inputs: {fromDate, toDate}} = this.props
        const [fromStart, fromEnd] = fromDateRange(toDate.value)
        const [toStart, toEnd] = toDateRange(fromDate.value)
        return (
            <Layout type='horizontal'>
                <Form.DatePicker
                    label={msg('process.asset.panel.dates.form.fromDate.label')}
                    input={fromDate}
                    startDate={fromStart}
                    endDate={fromEnd}
                />
                <Form.DatePicker
                    label={msg('process.asset.panel.dates.form.toDate.label')}
                    input={toDate}
                    startDate={toStart}
                    endDate={toEnd}
                />
            </Layout>
        )
    }
}

export const Dates = compose(
    _Dates,
    recipeFormPanel({id: 'dates', fields, modelToValues, valuesToModel})
)

Dates.propTypes = {}
