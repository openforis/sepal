import * as PropTypes from 'prop-types'
import {Activator} from 'widget/activation/activator'
import {Button} from 'widget/button'
import {Panel, PanelButtons, PanelContent, PanelHeader} from './panel'
import {Scrollable, ScrollableContainer} from './scrollable'
import {activatable} from 'widget/activation/activatable'
import {isMobile} from 'widget/userAgent'
import Label from './label'
import React, {Component} from 'react'
import _ from 'lodash'
import guid from 'guid'
import moment from 'moment'
import styles from './datePicker.module.css'

const DATE_FORMAT = 'YYYY-MM-DD'

export const momentDate = date => _.isString(date) ? moment(date, DATE_FORMAT) : moment(date)

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

export default class DatePicker extends React.Component {
    id = 'DatePicker-' + guid()
    inputElement = React.createRef()

    render() {
        const {input, startDate, endDate, label, autoFocus} = this.props
        const date = moment(input.value, DATE_FORMAT)
        return (
            <Activator id={this.id}>
                {panel =>
                    <div className={styles.container}>
                        <DatePickerPanel
                            id={this.id}
                            title={label}
                            date={date.isValid() ? date : moment(startDate, DATE_FORMAT)}
                            startDate={momentDate(startDate)}
                            endDate={momentDate(endDate)}
                            onSelect={date => {
                                const dateString = date.format(DATE_FORMAT)
                                this.inputElement.current.value = dateString
                                input.set(dateString)
                            }}/>
                        {this.renderLabel()}
                        <div className={styles.input}>
                            <input
                                ref={this.inputElement}
                                defaultValue={input.value}
                                maxLength={10}
                                autoFocus={autoFocus && !isMobile()}
                                autoComplete='off'
                                autoCorrect='off'
                                autoCapitalize='off'
                                spellCheck='false'
                                className={styles.input}
                                onChange={e => this.setInput(e.target.value)}
                                onBlur={() => {
                                    this.inputElement.current.value = input.value
                                }}
                            />
                            <Button additionalClassName={styles.panelTrigger}
                                chromeless
                                icon='calendar-alt'
                                size='small'
                                onClick={() => panel.activate()}
                            />
                        </div>
                    </div>
                }
            </Activator>
        )
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

    setInput(value) {
        const {input, startDate, endDate} = this.props
        const date = momentDate(value)
        const formattedDate = date.isValid()
            ? constrainDate(date, startDate, endDate).format(DATE_FORMAT)
            : momentDate(startDate).format(DATE_FORMAT)
        input.set(formattedDate)
    }
}

DatePicker.propTypes = {
    endDate: PropTypes.any.isRequired,
    input: PropTypes.object.isRequired,
    startDate: PropTypes.any.isRequired,
    autoFocus: PropTypes.any,
    label: PropTypes.string
}

class _DatePickerPanel extends React.Component {
    state = {}

    render() {
        const {title} = this.props
        const {date} = this.state
        if (!date)
            return null
        return (
            <Panel
                className={styles.panel}
                type='modal'>
                <PanelHeader
                    icon='calendar-alt'
                    title={title}/>
                <PanelContent className={styles.panelContent}>
                    {this.renderYears()}
                    {this.renderMonths()}
                    {this.renderDays()}
                </PanelContent>
                <PanelButtons onEnter={() => this.select()} onEscape={() => this.close()}>
                    <PanelButtons.Main>
                        {this.renderButtons()}
                    </PanelButtons.Main>
                </PanelButtons>
            </Panel>
        )
    }

    renderYears() {
        const {startDate, endDate} = this.props
        const {date} = this.state
        const startYear = startDate.year()
        const endYear = endDate.year()
        const selectedYear = date.year()
        return (
            <ScrollableContainer className={styles.years}>
                <Scrollable>
                    {_.range(startYear, endYear + 1).map(year =>
                        <CalendarButton
                            key={year}
                            label={year}
                            selected={year === selectedYear}
                            className={styles.year}
                            onClick={() => this.updateDate('year', year)}/>
                    )}
                </Scrollable>
            </ScrollableContainer>
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
                    <CalendarButton
                        key={month}
                        label={month}
                        selected={month === selectedMonth}
                        className={styles.month}
                        disabled={i < firstMonthIndex || i > lastMonthIndex}
                        onClick={() => this.updateDate('month', month)}/>
                )}
            </div>
        )
    }

    renderDays() {
        const {date} = this.state
        const {startDate, endDate} = this.props
        const firstOfMonth = moment(date).startOf('month')
        const firstToRender = moment(firstOfMonth).startOf('week')
        const lastOfMonth = moment(date).endOf('month')
        const firstDay = date.isSame(startDate, 'month') ? startDate.date() : 1
        const lastDate = date.isSame(endDate, 'month') ? endDate : lastOfMonth
        const lastDay = lastDate.date()
        const lastToRender = moment(lastOfMonth).endOf('week')
        const daysToRender = lastToRender.diff(firstToRender, 'days') + 1
        const indexOffset = firstOfMonth.day() - 1
        const firstIndex = firstDay + indexOffset
        const lastIndex = lastDay + indexOffset

        return (
            <div className={styles.days}>
                {moment.weekdaysShort().map(weekday =>
                    <Label key={weekday} msg={weekday}/>
                )}
                {_.times(daysToRender, i => {
                    const buttonDate = moment(firstToRender).add(i, 'day')
                    const dayOfMonth = buttonDate.format('DD')
                    return (
                        <CalendarButton
                            key={i}
                            label={dayOfMonth}
                            selected={buttonDate.isSame(date, 'day')}
                            className={styles.date}
                            disabled={i < firstIndex || i > lastIndex}
                            onClick={() => this.updateDate('date', dayOfMonth)}/>
                    )
                }
                )}
            </div>
        )
    }

    renderButtons() {
        return this.isDirty()
            ? <React.Fragment>
                <PanelButtons.Cancel onClick={() => this.close()}/>
                <PanelButtons.Select onClick={() => this.select()}/>
            </React.Fragment>
            : <PanelButtons.Close onClick={() => this.close()}/>
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

class CalendarButton extends Component {
    element = React.createRef()

    render() {
        let {label, selected, disabled, className, onClick} = this.props
        return (
            <Button
                chromeless={!selected}
                look={selected ? 'highlight' : 'default'}
                disabled={disabled}
                additionalClassName={className}
                onClick={onClick}>
                <span ref={this.element}>{label}</span>
            </Button>
        )
    }

    componentDidMount() {
        this.element.current.parentNode.parentNode.scrollTop = this.element.current.parentNode.offsetTop
    }
}

CalendarButton.propTypes = {
    className: PropTypes.any,
    label: PropTypes.any,
    selected: PropTypes.any,
    onClick: PropTypes.any
}

const policy = () => ({_: 'allow'})
const id = ({id}) => id
const DatePickerPanel = activatable({id, policy, alwaysAllow: true})(
    _DatePickerPanel
)
