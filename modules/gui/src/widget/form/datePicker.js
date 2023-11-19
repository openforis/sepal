import {Button} from 'widget/button'
import {Input} from 'widget/input'
import {Panel} from 'widget/panel/panel'
import {ScrollableList} from 'widget/list'
import {Widget} from 'widget/widget'
import {compose} from 'compose'
import {withActivatable} from 'widget/activation/activatable'
import {withActivators} from 'widget/activation/activator'
import Label from 'widget/label'
import PropTypes from 'prop-types'
import React, {Component} from 'react'
import _ from 'lodash'
import moment from 'moment'
import styles from './datePicker.module.css'

const DATE_FORMAT = 'YYYY-MM-DD'

export const momentDate = date =>
    _.isString(date)
        ? moment(date, DATE_FORMAT, true)
        : moment(date)

const pickDate = (date1, date2, func) => {
    date1 = momentDate(date1)
    date2 = momentDate(date2)
    if (!date1.isValid())
        return date2
    else if (!date2.isValid())
        return date1
    else
        return func(date1, date2)
}

export const maxDate = (date1, date2) => pickDate(date1, date2, moment.max)
export const minDate = (date1, date2) => pickDate(date1, date2, moment.min)
export const constrainDate = (date, min, max) => maxDate(minDate(date, max), min)

class _FormDatePicker extends React.Component {
    inputElement = React.createRef()
    state = {value: ''}

    constructor() {
        super()
        this.onSelect = this.onSelect.bind(this)
        this.onChange = this.onChange.bind(this)
        this.onBlur = this.onBlur.bind(this)
    }

    render() {
        return (
            <React.Fragment>
                {this.renderDatePicker()}
                {this.renderWidget()}
            </React.Fragment>
        )
    }

    renderDatePicker() {
        const {startDate, endDate, label, activator: {activatables: {datePicker: {id}}}} = this.props
        const {value} = this.state
        const date = moment(value, DATE_FORMAT)
        return (
            <DatePickerPanel
                id={id}
                title={label}
                date={date.isValid() ? date : moment(startDate, DATE_FORMAT)}
                startDate={momentDate(startDate)}
                endDate={momentDate(endDate)}
                onSelect={this.onSelect}
            />
        )
    }

    renderWidget() {
        const {label, tooltip, tooltipPlacement} = this.props
        return (
            <Widget
                label={label}
                tooltip={tooltip}
                tooltipPlacement={tooltipPlacement}>
                {this.renderInput()}
            </Widget>
        )
    }

    renderInput() {
        const {input, autoFocus} = this.props
        const {value} = this.state
        return (
            <Input
                ref={this.inputElement}
                value={value || input.value}
                type='text'
                maxLength={10}
                autoFocus={autoFocus}
                className={styles.input}
                onChange={this.onChange}
                onBlur={this.onBlur}
                buttons={[
                    this.renderButton()
                ]}
            />
        )
    }

    renderButton() {
        const {activator: {activatables: {datePicker: {activate, active, canActivate}}}} = this.props
        return (
            <Button
                key='button'
                chromeless
                shape='none'
                icon='calendar-alt'
                size='small'
                disabled={active || !canActivate}
                onClick={activate}
            />
        )
    }

    onSelect(date) {
        const {input} = this.props
        const value = date.format(DATE_FORMAT)
        this.setState({value})
        input.set(value)

    }

    onChange(e) {
        this.updateValue(e.target.value)
    }

    onBlur() {
        const {startDate, endDate} = this.props
        const {value} = this.state
        const date = momentDate(value)
        const formattedDate = date.isValid()
            ? constrainDate(date, startDate, endDate).format(DATE_FORMAT)
            : this.state.lastValidValue
        this.updateValue(formattedDate)
    }

    componentDidMount() {
        const value = this.props.input.value
        this.setState({value, lastValidValue: value})
    }

    updateValue(value) {
        const {input, startDate, endDate} = this.props
        const date = momentDate(value)
        const validDate = date.isValid() && constrainDate(date, startDate, endDate).isSame(date)
        if (validDate) {
            input.set(date.format(DATE_FORMAT))
            this.setState({value, lastValidValue: value})
        } else {
            input.set('')
            this.setState({value})
        }
    }
}

export const FormDatePicker = compose(
    _FormDatePicker,
    withActivators({
        datePicker: (_props, activatorId) => `datePicker-${activatorId}`
    })
)

FormDatePicker.propTypes = {
    endDate: PropTypes.any.isRequired,
    input: PropTypes.object.isRequired,
    startDate: PropTypes.any.isRequired,
    autoFocus: PropTypes.any,
    errorMessage: PropTypes.any,
    label: PropTypes.any,
    tooltip: PropTypes.any,
    tooltipPlacement: PropTypes.any
}

class _DatePickerPanel extends React.Component {
    state = {}

    constructor(props) {
        super(props)
        this.select = this.select.bind(this)
        this.close = this.close.bind(this)
    }

    render() {
        const {title} = this.props
        const {date} = this.state
        if (!date)
            return null
        return (
            <Panel
                className={styles.panel}
                type='modal'>
                <Panel.Header
                    icon='calendar-alt'
                    title={title}/>
                <Panel.Content noVerticalPadding>
                    <div className={styles.panelContent}>
                        {this.renderYears()}
                        {this.renderMonths()}
                        {this.renderDays()}
                    </div>
                </Panel.Content>
                <Panel.Buttons>
                    <Panel.Buttons.Main>
                        {this.renderButtons()}
                    </Panel.Buttons.Main>
                </Panel.Buttons>
            </Panel>
        )
    }

    renderYears() {
        const {startDate, endDate} = this.props
        const {date} = this.state
        const startYear = startDate.year()
        const endYear = endDate.year()
        const selectedYear = date.year()
        const options = _.concat(
            _.range(startYear - 5, startYear).map(year => ({label: year})),
            _.range(startYear, endYear + 1).map(year => ({label: year, value: year})),
            _.range(endYear + 1, endYear + 6).map(year => ({label: year}))
        )
        return (
            <div className={styles.years}>
                <ScrollableList
                    options={options}
                    selectedValue={selectedYear}
                    onSelect={option => this.updateDate('year', option.value)}
                    alignment='center'
                    autoCenter
                />
            </div>
        )
    }

    renderMonths() {
        const {date} = this.state
        const {startDate, endDate} = this.props
        const months = moment.monthsShort()
        const selectedMonth = months[date.month()]
        const firstMonthIndex = date.year() === startDate.year() ? startDate.month() : 0
        const lastMonthIndex = date.year() === endDate.year() ? endDate.month() : 11
        return (
            <div className={styles.months}>
                {months.map((month, i) =>
                    this.renderMonthButton({
                        month,
                        selected: month === selectedMonth,
                        disabled: i < firstMonthIndex || i > lastMonthIndex
                    })
                )}
            </div>
        )
    }

    renderMonthButton({month, selected, disabled}) {
        return (
            <CalendarButton
                key={month}
                label={month}
                selected={selected}
                disabled={disabled}
                onClick={() => this.updateDate('month', month)}/>
        )
    }

    renderDays() {
        return (
            <div className={styles.days}>
                {this.renderWeekDaysLabels()}
                {this.renderDaysOfMonth()}
            </div>
        )
    }

    renderWeekDaysLabels() {
        return moment.weekdaysShort(true).map(weekday =>
            <Label key={weekday} msg={weekday}/>
        )
    }

    renderDaysOfMonth() {
        const {date} = this.state
        const {startDate, endDate} = this.props
        const firstOfMonth = moment(date).startOf('month')
        const firstToRender = moment(firstOfMonth).startOf('week')
        const lastOfMonth = moment(date).endOf('month')
        const firstDay = date.isSame(startDate, 'month') ? startDate.date() : 1
        const lastDate = date.isSame(endDate, 'month') ? endDate : lastOfMonth
        const lastDay = lastDate.date()
        const lastToRender = moment(lastOfMonth).endOf('week')
        const indexOffset = firstOfMonth.weekday() - 1
        const daysToRender = lastToRender.diff(firstToRender, 'days') + 1
        const firstIndex = firstDay + indexOffset
        const lastIndex = lastDay + indexOffset
        return _.times(daysToRender,
            i => this.renderMonthDay({
                date,
                i,
                disabled: i < firstIndex || i > lastIndex,
                firstToRender
            })
        )
    }

    renderMonthDay({date, i, firstToRender, disabled}) {
        const buttonDate = moment(firstToRender).add(i, 'day')
        const dayOfMonth = buttonDate.format('DD')
        return (
            <CalendarButton
                key={i}
                label={dayOfMonth}
                selected={buttonDate.isSame(date, 'day')}
                disabled={disabled}
                onClick={() => this.updateDate('date', dayOfMonth)}/>
        )
    }

    renderButtons() {
        return this.isDirty()
            ? (
                <React.Fragment>
                    <Panel.Buttons.Cancel
                        keybinding='Escape'
                        onClick={this.close}
                    />
                    <Panel.Buttons.Select
                        keybinding='Enter'
                        onClick={this.select}
                    />
                </React.Fragment>
            )
            : (
                <Panel.Buttons.Close
                    keybinding={['Enter', 'Escape']}
                    onClick={this.close}
                />
            )
    }

    componentDidMount() {
        const {date} = this.props
        this.setState({
            date: this.toValidRange(date)
        })
    }

    updateDate(unit, value) {
        this.setState(prevState => ({
            date: this.toValidRange(prevState.date.set(unit, value))
        }))

    }

    toValidRange(date) {
        const {startDate, endDate} = this.props
        return constrainDate(date, startDate, endDate)
    }

    select() {
        const {onSelect} = this.props
        this.isDirty() && onSelect && onSelect(this.state.date)
        this.close()
    }

    close() {
        const {activatable} = this.props
        activatable.deactivate()
    }

    isDirty() {
        return !this.props.date.isSame(this.state.date, 'day')
    }
}

const DatePickerPanel = compose(
    _DatePickerPanel,
    withActivatable({
        id: ({id}) => id,
        policy: () => ({_: 'allow'}),
        alwaysAllow: true
    })
)

class CalendarButton extends Component {
    render() {
        const {label, selected, disabled, onClick} = this.props
        return (
            <Button
                chromeless={!selected}
                look={selected ? 'highlight' : 'transparent'}
                label={label}
                disabled={disabled}
                onClick={onClick}
            />
        )
    }
}

CalendarButton.propTypes = {
    className: PropTypes.any,
    label: PropTypes.any,
    selected: PropTypes.any,
    onClick: PropTypes.any
}
