import moment from 'moment'
import PropTypes from 'prop-types'
import React from 'react'
import {Msg, msg} from 'translate'
import DatePicker from 'widget/datePicker'
import {Constraints, ErrorMessage, form, Input, Label} from 'widget/form'
import SeasonSelect from 'widget/seasonSelect'
import {RecipeActions, RecipeState} from '../../mosaicRecipe'
import PanelForm from '../panelForm'
import styles from './dates.module.css'

const DATE_FORMAT = 'YYYY-MM-DD'

const minStartDate = (targetDate) => parseDate(targetDate).subtract(1, 'year').add(1, 'days')
const maxStartDate = (targetDate) => parseDate(targetDate)

const minEndDate = (targetDate) => parseDate(targetDate).add(1, 'days')
const maxEndDate = (targetDate) => parseDate(targetDate).add(1, 'years')

const inputs = {
    advanced: new Constraints(),

    targetYear: new Constraints()
        .skip((_, {advanced}) => advanced)
        .int('process.mosaic.panel.dates.form.targetDate.malformed'),

    targetDate: new Constraints()
        .skip((_, {advanced}) => !advanced)
        .date(DATE_FORMAT, 'process.mosaic.panel.dates.form.targetDate.malformed'),

    seasonStart: new Constraints()
        .skip((_, {advanced}) => !advanced)
        .date(DATE_FORMAT, 'process.mosaic.panel.dates.form.season.malformed')
        .predicate((date, {targetDate}) => parseDate(date).isSameOrAfter(minStartDate(targetDate)),
            'process.mosaic.panel.dates.form.season.tooEarly',
            ({targetDate}) => ({
                min: minStartDate(targetDate).format(DATE_FORMAT)
            }))
        .predicate((date, {targetDate}) => parseDate(date).isSameOrBefore(maxStartDate(targetDate)),
            'process.mosaic.panel.dates.form.season.tooLate',
            ({targetDate}) => ({
                max: maxStartDate(targetDate).format(DATE_FORMAT)
            })),

    seasonEnd: new Constraints()
        .skip((_, {advanced}) => !advanced)
        .date(DATE_FORMAT, 'process.mosaic.panel.dates.form.season.malformed')
        .predicate((date, {targetDate}) => parseDate(date).isSameOrAfter(minEndDate(targetDate)),
            'process.mosaic.panel.dates.form.season.tooEarly',
            ({targetDate}) => ({
                min: minEndDate(targetDate).format(DATE_FORMAT)
            }))
        .predicate((date, {targetDate}) => parseDate(date).isSameOrBefore(maxEndDate(targetDate)),
            'process.mosaic.panel.dates.form.season.tooLate',
            ({targetDate}) => ({
                max: maxEndDate(targetDate).format(DATE_FORMAT)
            })),

    yearsBefore: new Constraints()
        .skip((_, {advanced}) => !advanced)
        .int('process.mosaic.panel.dates.form.years.positiveInteger')
        .min(0, 'process.mosaic.panel.dates.form.years.positiveInteger'),

    yearsAfter: new Constraints()
        .skip((_, {advanced}) => !advanced)
        .int('process.mosaic.panel.dates.form.years.positiveInteger')
        .min(0, 'process.mosaic.panel.dates.form.years.positiveInteger')
}

const mapStateToProps = (state, ownProps) => {
    const recipe = RecipeState(ownProps.id)
    return {
        values: recipe('ui.dates') || {
            advanced: recipe('ui.dates.advanced'),
            targetYear: String(moment().year()),
            targetDate: moment().format(DATE_FORMAT),
            seasonStart: moment().startOf('year').format(DATE_FORMAT),
            seasonEnd: moment().add(1, 'years').startOf('year').format(DATE_FORMAT),
            yearsBefore: 0,
            yearsAfter: 0
        }
    }
}

class Dates extends React.Component {
    constructor(props) {
        super(props)
        const {id, inputs: {targetYear, targetDate}} = props
        targetYear.onChange((yearString) => this.handleYearChange(yearString))
        targetDate.onChange((dateString) => this.handleDateChange(dateString))
        this.recipe = RecipeActions(id)
    }

    handleYearChange(yearString) {
        const {inputs: {targetDate}} = this.props
        const yearDate = parseYear(yearString)
        if (yearDate.isValid()) {
            const targetDateMoment = parseDate(targetDate.value)
            targetDateMoment.set('year', yearDate.year())
            targetDate.set(targetDateMoment.format(DATE_FORMAT))
        }
    }

    handleDateChange(dateString) {
        const {inputs: {targetYear}} = this.props
        const date = parseDate(dateString)
        if (date.isValid())
            targetYear.set(String(date.year()))
    }

    setAdvanced(enabled) {
        const {inputs: {advanced}} = this.props
        advanced.set(enabled)
    }

    render() {
        const {id, form, inputs: {advanced}, className} = this.props
        return (
            <form className={[className, advanced.value ? styles.advanced : styles.simple].join(' ')}>
                <PanelForm
                    additionalButtons={[{
                        key: 'advanced',
                        label: advanced.value ? msg('button.less') : msg('button.more'),
                        onClick: () => this.setAdvanced(!advanced.value)
                    }]}
                    recipeId={id}
                    form={form}
                    onApply={(recipe, dates) => recipe.setDates(dates).dispatch()}
                    icon='cog'
                    title={msg('process.mosaic.panel.dates.title')}>
                    {advanced.value ? this.renderAdvanced() : this.renderSimple()}
                </PanelForm>
            </form>
        )
    }

    renderAdvanced() {
        const {inputs: {targetDate, seasonStart, seasonEnd, yearsBefore, yearsAfter}} = this.props
        return (
            <div className={styles.advancedLayout}>
                <Label
                    className={styles.targetDateLabel}
                    tooltip='process.mosaic.panel.dates.form.targetDate'
                    right>
                    <Msg id='process.mosaic.panel.dates.form.targetDate.label'/>
                </Label>
                <div className={styles.targetDateInput}>
                    <DatePicker
                        input={targetDate}
                        startDate={'1982-08-22'}
                        endDate={moment().format(DATE_FORMAT)}/>
                    <ErrorMessage input={targetDate}/>
                </div>

                <Label className={styles.yearsLabel} tooltip='process.mosaic.panel.dates.form.years' right>
                    <Msg id='process.mosaic.panel.dates.form.years.label'/>
                </Label>
                <div className={styles.yearsInput}>
                    <div>
                        <Input type='number' input={yearsBefore} maxLength={2} min={0} max={99}/>
                        &nbsp;
                        <Msg id='process.mosaic.panel.dates.form.years.before'/>
                    </div>
                    <div>
                        <Input type='number' input={yearsAfter} maxLength={2} min={0} max={99}/>
                        &nbsp;
                        <Msg id='process.mosaic.panel.dates.form.years.after'/>
                    </div>
                    <ErrorMessage input={[yearsBefore, yearsAfter]}/>
                </div>

                <Label className={styles.seasonLabel} tooltip='process.mosaic.panel.dates.form.season' right>
                    <Msg id='process.mosaic.panel.dates.form.season.label'/>
                </Label>
                <SeasonSelect
                    startDate={seasonStart}
                    endDate={seasonEnd}
                    centerDate={targetDate}
                    disabled={targetDate.isInvalid()}
                    className={styles.seasonInput}/>
            </div>
        )
    }

    renderSimple() {
        const {inputs: {targetYear}} = this.props
        return (
            <div className={styles.simpleLayout}>
                <Label
                    className={styles.yearLabel}
                    tooltip='process.mosaic.panel.dates.form.targetYear'
                    right>
                    <Msg id='process.mosaic.panel.dates.form.targetYear.label'/>
                </Label>
                <div className={styles.targetDateInput}>
                    <DatePicker
                        input={targetYear}
                        startDate={moment('1982-08-22', DATE_FORMAT)}
                        endDate={moment()}
                        resolution='year'/>
                    <ErrorMessage input={targetYear}/>
                </div>

            </div>
        )
    }
}

const parseDate = (dateString) =>
    moment(dateString, 'YYYY-MM-DD', true)

const parseYear = (dateString) =>
    moment(dateString, 'YYYY', true)

Dates.propTypes = {
    id: PropTypes.string,
    className: PropTypes.string,
    form: PropTypes.object,
    inputs: PropTypes.shape({}),
    action: PropTypes.func,
    values: PropTypes.object
}

export default form(inputs, mapStateToProps)(Dates)
