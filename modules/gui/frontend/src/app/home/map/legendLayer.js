import * as PropTypes from 'prop-types'
import {ElementResizeDetector} from 'widget/elementResizeDetector'
import {Subject, animationFrameScheduler, interval, of} from 'rxjs'
import {compose} from 'compose'
import {connect} from 'store'
import {distinctUntilChanged, map, scan, switchMap} from 'rxjs/operators'
import {selectFrom} from 'stateUtils'
import {withCursorValue} from './cursorValue'
import {withMapAreaContext} from './mapAreaContext'
import {withRecipe} from 'app/home/body/process/recipeContext'
import React from 'react'
import format from 'format'
import styles from './legendLayer.module.css'
import withSubscriptions from 'subscription'

const mapRecipeToProps = recipe => ({
    areas: selectFrom(recipe, 'layers.areas') || {}
})

class _LegendLayer extends React.Component {
    state = {
        value: [],
        paletteWidth: null
    }

    constructor(props) {
        super(props)
        const {cursorValue$, addSubscription} = props
        addSubscription(
            cursorValue$.subscribe(value => this.setState({value}))
        )
    }

    render() {
        const {mapAreaContext: {area}, areas} = this.props
        const {min, max, palette, inverted} = selectFrom(areas[area], 'imageLayer.layerConfig.visParams') || {}
        return this.renderLegend({min: min[0], max: max[0], palette, inverted: inverted && inverted.length && inverted[0] === true})
    }

    renderLegend({min, max, palette, inverted}) {
        const {value, paletteWidth} = this.state
        const cursorValues = value.map((v, i) =>
            <CursorValue
                key={i}
                value={Math.min(max, Math.max(min, v))}
                min={min}
                max={max}
                paletteWidth={paletteWidth}
            />
        )
        return (
            <div className={styles.container}>
                <div className={styles.legend}>
                    <Value value={min}/>
                    <div
                        className={styles.palette}
                        style={{'--palette': inverted
                            ? palette.slice().reverse()
                            : palette}}>
                        <ElementResizeDetector onResize={({width}) => this.setState({paletteWidth: width})}/>
                        {cursorValues}
                    </div>
                    <Value value={max}/>
                </div>
            </div>
        )
    }
}

class _CursorValue extends React.Component {
    state = {
        position: null
    }
    targetPosition$ = new Subject()

    render() {
        const {value, min, max} = this.props
        const {position} = this.state
        const prefix = value <= min
            ? <>&#8805; </>
            : value >= max
                ? <>&#8804; </>
                : ''
        const formatted = format.number({value, precisionDigits: 3})
        return (
            <div
                className={styles.cursorValue}
                style={{'--left': `${position}px`}}>
                {prefix}
                {formatted}
                <div className={styles.arrow}/>
            </div>
        )
    }

    componentDidMount() {
        const {addSubscription} = this.props
        const animationFrame$ = interval(0, animationFrameScheduler)

        addSubscription(
            this.targetPosition$.pipe(
                switchMap(targetPosition => {
                    const {position} = this.state
                    if (position === null) {
                        return of(targetPosition)
                    }
                    return animationFrame$.pipe(
                        map(() => targetPosition),
                        scan(lerp(.1), position),
                        map(position => Math.round(position)),
                        distinctUntilChanged()
                    )
                })
            ).subscribe(position =>
                this.setPosition(position)
            )
        )
    }

    componentDidUpdate() {
        const {value, min, max, paletteWidth} = this.props
        const {position} = this.state
        const factor = (value - min) / (max - min)
        const nextPosition = Math.round(paletteWidth * factor)
        if (position !== nextPosition) {
            this.targetPosition$.next(nextPosition)
        }
    }

    setPosition(position) {
        position = Math.round(position)
        if (position !== this.state.position) {
            this.setState({position})
        }
    }
}

const CursorValue = compose(
    _CursorValue,
    withSubscriptions()
)

CursorValue.propTypes = {
    max: PropTypes.any,
    min: PropTypes.any,
    paletteWidth: PropTypes.any,
    value: PropTypes.any
}

const lerp = (rate, speed = 1) => (value, target) => value + (target - value) * (rate * speed)

const Value = ({value}) =>
    <div className={styles.value}>
        {format.number({value, precisionDigits: 3})}
    </div>

export const LegendLayer = compose(
    _LegendLayer,
    connect(),
    withMapAreaContext(),
    withRecipe(mapRecipeToProps),
    withCursorValue(),
    withSubscriptions()
)

LegendLayer.propTypes = {}
