import Hammer from 'hammerjs'
import PropTypes from 'prop-types'
import React from 'react'
import {animationFrameScheduler, fromEvent, interval} from 'rxjs'
import {distinctUntilChanged, filter, map, scan, switchMap, takeUntil} from 'rxjs/operators'
import styles from './slider.module.css'

const scale = (from, to) =>
    (value) => (value - from.min) * (to.max - to.min) / (from.max - from.min) + to.min

const limit = ({min, max}) =>
    (value) => Math.max(min, Math.min(max, value))

class Draggable {
    constructor(props) {
        const {minValue, maxValue, startValue, onChange} = props
        this.subscription = null
        this.minValue = minValue !== undefined ? minValue : 0
        this.maxValue = maxValue !== undefined ? maxValue : 100
        this.startValue = startValue !== undefined ? startValue : (maxValue - minValue) / 2
        this.onChange = onChange
        this.position = null
    }

    initialize({slider, handle}) {
        const width = slider.getBoundingClientRect().width

        this.mapToScreen = scale({min: this.minValue, max: this.maxValue}, {min: 0, max: width})
        this.mapToRange = scale({min: 0, max: width}, {min: this.minValue, max: this.maxValue})
        this.clipToScreen = limit({min: 0, max: width})
        this.clipToRange = limit({min: this.minValue, max: this.maxValue})

        this.getPosition = () => Math.round(parseFloat(handle.style.left))

        this.setPosition = (position) => {
            position = Math.round(position)
            if (position !== this.getPosition()) {
                this.position = position
                const value = this.getValue()
                this.onChange && this.onChange(value)
                handle.innerHTML = Math.round(value)
                handle.style.left = position + 'px'
                return true
            }
            return false
        }
        this.getValue = () => this.mapToRange(this.position)

        this.setValue = (value) => {
            this.setPosition(this.mapToScreen(value))
        }

        this.setValue(this.startValue)
        this.position = this.getPosition()

        const drag$ = (element) => {
            const hammerPan = new Hammer(element, {
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
                    const start = this.position
                    return panMove$.pipe(
                        map(pmEvent => ({
                            cursor: this.clipToScreen(start + pmEvent.deltaX),
                            speed: 1 - Math.max(0, Math.min(95, Math.abs(pmEvent.deltaY))) / 100
                        })),
                        distinctUntilChanged(),
                        takeUntil(panEnd$)
                    )
                }),
                switchMap(({cursor, speed}) => {
                    const start = this.position
                    return animationFrame$.pipe(
                        map(() => cursor),
                        scan(lerp(.3, speed), start),
                        distinctUntilChanged((a, b) => Math.abs(a - b) < .01),
                        takeUntil(panEnd$)
                    )
                })
            )
        }

        this.subscription = drag$(handle).subscribe(this.setPosition)
    }

    dispose() {
        this.subscription && this.subscription.unsubscribe()
    }
}

export class Slider extends React.Component {
    constructor(props) {
        super(props)
        this.slider = React.createRef()
        this.handle = React.createRef()
        this.draggable = new Draggable({
            minValue: props.minValue,
            maxValue: props.maxValue,
            startValue: props.startValue,
            onChange: props.onChange
        })
    }

    componentWillReceiveProps(props) {
        return this.draggable.setValue(props.startValue)
    }

    componentDidMount() {
        this.draggable.initialize({
            slider: this.slider.current,
            handle: this.handle.current
        })
    }

    render() {
        return (
            <div className={styles.container}>
                <div className={styles.slider} ref={this.slider}>
                    <div className={styles.handle} ref={this.handle}/>
                </div>
            </div>
        )
    }

    componentWillUnmount() {
        this.draggable.dispose()
    }
}

Slider.propTypes = {
    minValue: PropTypes.number,
    maxValue: PropTypes.number,
    startValue: PropTypes.number,
    onChange: PropTypes.func
}


// export class RangeSlider extends React.Component {
//     constructor(props) {
//         super(props)
//         this.container = React.createRef()
//         this.sliderMinHandle = React.createRef()
//         this.sliderMaxHandle = React.createRef()
//         this.state = {}
//         this.onChange = this.onChange.bind(this)
//     }
//     onChange() {
//         if (this.state.min && this.state.max)
//             this.props.onChange && this.props.onChange(this.state.min, this.state.max)
//     }
//     componentDidMount() {
//         this.sliderMin = drag({
//             element: this.sliderMinHandle.current, 
//             container: this.container.current, 
//             options: this.props,
//             onChange: (min) => {
//                 this.setState({
//                     ...this.state,
//                     min
//                 })
//                 this.onChange()
//             }
//         })
//         this.sliderMax = drag({
//             element: this.sliderMaxHandle.current, 
//             container: this.container.current, 
//             options: this.props,
//             onChange: (max) => {
//                 this.setState({
//                     ...this.state,
//                     max
//                 })
//                 this.onChange()
//             }
//         })
//     }
//     render() {
//         return (
//             <div className={styles.container}>
//                 <div className={styles.slider} ref={this.container}>
//                     <div className={styles.handle} ref={this.sliderMinHandle}/>
//                     <div className={styles.handle} ref={this.sliderMaxHandle}/>
//                 </div>
//             </div>
//         )
//     }
//     componentWillUnmount() {
//         this.sliderMin.unsubscribe()
//         this.sliderMax.unsubscribe()
//     }
// }

// RangeSlider.propTypes = {
//     min: PropTypes.number,
//     max: PropTypes.number,
//     onChange: PropTypes.func
// }
