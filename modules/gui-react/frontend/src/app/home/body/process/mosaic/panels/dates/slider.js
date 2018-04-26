import React from 'react'
import styles from './slider.module.css'
import Rx from 'rxjs'
import Hammer from 'hammerjs'
import PropTypes from 'prop-types'

const drag = ({element, container, options, onChange}) => {
    options = options || {}

    const limit = ({min, max}) => 
        (value) => Math.max(min, Math.min(max, value))
    // const map = (from, to) => 
        // (value) => (value - from.min) * (to.max - to.min) / (from.max - from.min) + to.min
    const map = (from, to) => (value) => {
        const fromRange = from.max - from.min
        const toRange = to.max - to.min
        return (value - from.min) * toRange / fromRange + to.min
    }

    const min = options.min !== undefined ? options.min : 0
    const max = options.max !== undefined ? options.max : 100
    const start = options.start !== undefined ? options.start : (options.max - options.min) / 2
    const width = container.getBoundingClientRect().width
    const mapToScreen = map({min, max}, {min: 0, max: width})
    const mapToRange = map({min: 0, max: width}, {min, max})
    const clipToRange = limit({min, max})

    const getCurrent = () => mapToRange(parseFloat(element.style.left))
    const setCurrent = (value) => {
        current = value
        onChange && onChange(value)
        element.style.left = mapToScreen(value) + 'px'
    }

    let current = getCurrent()
    
    if (start) {
        setCurrent(start)
    }

    const drag$ = (element) => {
        const hammerPan = new Hammer(element, {
            threshold: 1
        })
        hammerPan.get('pan').set({ direction: Hammer.DIRECTION_HORIZONTAL })

        const pan$ = Rx.Observable.fromEvent(hammerPan, 'panstart panmove panend')
        const panStart$ = pan$.filter(e => e.type === 'panstart')
        const panMove$ = pan$.filter(e => e.type === 'panmove')
        const panEnd$ = pan$.filter(e => e.type === 'panend')
        const animationFrame$ = Rx.Observable.interval(0, Rx.Scheduler.animationFrame)

        const lerp = (rate, speed) => {
            return (value, targetValue) => {
                const delta = (targetValue - value) * (rate * speed)
                return value + delta
            }      
        }

        return panStart$
            .switchMap(() => {
                const start = current - min
                return panMove$
                    .map(pmEvent => ({
                        cursor: clipToRange(start + mapToRange(pmEvent.deltaX)),
                        speed: 1 - Math.max(0, Math.min(95, Math.abs(pmEvent.deltaY))) / 100
                    }))
                    .distinctUntilChanged()
                    .takeUntil(panEnd$)
            })
            .switchMap(({cursor, speed}) => {
                const start = current
                return animationFrame$
                    .map(() => cursor)
                    .scan(lerp(.1, speed), start)
                    .distinctUntilChanged((a, b) => Math.abs(a - b) < .01)
                    .takeUntil(panEnd$)
            })
    }

    const subscription = drag$(element).subscribe(setCurrent)
            
    return {
        getValue: current,
        unsubscribe: subscription.unsubscribe
    }
}

export class Slider extends React.Component {
    constructor(props) {
        super(props)
        this.container = React.createRef()
        this.sliderHandle = React.createRef()
    }
    componentDidMount() {
        this.slider = drag({
            element: this.sliderHandle.current, 
            container: this.container.current, 
            options: this.props,
            onChange: this.props.onChange
        })
    }
    render() {
        return (
            <div className={styles.container}>
                <div className={styles.slider} ref={this.container}>
                    <div className={styles.handle} ref={this.sliderHandle}/>
                </div>
            </div>
        )
    }
    componentWillUnmount() {
        this.slider.unsubscribe()
    }
}

Slider.propTypes = {
    min: PropTypes.number,
    max: PropTypes.number,
    onChange: PropTypes.func
}

export class RangeSlider extends React.Component {
    constructor(props) {
        super(props)
        this.container = React.createRef()
        this.sliderMinHandle = React.createRef()
        this.sliderMaxHandle = React.createRef()
        this.state = {}
        this.onChange = this.onChange.bind(this)
    }
    onChange() {
        if (this.state.min && this.state.max)
            this.props.onChange && this.props.onChange(this.state.min, this.state.max)
    }
    componentDidMount() {
        this.sliderMin = drag({
            element: this.sliderMinHandle.current, 
            container: this.container.current, 
            options: this.props,
            onChange: (min) => {
                this.setState({
                    ...this.state,
                    min
                })
                this.onChange()
            }
        })
        this.sliderMax = drag({
            element: this.sliderMaxHandle.current, 
            container: this.container.current, 
            options: this.props,
            onChange: (max) => {
                this.setState({
                    ...this.state,
                    max
                })
                this.onChange()
            }
        })
    }
    render() {
        return (
            <div className={styles.container}>
                <div className={styles.slider} ref={this.container}>
                    <div className={styles.handle} ref={this.sliderMinHandle}/>
                    <div className={styles.handle} ref={this.sliderMaxHandle}/>
                </div>
            </div>
        )
    }
    componentWillUnmount() {
        this.sliderMin.unsubscribe()
        this.sliderMax.unsubscribe()
    }
}

RangeSlider.propTypes = {
    min: PropTypes.number,
    max: PropTypes.number,
    onChange: PropTypes.func
}
