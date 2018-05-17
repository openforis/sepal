import moment from 'moment'
import PropTypes from 'prop-types'
import React from 'react'
import {animationFrameScheduler, interval, Subject} from 'rxjs'
import {debounceTime, filter, first, map, scan, skip, switchMap, takeUntil} from 'rxjs/operators'
import {Input} from 'widget/form'
import Icon from 'widget/icon'
import styles from './datePicker.module.css'

const range = (from, to) =>
    Array.from({length: (to - from + 1)}, (v, k) => k + from)

const ANIMATION_SPEED = .2
const AUTOSCROLL_DELAY = 1000

const YEAR = 'year'
const MONTH = 'month'
const DAY = 'day'

const DATE_FORMAT = 'YYYY-MM-DD'

const items = [YEAR, MONTH, DAY]

const currentScrollOffset = (element) => {
    return element.parentNode.scrollTop
}
const targetScrollOffset = (element) => {
    return Math.round(element.offsetTop - element.parentNode.offsetTop - element.parentNode.clientHeight / 2)
}

const setScrollOffset = (element, value) =>
    element.parentNode.scrollTop = value

const lerp = (rate) =>
    (value, targetValue) => value + (targetValue - value) * rate

const daysInMonth = (year, month) =>
    moment().year(year).month(month).daysInMonth()

const toMomentUnit = (item) => {
    switch (item) {
        case DAY:
            return 'date'
        default:
            return item
    }
}

class DatePicker extends React.Component {
    state = {edit: false}

    editDate(edit) {
        this.setState((prevState) =>
            ({...prevState, edit}))
    }

    render() {
        const {input, fromYear, toYear, className} = this.props
        const {edit} = this.state
        return (
            <div className={className}>
                <div className={styles.input}>
                    <Input
                        input={input}
                        maxLength={10}
                        onFocus={() => this.editDate(true)}
                        onBlur={() => this.editDate(false)}
                    />
                    <Icon name='calendar'
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => this.editDate(!edit)}/>
                    {edit
                        ? <DatePickerControl
                            fromYear={fromYear}
                            toYear={toYear}
                            input={input}/>
                        : null}
                </div>
            </div>
        )
    }
}

DatePicker.propTypes = {
    date: PropTypes.object,
    fromYear: PropTypes.number,
    toYear: PropTypes.number
}

class DatePickerControl extends React.Component {
    constructor(props) {
        super(props)
        const date = moment(props.input.value, DATE_FORMAT)
        this.state = {
            year: date.year(),
            month: date.month(),
            day: date.date(),
            highlighted: false
        }
        this.selected = {
            year: React.createRef(),
            month: React.createRef(),
            day: React.createRef()
        }
        this.subscriptions = []

        this.select$ = new Subject()
        this.autoUnsubscribe(this.select(this.select$, YEAR))
        this.autoUnsubscribe(this.select(this.select$, MONTH))
        this.autoUnsubscribe(this.select(this.select$, DAY))

        this.scroll$ = new Subject()
        this.autoUnsubscribe(this.autoScroll(this.scroll$))
    }

    componentDidUpdate(prevProps, prevState) {
        if (this.center) {
            this.center = false
            this.centerSelected()
        }

        const nextState = {...this.state}
        const changed = items.find((item) => {
            const prevValue = prevState[item]
            const date = moment(this.props.input.value, DATE_FORMAT)
            if (!date.isValid())
                return false
            const value = date.get(toMomentUnit(item))
            nextState[item] = value
            if (prevValue !== value) {
                this.set(item, value)
                return true
            }
        })
        if (changed)
            this.center = true
    }

    autoUnsubscribe(subscription) {
        this.subscriptions.push(subscription)
    }

    select(select$, item) {
        const animationFrame$ = interval(0, animationFrameScheduler)
        return select$.pipe(
            filter(selected => selected.item === item),
            map(selected => selected.element),
            filter(element => element),
            switchMap((element) => {
                const target = targetScrollOffset(element)
                const scroll$ = animationFrame$.pipe(
                    map(() => target),
                    scan(lerp(ANIMATION_SPEED), currentScrollOffset(element))
                )
                const stop$ = scroll$.pipe(
                    filter(value => Math.abs(value - target) < .5),
                    skip(1), // delay stop event
                    first() // just one stop event
                )
                return scroll$.pipe(
                    map((value) => ({element, value})),
                    takeUntil(stop$)
                )
            })
        ).subscribe(({element, value}) => setScrollOffset(element, Math.round(value)))
    }

    autoScroll(scroll$) {
        return scroll$.pipe(
            debounceTime(AUTOSCROLL_DELAY)
        ).subscribe(() => {
            this.centerSelected()
        })
    }

    set(item, value) {
        this.setState((prevState) => {
            const state = {...prevState}
            state[item] = value
            if (item !== DAY) {
                // adjust day of month if not allowed in current month
                state.day = Math.min(prevState.day, daysInMonth(state.year, state.month))
            }
            return state
        })
    }

    highlight(value) {
        this.setState((prevState) => {
            const state = {...prevState}
            state.highlighted = value
            return state
        })
    }

    renderItem(item, value) {
        const displayValue = item === MONTH
            ? moment().month(value).format('MMM')
            : value
        const selected = this.state[item] === value
        const select = (e, item, value) => {
            const date = moment(this.props.input.value, DATE_FORMAT)
            if (date.isValid()) {
                date.set(toMomentUnit(item), value)
                this.props.input.set(date.format(DATE_FORMAT))
                this.set(item, value)
                this.centerItem(item, e.target)
            }
        }
        return selected ? (
            <li
                key={value}
                ref={this.selected[item]}
                onMouseOver={() => this.highlight(true)}
                onMouseOut={() => this.highlight(false)}
                className={this.state.highlighted ? styles.highlighted : styles.selected}>{displayValue}</li>
        ) : (
            <li
                key={value}
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => select(e, item, value)}>
                {displayValue}
            </li>
        )
    }

    renderList(item, range) {
        return (
            <ul
                key={item}
                onMouseOver={() => this.scroll$.next(item)}
                onScroll={() => this.scroll$.next(item)}>
                {range.map((value) => this.renderItem(item, value))}
            </ul>
        )
    }

    renderPicker(item) {
        const {fromYear, toYear} = this.props
        const days = this.state.month ? daysInMonth(this.state.year, this.state.month) : 31
        switch (item) {
            case YEAR:
                return this.renderList(YEAR, range(fromYear, toYear))
            case MONTH:
                return this.renderList(MONTH, range(0, 11))
            case DAY:
                return this.renderList(DAY, range(1, days))
            default:
        }
    }

    centerItem(item, element) {
        this.select$.next({item, element})
    }

    centerSelected() {
        items.map(item => this.centerItem(item, this.selected[item].current))
    }

    render() {
        return (
            <div className={styles.control}>
                <div className={styles.picker}>
                    {items.map(item => this.renderPicker(item))}
                </div>
            </div>
        )
    }

    componentWillUnmount() {
        this.subscriptions.map(subscription => subscription.unsubscribe())
    }

    componentDidMount() {
        this.centerSelected()
    }
}

DatePickerControl.propTypes = {
    date: PropTypes.object,
    fromYear: PropTypes.number,
    toYear: PropTypes.number
}

export default DatePicker
