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

const DATE_FORMAT = 'YYYY-MM-DD'

export default class DatePicker extends React.Component {
    render() {
        const {id, startDate, endDate} = this.props
        return (
            <Activator id={id}>
                {panel =>
                    <div className={styles.container}>
                        <DatePickerPanel
                            id={id}
                            startDate={startDate}
                            endDate={endDate}/>
                        <input
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


class _DatePickerPanel extends React.Component {
    state = {date: moment()}

    render() {
        return (
            <Panel
                className={styles.panel}
                type='modal'>
                <PanelHeader
                    icon='calendar-alt'
                    title={'Foo'}/>
                <PanelContent className={styles.panelContent}>
                    {this.renderYears()}
                    {this.renderMonths()}
                    {this.renderDays()}
                </PanelContent>
                <PanelButtons onEnter={() => this.close()} onEscape={() => this.close()}>
                    <PanelButtons.Main>
                        <PanelButtons.Close onClick={() => this.close()}/>
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
                            onClick={() => this.selectYear(year)}/>
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
                        onClick={() => this.selectMonth(month)}/>
                )}
            </div>
        )
    }

    renderDays() {
        const {date} = this.state
        const firstOfMonth = moment(date).startOf('month')
        const firstOfWeek = moment(firstOfMonth).startOf('week')
        const lastOfMonth = moment(date).endOf('month')
        const selectedDate = date.format('DD')
        return (
            <div className={styles.days}>
                {moment.weekdaysShort().map(weekday =>
                    <Label key={weekday} msg={weekday}/>
                )}
                {_.times(35, (i) => {
                        const current = moment(firstOfWeek).add(i, 'day')
                        const inMonth = current.isSameOrAfter(firstOfMonth) && current.isSameOrBefore(lastOfMonth)
                        const label = current.format('DD')
                        return (
                            <CalendarButton
                                key={i}
                                label={label}
                                selected={label === selectedDate}
                                className={styles.date}
                                disabled={!inMonth}
                                onClick={() => this.selectDate(label)}/>
                        )
                    }
                )}
            </div>
        )
    }

    selectYear(year) {

    }

    selectMonth(month) {

    }

    selectDate(date) {

    }

    close() {
        const {activatable} = this.props
        activatable.deactivate()
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