import {Input} from 'widget/form'
import FloatingBox from 'widget/floatingBox'
import Icon from 'widget/icon'
import Label from 'widget/label'
import List from 'widget/list'
import PropTypes from 'prop-types'
import React from 'react'
import moment from 'moment'
import styles from './datePicker.module.css'

const range = (from, to) =>
    Array.from({length: (to - from + 1)}, (v, k) => k + from)

const YEAR = 'year'
const MONTH = 'month'
const DAY = 'day'

const items = [YEAR, MONTH, DAY]

const daysInMonth = (year, month) =>
    moment().year(year).month(month).daysInMonth()

const toMomentUnit = item => {
    switch (item) {
    case DAY:
        return 'date'
    default:
        return item
    }
}

class DatePicker extends React.Component {
    state = {edit: false}
    inputElement = React.createRef()

    editDate(edit) {
        this.setState({edit})
        if (!edit) {
            const {onChange, input} = this.props
            onChange && onChange(input.value)
        }
    }

    renderLabel() {
        const {label, tooltip, tooltipPlacement = 'top'} = this.props
        return label ? (
            <Label
                msg={label}
                tooltip={tooltip}
                tooltipPlacement={tooltipPlacement}
            />
        ) : null
    }

    renderDatePicker() {
        const {input, startDate, endDate, resolution = DAY, className, onChange, portal} = this.props
        const {edit} = this.state
        return (
            <div className={className}>
                <div className={[styles.container, styles[resolution]].join(' ')}>
                    <div className={styles.input}
                        ref={this.inputElement}>
                        <Input
                            input={input}
                            maxLength={10}
                            autoComplete='off'
                            onClick={() => this.editDate(true)}
                            onFocus={() => this.editDate(true)}
                            // onBlur={() => !edit && this.editDate(false)}
                            onChange={onChange}
                        />
                        <Icon name='calendar'
                            onMouseDown={e => e.preventDefault()}
                            onClick={() => {
                                if (!edit)
                                    this.inputElement.current.focus()
                                this.editDate(!edit)
                            }}/>
                    </div>
                    {edit ? (
                        <FloatingBox
                            element={this.inputElement.current}
                            placement='below'
                            className={styles.picker}>
                            <DatePickerControl
                                startDate={startDate}
                                endDate={endDate}
                                input={input}
                                resolution={resolution}
                                onSelect={() => this.editDate(false)}
                                portal={portal}
                            />
                        </FloatingBox>
                    ) : null}
                </div>
            </div>
        )
    }

    render() {
        return (
            <React.Fragment>
                {this.renderLabel()}
                {this.renderDatePicker()}
            </React.Fragment>
        )
    }
}

DatePicker.propTypes = {
    className: PropTypes.string,
    date: PropTypes.object,
    endDate: PropTypes.any,
    input: PropTypes.object,
    portal: PropTypes.object,
    resolution: PropTypes.string,
    startDate: PropTypes.any,
    onChange: PropTypes.func
}

export class DatePickerControl extends React.Component {
    constructor(props) {
        super(props)
        const {input, resolution} = props
        const date = this.parseDate(input.value)
        this.items = items.slice(0, items.indexOf(resolution) + 1)

        this.state = {
            highlighted: false
        }
        this.selected = {}

        if ([YEAR, MONTH, DAY].includes(resolution))
            this.state.year = this.initializeItem(YEAR, date)

        if ([MONTH, DAY].includes(resolution))
            this.state.month = this.initializeItem(MONTH, date)

        if ([DAY].includes(resolution))
            this.state.day = this.initializeItem(DAY, date)
    }

    initializeItem(item, date) {
        this.selected[item] = React.createRef()
        return this.getDateItem(date, item)
    }

    unsubscribeOnUnmount(subscription) {
        this.subscriptions.push(subscription)
    }

    set(item, value) {
        this.setState(prevState => {
            const state = {...prevState}
            const {resolution} = this.props
            state[item] = value
            if (resolution === DAY && item !== DAY) {
                // adjust day of month if not allowed in current month
                state.day = Math.min(prevState.day, daysInMonth(state.year, state.month))
            }
            return state
        })
    }

    highlight(value) {
        this.setState(prevState => {
            const state = {...prevState}
            state.highlighted = value
            return state
        })
    }

    parseDate(date) {
        return moment(date, getDateFormat(this.props.resolution), true)
    }

    formatDate(date) {
        return date.format(getDateFormat(this.props.resolution))
    }

    getDateItem(date, item) {
        return date.get(item === DAY ? 'date' : item)
    }

    selectOption(item, value) {
        const {input, resolution, onSelect} = this.props
        const completeDate = !this.items
            .filter(i => i !== item)
            .find(i => {
                return !(this.state[i] >= 0)
            })
        if (completeDate) { // If year, month, day specified in state
            const date = moment().set(toMomentUnit(item), value)
            this.items
                .filter(i => i !== item)
                .forEach(i => date.set(toMomentUnit(i), this.state[i]))
            input.set(this.formatDate(date))
        }
        this.set(item, value)
        if (resolution === item) {
            onSelect()
        }
    }

    getOptions(item, range) {
        return range.map(value => ({
            label: this.getOptionLabel(value, item),
            value
        }))
    }

    getOptionLabel(value, type) {
        return type === MONTH
            ? moment().month(value).format('MMM')
            : value
    }

    renderList(item, range) {
        const options = this.getOptions(item, range)
        const selectedOption = options.find(option => option.value === this.state[item])
        return (
            <List
                key={item}
                options={options}
                selectedOption={selectedOption}
                onSelect={option => this.selectOption(item, option.value)}
                overScroll
            />
        )
    }

    renderYearRange(startDate, endDate) {
        return this.renderList(YEAR, range(startDate.year(), endDate.year()))
    }

    renderMonthRange(startDate, endDate) {
        const {year} = this.state
        const minMonth = year === startDate.year() ? startDate.month() : 0
        const maxMonth = year === endDate.year() ? endDate.month() : 11
        return this.renderList(MONTH, range(minMonth, maxMonth))
    }

    renderDayRange(startDate, endDate) {
        const {year, month} = this.state
        const days = month ? daysInMonth(year, month) : 31
        const minDay = year === startDate.year() && month === startDate.month() ? startDate.date() : 1
        const maxDay = year === endDate.year() && month === endDate.month() ? endDate.date() : days
        return this.renderList(DAY, range(minDay, maxDay))
    }

    renderPicker(item) {
        const startDate = this.parseDate(this.props.startDate)
        const endDate = this.parseDate(this.props.endDate)
        switch (item) {
        case YEAR:
            return this.renderYearRange(startDate, endDate)
        case MONTH:
            return this.renderMonthRange(startDate, endDate)
        case DAY:
            return this.renderDayRange(startDate, endDate)
        default:
        }
    }

    render() {
        return (
            this.items.map(item => this.renderPicker(item))
        )
    }

    componentDidUpdate(prevProps, prevState) {
        const nextState = {...this.state}
        const changed = this.items.find(item => {
            const prevValue = prevState[item]
            const date = this.parseDate(this.props.input.value)
            if (!date.isValid())
                return false
            const value = date.get(toMomentUnit(item))
            nextState[item] = value
            if (prevValue !== value) {
                this.set(item, value)
                return true
            }
            return false
        })
        if (changed)
            this.center = true
    }
}

const getDateFormat = resolution => {
    switch (resolution) {
    case YEAR:
        return 'YYYY'
    case MONTH:
        return 'YYYY-MM'
    case DAY:
        return 'YYYY-MM-DD'
    default:
        throw new Error('Invalid resolution: ' + resolution)
    }
}

DatePickerControl.propTypes = {
    onSelect: PropTypes.func.isRequired,
    date: PropTypes.object,
    endDate: PropTypes.any,
    input: PropTypes.object,
    portal: PropTypes.object,
    resolution: PropTypes.string,
    startDate: PropTypes.any
}

export default DatePicker
