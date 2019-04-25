import React, {Component} from 'react'
import styles from './datePicker2.module.css'
import {Button} from 'widget/button'
import {Panel, PanelButtons, PanelContent, PanelHeader} from './panel'
import {activatable} from 'widget/activation/activatable'
import {Activator} from 'widget/activation/activator'
import moment from 'moment'
import _ from 'lodash'
import {Scrollable, ScrollableContainer} from './scrollable'
import Label from './label'
import * as PropTypes from 'prop-types'
import {Input} from './form'
import guid from 'guid'

const DATE_FORMAT = 'YYYY-MM-DD'

export default class DatePicker extends React.Component {
    id = guid()

    render() {
        const {input, startDate, endDate, title} = this.props
        return (
            <Activator id={this.id}>
                {panel =>
                    <div className={styles.container}>
                        <DatePickerPanel
                            id={this.id}
                            title={title}
                            date={moment(input.value, DATE_FORMAT)}
                            startDate={moment(startDate)}
                            endDate={moment(endDate)}
                            onSelect={date => input.set(date.format(DATE_FORMAT))}/>
                        <Input
                            input={input}
                            maxLength={10}
                            className={styles.input}
                        />
                        <Button additionalClassName={styles.panelTrigger}
                                chromeless
                                icon='calendar-alt'
                                onClick={() => panel.activate()}
                        />
                    </div>
                }
            </Activator>
        )
    }
}

DatePicker.propTypes = {
    input: PropTypes.object.isRequired,
    startDate: PropTypes.string.isRequired,
    endDate: PropTypes.string.isRequired,
    title: PropTypes.string.isRequired
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
        const startYear = moment(startDate, DATE_FORMAT).year()
        const endYear = moment(endDate, DATE_FORMAT).year()
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
        const months = moment.monthsShort()
        const selectedMonth = months[date.month()]
        return (
            <div className={styles.months}>
                {months.map(month =>
                    <CalendarButton
                        key={month}
                        label={month}
                        selected={month === selectedMonth}
                        className={styles.month}
                        onClick={() => this.updateDate('month', month)}/>
                )}
            </div>
        )
    }

    renderDays() {
        const {date} = this.state
        const firstOfMonth = moment(date).startOf('month')
        const firstOfWeek = moment(firstOfMonth).startOf('week')
        const lastOfMonth = moment(date).endOf('month')
        return (
            <div className={styles.days}>
                {moment.weekdaysShort().map(weekday =>
                    <Label key={weekday} msg={weekday}/>
                )}
                {_.times(35, (i) => {
                        const buttonDate = moment(firstOfWeek).add(i, 'day')
                        const dayOfMonth = buttonDate.format('DD')
                        const inMonth = buttonDate.isSameOrAfter(firstOfMonth) && buttonDate.isSameOrBefore(lastOfMonth)
                        return (
                            <CalendarButton
                                key={i}
                                label={dayOfMonth}
                                selected={buttonDate.isSame(date, 'day')}
                                className={styles.date}
                                disabled={!inMonth}
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
                <PanelButtons.Save onClick={() => this.select()}/>
            </React.Fragment>
            : <PanelButtons.Close onClick={() => this.close()}/>
    }

    componentDidMount() {
        const {date, startDate, endDate} = this.props
        this.setState({
            date: (date && date.isValid())
                ? date
                : moment.max(moment.min(moment(), endDate), startDate)
        })
    }

    updateDate(unit, value) {
        this.setState(prevState => ({date: prevState.date.set(unit, value)}))
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
    label: PropTypes.any,
    selected: PropTypes.any,
    className: PropTypes.any,
    onClick: PropTypes.any
}

const policy = () => ({_: 'allow'})
const id = ({id}) => id
const DatePickerPanel = activatable({id, policy})(
    _DatePickerPanel
)