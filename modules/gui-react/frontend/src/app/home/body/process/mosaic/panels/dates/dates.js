import {ErrorMessage, Field, Input, Label, form} from 'widget/form'
import {Msg, msg} from 'translate'
import {Panel, PanelContent, PanelHeader} from 'widget/panel'
import {RecipeActions, RecipeState} from '../../mosaicRecipe'
import {recipePath} from 'app/home/body/process/mosaic/mosaicRecipe'
import DatePicker from 'widget/datePicker'
import PanelButtons from 'widget/panelButtons'
import PropTypes from 'prop-types'
import React from 'react'
import SeasonSelect from 'widget/seasonSelect'
import moment from 'moment'
import styles from './dates.module.css'

const DATE_FORMAT = 'YYYY-MM-DD'

const minStartDate = (targetDate) => parseDate(targetDate).subtract(1, 'year').add(1, 'days')
const maxStartDate = (targetDate) => parseDate(targetDate)

const minEndDate = (targetDate) => parseDate(targetDate).add(1, 'days')
const maxEndDate = (targetDate) => parseDate(targetDate).add(1, 'years')

const fields = {
    advanced: new Field(),

    targetYear: new Field()
        .skip((_, {advanced}) => advanced)
        .int('process.mosaic.panel.dates.form.targetDate.malformed'),

    targetDate: new Field()
        .skip((_, {advanced}) => !advanced)
        .date(DATE_FORMAT, 'process.mosaic.panel.dates.form.targetDate.malformed'),

    seasonStart: new Field()
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

    seasonEnd: new Field()
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

    yearsBefore: new Field()
        .skip((_, {advanced}) => !advanced)
        .int('process.mosaic.panel.dates.form.years.positiveInteger')
        .min(0, 'process.mosaic.panel.dates.form.years.positiveInteger'),

    yearsAfter: new Field()
        .skip((_, {advanced}) => !advanced)
        .int('process.mosaic.panel.dates.form.years.positiveInteger')
        .min(0, 'process.mosaic.panel.dates.form.years.positiveInteger')
}

const mapStateToProps = (state, ownProps) => {
    const recipeId = ownProps.recipeId
    const recipeState = RecipeState(recipeId)
    let values = recipeState('ui.dates')
    if (!values) {
        const model = recipeState('model.dates')
        values = modelToValues(model)
        RecipeActions(recipeId).setDates({values, model}).dispatch()
    }
    return {values}
}

class Dates extends React.Component {
    constructor(props) {
        super(props)
        const {recipeId, inputs: {targetYear, targetDate}} = props
        targetYear.onChange((yearString) => this.handleYearChange(yearString))
        targetDate.onChange((dateString) => this.handleDateChange(dateString))
        this.recipeActions = RecipeActions(recipeId)
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
        const {recipeId, form, inputs: {advanced}} = this.props
        return (
            <Panel className={advanced.value ? styles.advanced : styles.simple}>
                <PanelHeader
                    icon='cog'
                    title={msg('process.mosaic.panel.dates.title')}/>

                <PanelContent>
                    {advanced.value ? this.renderAdvanced() : this.renderSimple()}
                </PanelContent>

                <PanelButtons
                    statePath={recipePath(recipeId, 'ui')}
                    form={form}
                    onApply={values => this.recipeActions.setDates({values, model: valuesToModel(values)}).dispatch()}
                    additionalButtons={[{
                        key: 'advanced',
                        label: advanced.value ? msg('button.less') : msg('button.more'),
                        onClick: () => this.setAdvanced(!advanced.value)
                    }]}/>
            </Panel>
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
                    <ErrorMessage for={targetDate}/>
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
                    <ErrorMessage for={[yearsBefore, yearsAfter]}/>
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
                    <ErrorMessage for={targetYear}/>
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
    recipeId: PropTypes.string
}

export default form({fields, mapStateToProps})(Dates)


const valuesToModel = (values) => {
    const DATE_FORMAT = 'YYYY-MM-DD'
    if (values.advanced)
        return {
            targetDate: values.targetDate,
            seasonStart: values.seasonStart,
            seasonEnd: values.seasonEnd,
            yearsBefore: Number(values.yearsBefore),
            yearsAfter: Number(values.yearsAfter)
        }
    else
        return {
            targetDate: moment().year(values.targetYear).month(6).date(2).format(DATE_FORMAT),
            seasonStart: moment().year(values.targetYear).startOf('year').format(DATE_FORMAT),
            seasonEnd: moment().year(Number(values.targetYear) + 1).startOf('year').format(DATE_FORMAT),
            yearsBefore: 0,
            yearsAfter: 0
        }
}

const modelToValues = (model = {}) => {
    return {
        advanced:
            moment(model.seasonStart).dayOfYear() !== 1
            || moment(model.seasonEnd).dayOfYear() !== 1
            || model.yearsBefore !== 0
            || model.yearsAfter !== 0,
        targetYear: String(moment(model.targetDate).year()),
        targetDate: model.targetDate,
        seasonStart: model.seasonStart,
        seasonEnd: model.seasonEnd,
        yearsBefore: String(model.yearsBefore),
        yearsAfter: String(model.yearsAfter),
    }
}
