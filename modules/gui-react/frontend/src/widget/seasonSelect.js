import Hammer from 'hammerjs'
import moment from 'moment'
import PropTypes from 'prop-types'
import React from 'react'
import ReactResizeDetector from 'react-resize-detector'
import {animationFrameScheduler, fromEvent, interval} from 'rxjs'
import {distinctUntilChanged, filter, map, scan, switchMap, takeUntil} from 'rxjs/operators'
import styles from './seasonSelect.module.css'

const DATE_FORMAT = 'YYYY-MM-DD'

export default class SeasonSelect extends React.Component {
    element = React.createRef()
    state = {
        centerDate: null,
        centerDay: null,
        minDate: null,
        maxDate: null,
        maxDay: null,
        width: null
    }

    static getDerivedStateFromProps(nextProps, prevState) {
        const defaultIfInvalid = (date, defaultDate) => {
            date = moment(date)
            return date.isValid() ? date : defaultDate()
        }
        const calcMinDate = (centerDate) => moment(centerDate).subtract(1, 'years').add(1, 'day')
        const calcMaxDate = (centerDate) => moment(nextProps.centerDate).add(1, 'years')

        let centerDate = defaultIfInvalid(nextProps.centerDate, () => moment())
        let startDate = defaultIfInvalid(nextProps.startDate, () => calcMinDate(centerDate))
        let endDate = defaultIfInvalid(nextProps.endDate, () => calcMaxDate(centerDate))

        const centerDateUnchanged = prevState.centerDate && prevState.centerDate.isSame(centerDate)
        if (centerDateUnchanged)
            return {...prevState, centerDate, startDate, endDate}

        const prevCenterDate = prevState.centerDate || centerDate
        const minDate = calcMinDate(centerDate)
        const maxDate = calcMaxDate(centerDate)
        const centerDay = centerDate.diff(minDate, 'days')
        const maxDay = maxDate.diff(minDate, 'days')

        let startCenterYearDiff = startDate.year() - prevCenterDate.year()
        startDate.set('year', centerDate.year() + startCenterYearDiff)
        startDate = SeasonSelect.constrainStartDate(startDate, centerDate)

        let endCenterYearDiff = endDate.year() - prevCenterDate.year()
        endDate.set('year', centerDate.year() + endCenterYearDiff)
        endDate = SeasonSelect.constrainEndDate(endDate, centerDate)
        return {...prevState, centerDate, centerDay, minDate, maxDay, startDate, endDate}
    }

    static constrainStartDate(startDate, centerDate) {
        return moment.max(
            moment.min(startDate, centerDate),
            moment(centerDate).subtract(1, 'years').add(1, 'day')
        )
    }

    static constrainEndDate(endDate, centerDate) {
        return moment.min(
            moment.max(endDate, moment(centerDate).add(1, 'days')),
            moment(centerDate).add(1, 'years')
        )
    }

    render() {
        const {centerDate, centerDay, startDate, endDate, maxDay, width} = this.state
        const {className, disabled} = this.props
        return (
            <div className={className}>
                <div className={styles.container} ref={this.element}>
                    {disabled ? <div className={styles.disabled}/> : null}
                    <div className={styles.axisReference}>
                        <div className={styles.centerMarker}>
                            <div className={styles.label}>{this.formatDay(centerDay)}</div>
                        </div>
                        <Handle
                            position={this.dateToPosition(startDate)}
                            min={0}
                            max={this.dateToPosition(centerDate)}
                            onChange={this.startPositionChanged.bind(this)}>
                            <DateFlag
                                date={startDate}
                                onChange={this.startIncrementDays.bind(this)}
                                className={styles.leftFlag}/>
                        </Handle>
                        <Handle
                            position={this.dateToPosition(endDate)}
                            min={this.dayToPosition(centerDay + 1)}
                            max={width}
                            onChange={this.endPositionChanged.bind(this)}>
                            <DateFlag
                                date={endDate}
                                onChange={this.endIncrementDays.bind(this)}
                                className={styles.rightFlag}/>
                        </Handle>
                        <Axis
                            dateRange={this}
                            centerDate={centerDate}
                            width={width}/>
                        <div
                            className={styles.selectedRange}
                            style={{
                                left: `${this.dateToPosition(startDate)}px`,
                                right: `${this.dayToPosition(maxDay) - this.dateToPosition(endDate) - 1}px`
                            }}/>
                    </div>
                    <ReactResizeDetector
                        handleWidth
                        onResize={this.widthUpdated.bind(this)}/>
                </div>
            </div>
        )
    }

    componentDidUpdate(prevProps, prevState) {
        const changed = ['startDate', 'endDate', 'centerDate'].find((key) => prevState[key] !== this.state[key])
        if (changed)
            this.notifyChange()
    }

    dateToPosition(date) {
        return this.dayToPosition(this.dateToDay(date))
    }

    positionToDate(date) {
        return this.dayToDate(this.positionToDay(date))
    }

    dateToDay(date) {
        return date.diff(this.state.minDate, 'days')
    }

    dayToDate(day) {
        return moment(this.state.minDate).add(day, 'days')
    }

    dayToPosition(day) {
        return Math.round(day * this.state.width / this.state.maxDay)
    }

    positionToDay(position) {
        return Math.round(position * this.state.maxDay / this.state.width)
    }

    monthIndexToPosition(i) {
        return this.dateToPosition(moment(this.state.minDate).add(i, 'months'))
            - this.dayToPosition(this.state.centerDate.date())
    }

    formatDay(day) {
        return this.dayToDate(day).format('MMM DD')
    }

    static formatDate(date) {
        return date.format('MMM DD')
    }

    widthUpdated(width) {
        this.setState((prevState) => ({...prevState, width}))
    }

    notifyChange() {
        this.props.onChange && this.props.onChange(
            this.state.startDate.format(DATE_FORMAT),
            this.state.endDate.format(DATE_FORMAT)
        )
    }

    startIncrementDays(change) {
        this.startDateChanged(moment(this.state.startDate).add(change, 'days'))
    }

    endIncrementDays(change) {
        this.endDateChanged(
            moment(this.state.endDate).add(change, 'days')
        )
    }

    startPositionChanged(position) {
        this.startDateChanged(this.positionToDate(position))
    }

    startDateChanged(startDate) {
        if (!this.state.startDate.isSame(startDate))
            this.setState(
                (prevState) => {
                    startDate = SeasonSelect.constrainStartDate(startDate, prevState.centerDate)
                    const maxEndDate = moment(startDate).add(1, 'years')
                    const endDate = moment.min(prevState.endDate, maxEndDate)
                    return {...prevState, startDate, endDate}
                })

    }

    endPositionChanged(position) {
        this.endDateChanged(this.positionToDate(position))
    }

    endDateChanged(endDate) {
        if (!this.state.endDate.isSame(endDate))
            this.setState(
                (prevState) => {
                    endDate = SeasonSelect.constrainEndDate(endDate, prevState.centerDate)
                    const maxStartDate = moment(endDate).subtract(1, 'years')
                    const startDate = moment.max(prevState.startDate, maxStartDate)
                    return {...prevState, startDate, endDate}
                })
    }
}

SeasonSelect.propTypes = {
    startDate: PropTypes.object.isRequired,
    endDate: PropTypes.object.isRequired,
    centerDate: PropTypes.object.isRequired,
    disabled: PropTypes.any,
    className: PropTypes.string,
    onChange: PropTypes.func
}

const DateFlag = ({date, className, onChange}) =>
    <div className={[styles.flag, className].join(' ')}>
        <div className={styles.label}>
            {SeasonSelect.formatDate(date)}
            <div className={styles.decrease} onMouseDown={() => onChange(-1)}/>
            <div className={styles.increase} onMouseDown={() => onChange(1)}/>
        </div>
    </div>

class Axis extends React.Component {
    shouldComponentUpdate(nextProps) {
        return !!['centerDate', 'width'].find((key) =>
            nextProps[key] !== this.props[key]
        )
    }

    render() {
        const {dateRange} = this.props
        const ticks = [...Array(25).keys()]
            .map((i) => [dateRange.monthIndexToPosition(i), i])
            .filter(([position, i]) => position >= 0)
            .map(([position, i]) => {
                    return <div
                        key={i}
                        style={{left: `${position}px`}}/>
                }
            )
        const months = [...Array(24).keys()]
            .filter((i) => i % 2)
            .map((i) =>
                <div
                    key={i}
                    style={{
                        left: `${dateRange.monthIndexToPosition(i)}px`,
                        width: `${dateRange.monthIndexToPosition(i + 1) - dateRange.monthIndexToPosition(i)}px`,
                    }}>
                    {moment(dateRange.state.minDate).add(i, 'months').format('MMM')}
                </div>
            )
        return (
            <div>
                <div className={styles.axis}/>
                <div className={styles.ticks}>
                    {ticks}
                </div>
                <div className={styles.months}>
                    {months}
                </div>

            </div>
        )
    }
}

class Handle extends React.Component {
    element = React.createRef()

    componentDidMount() {
        this.subscription = this.drag$()
            .subscribe(this.setPosition.bind(this))
    }

    setPosition(position) {
        position = Math.round(position)
        if (position >= 0 && position !== this.position) {
            this.props.onChange(position)
        }
    }

    render() {
        const {position, children} = this.props
        return (
            <div
                ref={this.element}
                className={styles.handle}
                style={{left: `${position}px`}}>
                <div className={styles.handleGrabArea}/>
                {children}
            </div>
        )
    }

    componentWillUnmount() {
        this.subscription && this.subscription.unsubscribe()
    }

    clampPosition(position) {
        return Math.max(this.props.min, Math.min(this.props.max, position))
    }

    drag$() {
        const hammerPan = new Hammer(this.element.current, {
            threshold: 1
        })
        hammerPan.get('pan').set({direction: Hammer.DIRECTION_HORIZONTAL})
        const pan$ = fromEvent(hammerPan, 'panstart panmove panend')
        const panStart$ = pan$.pipe(filter(e => e.type === 'panstart'))
        const panMove$ = pan$.pipe(filter(e => e.type === 'panmove'))
        const panEnd$ = pan$.pipe(filter(e => e.type === 'panend'))
        const animationFrame$ = interval(0, animationFrameScheduler)
        const lerp = (rate, speed) => {
            return (value, targetValue) => {
                const delta = (targetValue - value) * (rate * speed)
                return value + delta
            }
        }
        return panStart$.pipe(
            switchMap(() => {
                const start = this.props.position
                return panMove$.pipe(
                    map(e => ({
                        cursor: this.clampPosition(start + e.deltaX),
                        speed: 1 - Math.max(0, Math.min(95, Math.abs(e.deltaY))) / 100
                    })),
                    distinctUntilChanged(),
                    takeUntil(panEnd$)
                )
            }),
            switchMap(({cursor, speed}) => {
                const start = this.props.position
                return animationFrame$.pipe(
                    map(() => cursor),
                    scan(lerp(.3, speed), start),
                    distinctUntilChanged((a, b) => Math.abs(a - b) < .01),
                    takeUntil(panEnd$)
                )
            })
        )
    }
}