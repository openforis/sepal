import moment from 'moment'
import PropTypes from 'prop-types'
import React from 'react'
import {Msg} from 'translate'
import {form} from 'widget/form'
import {RecipeActions, RecipeState} from '../../mosaicRecipe'
import styles from './dates.module.css'
import {Slider} from './slider'
import DatePicker from 'widget/datePicker'
import Icon from 'widget/icon'

const inputs = {}

const mapStateToProps = (state, ownProps) => {
    const recipe = RecipeState(ownProps.id)
    return {
        values: recipe('dates')
    }
}

class Dates extends React.Component {
    constructor(props) {
        super(props)
        this.recipe = RecipeActions(props.id)
        this.rect = React.createRef()
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

    setDateMin(dateMin) {
        const dateMinOffset = moment(dateMin).diff(moment(this.state.date), 'days')
        this.setState({
            ...this.state,
            dateMinOffset
        })
    }

    setDateMax(dateMax) {
        const dateMaxOffset = moment(dateMax).diff(moment(this.state.date), 'days')
        this.setState({
            ...this.state,
            dateMaxOffset
        })
    }

    setDateMinOffset(offset) {
        this.setState({
            ...this.state,
            dateMinOffset: Math.round(offset)
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
        const {className} = this.props
        return (
            <div className={className}>
                <div className={styles.container}>
                    <div className={styles.title}>
                        <Msg id={'process.mosaic.panel.dates.title'}/>
                    </div>
                    <div className={styles.body}>
                        <div className={styles.dates}>
                            <DatePicker className={styles.date} fromYear={1980} toYear={2020} 
                                date={this.dateMin()} onChange={date => this.setDateMin(date)}/>
                            <DatePicker className={styles.date} fromYear={1980} toYear={2020} 
                                date={this.state.date} onChange={date => this.setDate(date)}/>
                            <DatePicker className={styles.date} fromYear={1980} toYear={2020} 
                                date={this.dateMax()} onChange={date => this.setDateMax(date)}/>
                        </div>
                        <div className={styles.range}>
                            <Slider minValue={-180} maxValue={0} startValue={this.state.dateMinOffset} onChange={days => this.setDateMinOffset(days)}/>
                            <div>
                                {/* <Icon name="minus-circle"/> */}
                                - days +
                                {/* <Icon name="plus-circle"/> */}
                            </div>
                            <Slider minValue={0} maxValue={180} startValue={this.state.dateMaxOffset} onChange={days => this.setDateMaxOffset(days)}/>
                        </div>
                        <div className={styles.range}>
                            <Slider minValue={-10} maxValue={0} startValue={this.state.yearMinOffset} onChange={years => this.setYearMinOffset(years)}/>
                            <div>- seasons +</div>
                            <Slider minValue={0} maxValue={10} startValue={this.state.yearMaxOffset} onChange={years => this.setYearMaxOffset(years)}/>
                        </div>
                    </div>
                    {/* <div className={styles.footer}>
                        footer
                    </div> */}
                </div>
            </div>
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
