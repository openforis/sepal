import PropTypes from 'prop-types'
import React from 'react'
import styles from './datePicker.module.css'
import moment from 'moment'
import Rx from 'rxjs'

const range = (from, to) =>
    Array.from({length: (to - from + 1)}, (v, k) => k + from)

const ANIMATION_SPEED = .2
const AUTOSCROLL_DELAY = 1000

const YEAR = 'year'
const MONTH = 'month'
const DAY = 'day'

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

class DatePicker extends React.Component {
    constructor(props) {
        super(props)
        this.state = {
            edit: false
        }
    }
    static getDerivedStateFromProps(props, state) {
        return {
            ...state,
            date: props.date || new Date()
        }
    }
    editDate() {
        this.setState((prevState) => {
            const state = {...prevState}
            state.edit = true
            return state
        })
    }
    setDate(date) {
        this.setState((prevState) => {
            const state = {...prevState}
            state.date = date
            state.edit = false
            return state
        })
        this.props.onChange(date)
    }
    render() {
        return this.state.edit ? (
            <DatePickerOn fromYear={1980} toYear={2020} date={this.state.date}
                onChange={date => this.setDate(date)}/>
        ) : (
            <a className={styles.date} onClick={() => this.editDate()}>
                {moment(this.state.date).format('YYYY MMM DD')}
            </a>
        )
    }
}

DatePicker.propTypes = {
    date: PropTypes.object,
    fromYear: PropTypes.number,
    toYear: PropTypes.number,
    onChange: PropTypes.func.isRequired
}

class DatePickerOn extends React.Component {
    constructor(props) {
        super(props)
        const date = moment(props.date)
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

        this.select$ = new Rx.Subject()
        this.autoUnsubscribe(this.select(this.select$, YEAR))
        this.autoUnsubscribe(this.select(this.select$, MONTH))
        this.autoUnsubscribe(this.select(this.select$, DAY))

        this.scroll$ = new Rx.Subject()
        this.autoUnsubscribe(this.autoScroll(this.scroll$))

        // this.scrolling$ = this.scroll$
        //     .map(() => true)
        //     .merge(this.scroll$.debounceTime(100).map(() => false))
        //     .distinctUntilChanged()
        // this.scrolling$.subscribe((value) => console.log('scrolling', value))
    }
    autoUnsubscribe(subscription) {
        this.subscriptions.push(subscription)
    }
    select(select$, item) {
        const animationFrame$ = Rx.Observable.interval(0, Rx.Scheduler.animationFrame)
        return select$
            .filter(selected => selected.item === item)
            .map(selected => selected.element)
            .switchMap((element) => {
                const target = targetScrollOffset(element)
                const scroll$ = animationFrame$
                    .map(() => target)
                    .scan(lerp(ANIMATION_SPEED), currentScrollOffset(element))
                const stop$ = scroll$
                    .filter(value => Math.abs(value - target) < .5)
                    .skip(1) // delay stop event
                    .first() // just one stop event
                return scroll$
                    .map((value) => ({element, value}))
                    .takeUntil(stop$)
            })
            .subscribe(({element, value}) => setScrollOffset(element, Math.round(value)))
    }
    autoScroll(scroll$) {
        return scroll$
            .debounceTime(AUTOSCROLL_DELAY)
            .subscribe(() => {
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
            this.set(item, value)
            this.centerItem(item, e.target)
        }
        return selected ? (
            <li key={value} ref={this.selected[item]} 
                onMouseOver={() => this.highlight(true)} 
                onMouseOut={() => this.highlight(false)} 
                onClick={this.onClick.bind(this)} 
                className={this.state.highlighted ? styles.highlighted : styles.selected}>{displayValue}</li>
        ) : (
            <li key={value} onClick={(e) => select(e, item, value)}>{displayValue}</li>
        )
    }
    renderList(item, range) {
        return (
            <ul key={item} onMouseOver={() => this.scroll$.next(item)} onScroll={() => this.scroll$.next(item)}>
                {range.map((value) => this.renderItem(item, value))}
            </ul>
        )
    }
    renderPicker(item) {
        const {fromYear, toYear} = this.props
        const days = this.state.month ? daysInMonth(this.state.year, this.state.month) : 31
        switch(item) {
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
    onClick() {
        const date = new Date(this.state.year, this.state.month, this.state.day)
        // if (!this.props.date || date.getTime() !== this.props.date.getTime()) {
        this.props.onChange(date)
        // }
    }
    render() {
        return (
            <div className={styles.container}>
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

DatePickerOn.propTypes = {
    date: PropTypes.object,
    fromYear: PropTypes.number,
    toYear: PropTypes.number,
    onChange: PropTypes.func.isRequired
}

export default DatePicker
