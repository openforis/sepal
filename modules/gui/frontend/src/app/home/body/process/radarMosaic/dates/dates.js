import {ErrorMessage, Field} from 'widget/form'
import {FormPanelButtons} from 'widget/formPanel'
import {PanelContent, PanelHeader} from 'widget/panel'
import {RecipeActions} from 'app/home/body/process/mosaic/mosaicRecipe'
import {RecipeFormPanel, recipeFormPanel} from 'app/home/body/process/recipeFormPanel'
import {msg} from 'translate'
import Buttons from 'widget/buttons'
import DatePicker, {maxDate, minDate, momentDate} from 'widget/datePicker'
import React from 'react'
import YearPicker from 'widget/yearPicker'
import moment from 'moment'
import styles from './dates.module.css'

const DATE_FORMAT = 'YYYY-MM-DD'

const fields = {
    type: new Field(),
    year: new Field()
        .skip((_, {type}) => type !== 'YEARLY_TIME_SCAN')
        .int('process.radarMosaic.panel.dates.form.year.malformed'),
    fromDate: new Field(),
    toDate: new Field(),
    targetDate: new Field()
}

class Dates extends React.Component {
    renderYearlyTimeScan() {
        const {inputs: {year}} = this.props
        return (
            <div className={styles.yearPicker}>
                <YearPicker
                    label={msg('process.radarMosaic.panel.dates.form.year.label')}
                    placement='above'
                    input={year}
                    startYear='2014'
                    endYear={moment().year()}/>
                <ErrorMessage for={year}/>
            </div>
        )
    }

    renderCustomTimeScan() {
        const {inputs: {fromDate, toDate}} = this.props
        const [fromStart, fromEnd] = fromDateRange(toDate.value)
        const [toStart, toEnd] = toDateRange(fromDate.value)
        return (
            <div className={styles.fromToPickers}>
                <div>
                    <DatePicker
                        label={msg('process.radarMosaic.panel.dates.form.fromDate.label')}
                        input={fromDate}
                        startDate={fromStart}
                        endDate={fromEnd}/>
                    <ErrorMessage for={fromDate}/>
                </div>
                <div>
                    <DatePicker
                        label={msg('process.radarMosaic.panel.dates.form.toDate.label')}
                        input={toDate}
                        startDate={toStart}
                        endDate={toEnd}/>
                    <ErrorMessage for={toDate}/>
                </div>
            </div>
        )
    }

    renderPointInTimeMosaic() {
        const {inputs: {targetDate}} = this.props
        return (
            <div className={styles.yearPicker}>
                <DatePicker
                    label={msg('process.radarMosaic.panel.dates.form.targetDate.label')}
                    input={targetDate}
                    startDate={'2014-06-15'}
                    endDate={moment()}
                    autoFocus={true}/>
                <ErrorMessage for={targetDate}/>
            </div>
        )
    }

    renderTypeSelector() {
        const {inputs: {type}} = this.props
        const options = ['YEARLY_TIME_SCAN', 'CUSTOM_TIME_SCAN', 'POINT_IN_TIME_MOSAIC']
            .map(value => ({
                value,
                label: msg([`process.radarMosaic.panel.dates.form.type.${value}.label`]),
                tooltip: msg([`process.radarMosaic.panel.dates.form.type.${value}.tooltip`])
            }))
        return (
            <Buttons
                label={msg(['process.radarMosaic.panel.dates.form.type.label'])}
                className={styles.types}
                input={type}
                options={options}/>
        )
    }

    renderDatePickers() {
        const {inputs: {type}} = this.props
        switch (type.value) {
        case 'POINT_IN_TIME_MOSAIC':
            return this.renderPointInTimeMosaic()
        case 'CUSTOM_TIME_SCAN':
            return this.renderCustomTimeScan()
        default:
            return this.renderYearlyTimeScan()
        }
    }

    render() {
        const {recipeId} = this.props
        return (
            <RecipeFormPanel
                className={styles.panel}
                placement='bottom-right'
                onClose={() => RecipeActions(recipeId).showPreview().dispatch()}>
                <PanelHeader
                    icon='calendar-alt'
                    title={msg('process.radarMosaic.panel.dates.title')}/>

                <PanelContent>
                    {this.renderTypeSelector()}
                    {this.renderDatePickers()}
                </PanelContent>

                <FormPanelButtons/>
            </RecipeFormPanel>
        )
    }

    componentDidMount() {
        const {recipeId} = this.props
        RecipeActions(recipeId).hidePreview().dispatch()
    }
}

Dates.propTypes = {}

const valuesToModel = values => {
    const pointInTimeMosaic = values.type === 'POINT_IN_TIME_MOSAIC'
    const yearlyTimeScan = values.type === 'YEARLY_TIME_SCAN'
    if (pointInTimeMosaic)
        return {targetDate: values.targetDate}
    else
        return {
            fromDate: yearlyTimeScan ? values.year + '-01-01' : values.fromDate,
            toDate: yearlyTimeScan ? (Number(values.year) + 1) + '-01-01' : values.toDate
        }
}

const modelToValues = (model = {}) => {
    const getType = () => {
        if (model.targetDate)
            return 'POINT_IN_TIME_MOSAIC'
        if (moment(model.toDate, DATE_FORMAT).year() === moment(model.fromDate, DATE_FORMAT).year() + 1
            && model.fromDate.endsWith('-01-01')
            && model.toDate.endsWith('-01-01'))
            return 'YEARLY_TIME_SCAN'
        else
            return 'CUSTOM_TIME_SCAN'
    }
    const type = getType()
    if (type === 'POINT_IN_TIME_MOSAIC') {
        const targetDate = moment(model.targetDate, DATE_FORMAT)
        return {
            type,
            targetDate: model.targetDate,
            year: targetDate.year(),
            fromDate: targetDate.startOf('year').format(DATE_FORMAT),
            toDate: targetDate.add(1, 'years').startOf('year').format(DATE_FORMAT),
        }
    } else {
        const fromDate = moment(model.fromDate, DATE_FORMAT)
        return {
            type,
            targetDate: fromDate.set('month', 6).set('date', 2).format(DATE_FORMAT),
            year: fromDate.year(),
            fromDate: model.fromDate,
            toDate: model.toDate
        }
    }
}

const fromDateRange = toDate => {
    const dayBeforeToDate = momentDate(toDate).subtract(1, 'day')
    return [
        '2014-06-15',
        minDate(moment(), dayBeforeToDate)
    ]
}

const toDateRange = fromDate => {
    const dayAfterFromDate = momentDate(fromDate).add(1, 'day')
    return [
        maxDate('2014-06-15', dayAfterFromDate),
        moment()
    ]
}

export default recipeFormPanel({id: 'dates', fields, modelToValues, valuesToModel})(
    Dates
)
