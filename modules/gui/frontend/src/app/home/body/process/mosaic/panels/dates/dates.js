import {Button} from 'widget/button'
import {ErrorMessage, Field} from 'widget/form'
import {FormPanelButtons} from 'widget/formPanel'
import {PanelContent, PanelHeader} from 'widget/panel'
import {RecipeActions} from 'app/home/body/process/mosaic/mosaicRecipe'
import {RecipeFormPanel, recipeFormPanel} from 'app/home/body/process/recipeFormPanel'
import {msg} from 'translate'
import {selectFrom} from 'collections'
import DatePicker from 'widget/datePicker'
import Label from 'widget/label'
import PropTypes from 'prop-types'
import React from 'react'
import SeasonSelect from 'widget/seasonSelect'
import Slider from 'widget/slider'
import moment from 'moment'
import styles from './dates.module.css'

const DATE_FORMAT = 'YYYY-MM-DD'

const minStartDate = targetDate => parseDate(targetDate).subtract(1, 'year').add(1, 'days')
const maxStartDate = targetDate => parseDate(targetDate)

const minEndDate = targetDate => parseDate(targetDate).add(1, 'days')
const maxEndDate = targetDate => parseDate(targetDate).add(1, 'years')

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

    yearsBefore: new Field(),
    yearsAfter: new Field()
}

class Dates extends React.Component {
    modal = React.createRef()

    constructor(props) {
        super(props)
        const {inputs: {targetYear, targetDate}} = props
        targetYear.onChange(yearString => this.handleYearChange(yearString))
        targetDate.onChange(dateString => this.handleDateChange(dateString))
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
            targetYear.set(date.year())
    }

    setAdvanced(enabled) {
        const {inputs: {advanced}} = this.props
        advanced.set(enabled)
    }

    renderSimple() {
        const {inputs: {targetYear}} = this.props
        return (
            <div className={styles.simpleLayout}>
                <DatePicker
                    label={msg('process.mosaic.panel.dates.form.targetYear.label')}
                    tooltip={msg('process.mosaic.panel.dates.form.targetYear.tooltip')}
                    tooltipPlacement='top'
                    input={targetYear}
                    startDate={moment('1982-08-22', DATE_FORMAT)}
                    endDate={moment()}
                    resolution='year'/>
                <ErrorMessage for={targetYear}/>
            </div>
        )
    }

    renderAdvanced() {
        const {inputs: {targetDate, seasonStart, seasonEnd, yearsBefore, yearsAfter}} = this.props
        return (
            <div className={styles.advancedLayout}>
                <div className={styles.targetDate}>
                    <DatePicker
                        label={msg('process.mosaic.panel.dates.form.targetDate.label')}
                        tooltip={msg('process.mosaic.panel.dates.form.targetDate.tooltip')}
                        input={targetDate}
                        startDate={'1982-08-22'}
                        endDate={moment().format(DATE_FORMAT)}
                        errorMessage
                        modalContainer={this.modal.current}
                    />
                </div>
                <div className={styles.pastSeasons}>
                    <Slider
                        label={msg('process.mosaic.panel.dates.form.pastSeasons.label')}
                        info={pastSeasons => pastSeasons
                            ? msg('process.mosaic.panel.dates.form.pastSeasons.info.number', {pastSeasons})
                            : msg('process.mosaic.panel.dates.form.pastSeasons.info.none')
                        }
                        alignment='left'
                        input={yearsBefore}
                        ticks={[0, 1, 2, 3, 5, 10, {value: 25, label: 'all'}]}
                        snap
                        scale='log'
                        invert
                        range='low'
                    />
                </div>
                <div className={styles.futureSeasons}>
                    <Slider
                        label={msg('process.mosaic.panel.dates.form.futureSeasons.label')}
                        info={futureSeasons => futureSeasons
                            ? msg('process.mosaic.panel.dates.form.futureSeasons.info.number', {futureSeasons})
                            : msg('process.mosaic.panel.dates.form.futureSeasons.info.none')
                        }
                        alignment='right'
                        input={yearsAfter}
                        ticks={[0, 1, 2, 3, 5, 10, {value: 25, label: 'all'}]}
                        snap
                        scale='log'
                        range='low'
                    />
                </div>
                <div className={styles.season}>
                    <Label
                        className={styles.seasonLabel}
                        msg={msg('process.mosaic.panel.dates.form.season.label')}
                        tooltip={msg('process.mosaic.panel.dates.form.season.tooltip')}
                    />
                    <SeasonSelect
                        startDate={seasonStart}
                        endDate={seasonEnd}
                        centerDate={targetDate}
                        disabled={targetDate.isInvalid()}/>
                </div>
            </div>
        )
    }

    render() {
        const {recipeId, inputs: {advanced}} = this.props
        return (
            <RecipeFormPanel
                className={advanced.value ? styles.advanced : styles.simple}
                placement='bottom-right'
                onClose={() => RecipeActions(recipeId).showPreview().dispatch()}>
                <PanelHeader
                    icon='calendar-alt'
                    title={msg('process.mosaic.panel.dates.title')}/>

                <PanelContent>
                    <div ref={this.modal}>
                        {advanced.value ? this.renderAdvanced() : this.renderSimple()}
                    </div>
                </PanelContent>

                <FormPanelButtons>
                    <Button
                        label={advanced.value ? msg('button.less') : msg('button.more')}
                        onClick={() => this.setAdvanced(!advanced.value)}/>
                </FormPanelButtons>
            </RecipeFormPanel>
        )
    }

    componentDidMount() {
        const {recipeId} = this.props
        RecipeActions(recipeId).hidePreview().dispatch()
    }
}

const parseDate = dateString =>
    moment(dateString, 'YYYY-MM-DD', true)

const parseYear = dateString =>
    moment(dateString, 'YYYY', true)

Dates.propTypes = {
    recipeId: PropTypes.string
}

const valuesToModel = values => {
    const DATE_FORMAT = 'YYYY-MM-DD'
    if (values.advanced)
        return {
            targetDate: values.targetDate,
            seasonStart: values.seasonStart,
            seasonEnd: values.seasonEnd,
            yearsBefore: values.yearsBefore,
            yearsAfter: values.yearsAfter
        }
    else
        return {
            targetDate: moment().year(values.targetYear).month(6).date(2).format(DATE_FORMAT),
            seasonStart: moment().year(values.targetYear).startOf('year').format(DATE_FORMAT),
            seasonEnd: moment().year(values.targetYear + 1).startOf('year').format(DATE_FORMAT),
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
        targetYear: moment(model.targetDate).year(),
        targetDate: model.targetDate,
        seasonStart: model.seasonStart,
        seasonEnd: model.seasonEnd,
        yearsBefore: model.yearsBefore,
        yearsAfter: model.yearsAfter,
    }
}

const policy = ({values, wizardContext: {wizard}}) => {
    return wizard || selectFrom(values, 'dirty')
        ? {
            _: 'disallow',
            sceneSelection: 'allow'
        }
        : {
            _: 'allow-then-deactivate',
            sceneSelection: 'allow'
        }
}

export default recipeFormPanel({id: 'dates', fields, modelToValues, valuesToModel, policy})(Dates)
