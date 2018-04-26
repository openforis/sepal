import PropTypes from 'prop-types'
import React from 'react'
import {Msg, msg} from 'translate'
import {Constraints, ErrorMessage, form, Input} from 'widget/form'
import {RecipeActions, RecipeState} from '../../mosaicRecipe'
import ConfirmationButtons from '../confirmationButtons'
import styles from './dates.module.css'
import {Slider, RangeSlider} from './slider'
import moment from 'moment'

const inputs = {
    // country: new Constraints()
    //     .notBlank('process.mosaic.panel.areaOfInterest.form.country.required'),
}

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
            day: 1,
            dayMin: 0,
            dayMax: 0
        }
    }
    setDay(day) {        
        this.setState({
            ...this.state,
            day
        })
    }
    setDayMin(dayMin) {
        this.setState({
            ...this.state,
            dayMin
        })
    }
    setDayMax(dayMax) {
        this.setState({
            ...this.state,
            dayMax
        })
    }
    day() {
        return (
            <div>{moment().dayOfYear(this.state.day).format('DD MMM')}</div>
        )
    }
    dayMin() {
        return (
            <span>{moment().dayOfYear(this.state.day).add(this.state.dayMin, 'days').format('DD MMM')}</span>
        )
    }
    dayMax() {
        return (
            <span>{moment().dayOfYear(this.state.day).add(this.state.dayMax, 'days').format('DD MMM')}</span>
        )
    }
    render() {
        const date = new Date().toDateString()
        const {className, form, inputs: {country}} = this.props
        return (
            <div className={className}>
                <div className={styles.container}>
                    <div className={styles.title}>
                        <Msg id={'process.mosaic.panel.dates.title'}/>
                    </div>
                    <div className={styles.body}>
                        <div>
                            {this.day()}                
                            <Slider min={1} max={365} onChange={this.setDay.bind(this)}/>
                        </div>
                        <div>
                            <div>{this.dayMin()} - {this.dayMax()}</div>
                            <div className={styles.dayRange}>
                                <Slider min={-180} max={0} start={-30} onChange={this.setDayMin.bind(this)}/>
                                <Slider min={0} max={180} start={30} onChange={this.setDayMax.bind(this)}/>
                            </div>
                        </div>
                    </div>
                    <div className={styles.footer}>
                        footer
                    </div>
                </div>
            </div>
        )
    }
}

Dates.propTypes = {
    id: PropTypes.string,
    className: PropTypes.string,
    form: PropTypes.object,
    inputs: PropTypes.shape({
    }),
    action: PropTypes.func,
    values: PropTypes.object
}

export default form(inputs, mapStateToProps)(Dates)
