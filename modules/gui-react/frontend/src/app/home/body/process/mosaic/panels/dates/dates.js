import moment from 'moment'
import PropTypes from 'prop-types'
import React from 'react'
import {Msg, msg} from 'translate'
import DatePicker from 'widget/datePicker'
import {Constraints, ErrorMessage, form} from 'widget/form'
import SeasonSelect from 'widget/seasonSelect'
import {RecipeState} from '../../mosaicRecipe'
import PanelForm from '../panelForm'
import styles from './dates.module.css'

const DATE_FORMAT = 'YYYY-MM-DD'

const inputs = {
    targetDate: new Constraints()
        .date(DATE_FORMAT, 'process.mosaic.panel.dates.form.targetDate.malformed'),
    seasonStart: new Constraints(),
    seasonEnd: new Constraints()
}


const mapStateToProps = (state, ownProps) => {
    const recipe = RecipeState(ownProps.id)
    return {
        values: recipe('dates') || {
            targetDate: moment().format(DATE_FORMAT),
            seasonStart: moment().month(0).date(1).format(DATE_FORMAT),
            seasonEnd: moment().add(1, 'years').month(0).date(1).format(DATE_FORMAT)
        }
    }
}

class Dates extends React.Component {
    constructor(props) {
        super(props)
        this.state = {
            date: new Date(),
            dateMinOffset: -30,
            dateMaxOffset: 30,
            yearMinOffset: 0,
            yearMaxOffset: 0
        }
    }

    dateMin() {
        return moment(this.state.date)
            .add(this.state.yearMinOffset, 'years')
            .add(this.state.dateMinOffset, 'days')
            .toDate()
    }

    dateMax() {
        return moment(this.state.date)
            .add(this.state.yearMaxOffset, 'years')
            .add(this.state.dateMaxOffset, 'days')
            .toDate()
    }

    setDate(date) {
        this.setState({
            ...this.state,
            date
        })
    }

    setDateMax(dateMax) {
        const dateMaxOffset = moment(dateMax).diff(moment(this.state.date), 'days')
        this.setState({
            ...this.state,
            dateMaxOffset
        })
    }

    setDateMaxOffset(offset) {
        this.setState({
            ...this.state,
            dateMaxOffset: Math.round(offset)
        })
    }

    setYearMinOffset(offset) {
        this.setState({
            ...this.state,
            yearMinOffset: Math.round(offset)
        })
    }

    setYearMaxOffset(offset) {
        this.setState({
            ...this.state,
            yearMaxOffset: Math.round(offset)
        })
    }

    render() {
        const {id, form, inputs: {targetDate, seasonStart, seasonEnd, years}, className} = this.props
        return (
            <form className={className}>
                <PanelForm
                    recipeId={id}
                    form={form}
                    onApply={(recipe, dates) => recipe.setDates(dates).dispatch()}
                    icon='cog'
                    title={msg('process.mosaic.panel.dates.title')}
                    className={styles.form}>
                    <div className={styles.fields}>
                        <label className={styles.targetDateLabel}>
                            <Msg id='process.mosaic.panel.dates.form.targetDate.label'/>
                        </label>
                        <div className={styles.targetDateInput}>
                            <DatePicker
                                input={targetDate}
                                fromYear={1980}
                                toYear={moment().year()}/>
                            <ErrorMessage input={targetDate}/>
                        </div>

                        <label className={styles.yearsLabel}>
                            <Msg id='process.mosaic.panel.dates.form.years.label'/>
                        </label>
                        <div className={styles.yearsInput}>
                            Some year selection widget will go here.
                        </div>

                        <label className={styles.seasonLabel}>
                            <Msg id='process.mosaic.panel.dates.form.season.label'/>
                        </label>
                        {/* TODO: Switch to two date pickers for narrow screens */}
                        <SeasonSelect
                            startDate={moment(seasonStart.value, DATE_FORMAT)}
                            endDate={moment(seasonEnd.value, DATE_FORMAT)}
                            centerDate={moment(targetDate.value, DATE_FORMAT)}
                            className={styles.seasonInput}
                            onChange={(start, end) => {
                                seasonStart.set(start)
                                seasonEnd.set(end)
                            }}/>
                    </div>
                </PanelForm>
            </form>
        )
    }
}

Dates.propTypes = {
    id: PropTypes.string,
    className: PropTypes.string,
    form: PropTypes.object,
    inputs: PropTypes.shape({}),
    action: PropTypes.func,
    values: PropTypes.object
}

export default form(inputs, mapStateToProps)(Dates)
