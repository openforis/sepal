import {ElementResizeDetector} from 'widget/elementResizeDetector'
import {Subject, animationFrames, distinctUntilChanged, map, of, scan, switchMap} from 'rxjs'
import {compose} from 'compose'
import {connect} from 'store'
import {selectFrom} from 'stateUtils'
import {withCursorValue} from './cursorValue'
import {withMapAreaContext} from './mapAreaContext'
import {withRecipe} from 'app/home/body/process/recipeContext'
import {withSubscriptions} from 'subscription'
import PropTypes from 'prop-types'
import React from 'react'
import format from 'format'
import styles from './paletteLayer.module.css'

const mapRecipeToProps = recipe => ({
    areas: selectFrom(recipe, 'layers.areas') || {}
})

const MIN_STEPS = 40

class _PaletteLayer extends React.Component {
    state = {
        value: [],
        paletteWidth: null
    }

    constructor(props) {
        super(props)
        const {cursorValue$, addSubscription} = props
        addSubscription(
            cursorValue$.subscribe(value => this.setState({value: value && value}))
        )
    }

    render() {
        const {cursorValue$, mapAreaContext: {area}, areas} = this.props
        if (!cursorValue$) {
            return null
        }
        const {min, max, palette, inverted} = selectFrom(areas[area], 'imageLayer.layerConfig.visParams') || {}
        return palette
            ? this.renderPalette({
                min: min[0],
                max: max[0],
                palette,
                inverted: inverted && inverted.length && inverted[0] === true
            })
            : null
    }

    renderPalette({min, max, palette, inverted}) {
        const {value, paletteWidth, formattedMin, formattedMax, magnitude} = this.state
        const cursorValues = value.map((v, i) => {
            return <CursorValue
                key={i}
                value={Math.min(max, Math.max(min, value))}
                min={min}
                max={max}
                magnitude={magnitude}
                paletteWidth={paletteWidth}
            />
        })

        return (
            <div className={styles.container}>
                <div className={styles.legend}>
                    <Value value={formattedMin}/>
                    <div
                        className={styles.palette}
                        style={{'--palette': inverted
                            ? palette.slice().reverse()
                            : palette}}>
                        <ElementResizeDetector onResize={({width}) => this.setState({paletteWidth: width})}/>
                        {cursorValues}
                    </div>
                    <Value value={formattedMax}/>
                </div>
            </div>
        )
    }

    componentDidMount() {
        const {min, max} = this.getMinMax(this.props)
        this.formatMinMax({min, max})
    }

    componentDidUpdate(prevProps) {
        const {min: prevMin, max: prevMax} = this.getMinMax(prevProps)
        const {min, max} = this.getMinMax(this.props)

        if (min !== prevMin || max !== prevMax) {
            this.formatMinMax({min, max})
        }
    }

    getMinMax(props) {
        const {mapAreaContext: {area}, areas} = props
        const {min, max} = selectFrom(areas[area], 'imageLayer.layerConfig.visParams') || {}
        return {min, max}
    }

    formatMinMax({min, max}) {
        const magnitude = format.stepMagnitude({min, max, minSteps: MIN_STEPS})
        const formattedMin = format.numberToMagnitude({value: min[0], magnitude})
        const formattedMax = format.numberToMagnitude({value: max[0], magnitude})
        this.setState({formattedMin, formattedMax, magnitude})
    }
}

class _CursorValue extends React.Component {
    state = {
        position: null
    }
    targetPosition$ = new Subject()

    render() {
        const {value, min, max, magnitude} = this.props
        const {position} = this.state
        const prefix = value <= min
            ? <>&#8804; </>
            : value >= max
                ? <>&#8805; </>
                : ''
        const formatted = value <= min
            ? format.numberToMagnitude({value: min, magnitude})
            : value >= max
                ? format.numberToMagnitude({value: max, magnitude})
                : format.numberToMagnitude({value, magnitude})
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

        addSubscription(
            this.targetPosition$.pipe(
                switchMap(targetPosition => {
                    const {position} = this.state
                    return position === null
                        ? of(targetPosition)
                        : animationFrames().pipe(
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
    magnitude: PropTypes.any,
    max: PropTypes.any,
    min: PropTypes.any,
    paletteWidth: PropTypes.any,
    value: PropTypes.any
}

const lerp = (rate, speed = 1) => (value, target) => value + (target - value) * (rate * speed)

const Value = ({value}) => {
    return (
        <div className={styles.value}>
            {value}
        </div>
    )
}

export const PaletteLayer = compose(
    _PaletteLayer,
    connect(),
    withMapAreaContext(),
    withRecipe(mapRecipeToProps),
    withCursorValue(),
    withSubscriptions()
)

PaletteLayer.propTypes = {}
