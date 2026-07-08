import PropTypes from 'prop-types'
import React from 'react'
import {animationFrames, distinctUntilChanged, filter, fromEvent, map, merge, sample, switchMap, take, takeUntil, tap} from 'rxjs'

import {compose} from '~/compose'
import {withSubscriptions} from '~/subscription'

import styles from './scrubControl.module.css'
import {toggleMinMax, valueFromVerticalDrag} from './scrubValue'

// Vertical travel (px) below which a press is treated as a click (toggle) rather than a drag.
const CLICK_THRESHOLD = 3

const identity = value => value

// Compact numeric scrub control in the footprint of a small round button. Drag up/down to change a bounded
// value; click or Enter/Space toggles endpoints. The value previews live during a drag via `onPreview(value)`
// (frame-aligned) and commits exactly once on release via `onChange(value)`. `onChange` is not called during
// movement. `formatValue` produces the row text and `tooltip` (string or value->string) the title.
//
// Pointer handling is RxJS over NATIVE pointer events (not Hammer): a capture-phase pointerdown stops
// propagation so an ancestor ListItem's Hammer row-drag never starts, and pointer capture keeps move/up/
// cancel events flowing while the pointer leaves the small target. A single revert path (pointercancel,
// lostpointercapture, and unmount-while-dragging) previews the original value and does not commit.
class _ScrubControl extends React.Component {
    ref = React.createRef()

    state = {dragging: false, dragValue: null}

    constructor(props) {
        super(props)
        this.onKeyDown = this.onKeyDown.bind(this)
    }

    render() {
        const {min = 0, max = 1, formatValue = identity, tooltip} = this.props
        const value = this.currentValue()
        const level = max > min ? (value - min) / (max - min) : 0
        const title = typeof tooltip === 'function' ? tooltip(value) : tooltip
        return (
            <button
                type='button'
                ref={this.ref}
                className={styles.control}
                style={{'--scrub-level': level}}
                title={title}
                aria-label={title}
                onKeyDown={this.onKeyDown}>
                {formatValue(value)}
            </button>
        )
    }

    currentValue() {
        const {value} = this.props
        const {dragging, dragValue} = this.state
        return dragging ? dragValue : value
    }

    componentDidMount() {
        const {addSubscription} = this.props
        const element = this.ref.current

        const pointerDown$ = fromEvent(element, 'pointerdown', {capture: true})
        const pointerMove$ = fromEvent(element, 'pointermove')
        const pointerUp$ = fromEvent(element, 'pointerup')
        const revert$ = merge(
            fromEvent(element, 'pointercancel'),
            fromEvent(element, 'lostpointercapture')
        )
        // Capture-phase stop on every press variant so an ancestor row's Hammer recognizer never starts.
        const blockHammer$ = merge(
            pointerDown$,
            fromEvent(element, 'mousedown', {capture: true}),
            fromEvent(element, 'touchstart', {capture: true, passive: false})
        )

        const drag$ = pointerDown$.pipe(
            filter(e => e.button == null || e.button === 0),
            switchMap(down => {
                this.beginDrag(down)
                const end$ = merge(
                    pointerUp$.pipe(map(() => ({type: 'commit'}))),
                    revert$.pipe(map(() => ({type: 'revert'})))
                )
                // Frame-aligned live preview: sample the latest pointer position each animation frame.
                const preview$ = pointerMove$.pipe(
                    tap(e => this.trackMove(e)),
                    map(e => this.valueAt(e.clientY)),
                    sample(animationFrames()),
                    distinctUntilChanged(),
                    map(value => ({type: 'preview', value})),
                    takeUntil(end$)
                )
                return merge(preview$, end$.pipe(take(1)))
            })
        )

        addSubscription(
            blockHammer$.subscribe(e => e.stopPropagation()),
            drag$.subscribe(action => this.handleAction(action))
        )
    }

    componentWillUnmount() {
        // Popup/list closed mid-drag: restore the original value on the live target; never commit.
        if (this.state.dragging) {
            this.props.onPreview?.(this.startValue)
        }
    }

    valueAt(currentY) {
        const {min = 0, max = 1, sensitivity = 100} = this.props
        return valueFromVerticalDrag({startValue: this.startValue, startY: this.startY, currentY, min, max, sensitivity})
    }

    beginDrag(down) {
        down.stopPropagation()
        down.preventDefault?.()
        this.startY = down.clientY
        this.startValue = this.props.value
        this.lastY = down.clientY
        this.moved = false
        this.pointerId = down.pointerId
        this.ref.current.setPointerCapture?.(down.pointerId)
        this.setState({dragging: true, dragValue: this.props.value})
    }

    trackMove(e) {
        this.lastY = e.clientY
        if (Math.abs(e.clientY - this.startY) > CLICK_THRESHOLD) {
            this.moved = true
        }
    }

    handleAction(action) {
        switch (action.type) {
            case 'preview':
                this.setState({dragValue: action.value})
                this.props.onPreview?.(action.value)
                break
            case 'commit':
                this.endDrag()
                this.commit(this.moved ? this.valueAt(this.lastY) : this.toggled())
                break
            case 'revert':
                this.props.onPreview?.(this.startValue)
                this.endDrag()
                break
            default:
        }
    }

    endDrag() {
        this.ref.current?.releasePointerCapture?.(this.pointerId)
        this.setState({dragging: false, dragValue: null})
    }

    onKeyDown(e) {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            e.stopPropagation()
            this.commit(this.toggled())
        }
    }

    toggled() {
        const {value, min = 0, max = 1, toggleValue} = this.props
        return toggleValue ? toggleValue(value) : toggleMinMax(value, min, max)
    }

    commit(value) {
        const {value: current, onChange} = this.props
        if (value !== current) {
            onChange(value)
        }
    }
}

export const ScrubControl = compose(
    _ScrubControl,
    withSubscriptions()
)

ScrubControl.propTypes = {
    value: PropTypes.number.isRequired,
    onChange: PropTypes.func.isRequired,
    formatValue: PropTypes.func,
    max: PropTypes.number,
    min: PropTypes.number,
    sensitivity: PropTypes.number,
    toggleValue: PropTypes.func,
    tooltip: PropTypes.oneOfType([PropTypes.func, PropTypes.string]),
    onPreview: PropTypes.func
}
