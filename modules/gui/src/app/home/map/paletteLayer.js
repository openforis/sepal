import {ElementResizeDetector} from '~/widget/elementResizeDetector'
import {Subject, animationFrames, distinctUntilChanged, map, of, scan, switchMap} from 'rxjs'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {selectFrom} from '~/stateUtils'
import {withCursorValue} from './cursorValue'
import {withMapArea} from './mapAreaContext'
import {withRecipe} from '~/app/home/body/process/recipeContext'
import {withSubscriptions} from '~/subscription'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import format from '~/format'
import memoizeOne from 'memoize-one'
import styles from './paletteLayer.module.css'

const mapRecipeToProps = recipe => ({
    areas: selectFrom(recipe, 'layers.areas') || {}
})

const MIN_STEPS = 40

const getVisualizationParameters = ({mapArea: {area}, areas}) =>
    areas[area]?.imageLayer?.layerConfig?.visParams || {}

class _PaletteLayer extends React.Component {
    state = {
        value: [],
        paletteWidth: null
    }

    constructor(props) {
        super(props)
        const {cursorValue$, addSubscription} = props
        this.setPaletteWidth = this.setPaletteWidth.bind(this)
        addSubscription(
            cursorValue$.subscribe(value => this.setState({value}))
        )
    }

    render() {
        const {cursorValue$} = this.props
        if (!cursorValue$) {
            return null
        }
        const {dataType, min, max, palette, inverted} = this.getVisualizationParameters()
        return palette?.length > 1
            ? this.renderPalette({
                dataType,
                min: min[0],
                max: max[0],
                palette,
                inverted: inverted && inverted.length && inverted[0] === true
            })
            : null
    }

    renderPalette({dataType, min, max, palette, inverted}) {
        return (
            <div className={styles.container}>
                <div className={styles.legend}>
                    {this.renderMinValue()}
                    <div
                        className={styles.palette}
                        style={{'--palette': inverted
                            ? palette.slice().reverse()
                            : palette}}>
                        <ElementResizeDetector onResize={this.setPaletteWidth}/>
                        {this.renderCursorValues({dataType, min, max})}
                    </div>
                    {this.renderMaxValue()}
                </div>
            </div>
        )
    }

    renderMinValue() {
        const {formattedMin} = this.state
        return (
            <Value value={formattedMin}/>
        )
    }

    renderMaxValue() {
        const {formattedMax} = this.state
        return (
            <Value value={formattedMax}/>
        )
    }

    renderCursorValues({dataType, min, max}) {
        const {value} = this.state
        return value.map((_v, i) => this.renderCursorValue({dataType, min, max}, i))
    }

    renderCursorValue({dataType, min, max}, i) {
        const {value, paletteWidth, magnitude} = this.state
        return (
            <CursorValue
                key={i}
                value={value}
                min={min}
                max={max}
                dataType={dataType}
                magnitude={magnitude}
                paletteWidth={paletteWidth}
            />
        )
    }

    setPaletteWidth({width}) {
        this.setState({paletteWidth: width})
    }

    static getDerivedStateFromProps(props) {
        const {dataType, min, max} = getVisualizationParameters(props)

        const getMagnitude = memoizeOne(
            (min, max) => format.stepMagnitude({min, max, minSteps: MIN_STEPS})
        )
        const getFormattedMin = memoizeOne(
            (dataType, min, magnitude) => formatValue({dataType, value: min && min[0], magnitude})
        )
        const getFormattedMax = memoizeOne(
            (dataType, max, magnitude) => formatValue({dataType, value: max && max[0], magnitude})
        )
        const magnitude = getMagnitude(min, max)
        const formattedMin = getFormattedMin(dataType, min, magnitude)
        const formattedMax = getFormattedMax(dataType, max, magnitude)
        
        return {magnitude, formattedMin, formattedMax}
    }

    getVisualizationParameters() {
        return getVisualizationParameters(this.props)
    }
}

class _CursorValue extends React.Component {
    state = {
        position: null
    }
    targetPosition$ = new Subject()

    render() {
        const {dataType, value, min, max, magnitude} = this.props
        const {position} = this.state
        const clampedValue = _.clamp(value, min, max)
        const formattedValue = formatValue({dataType, value: clampedValue, magnitude})
        return position !== null ? (
            <div
                className={[styles.cursorValue, styles[dataType || 'default']].join(' ')}
                style={{'--left': `${position}px`}}>
                {this.renderPrefix(clampedValue, min, max)}
                {formattedValue}
                <div className={styles.arrow}/>
            </div>
        ) : null
    }

    renderPrefix(value, min, max) {
        if (value <= min) {
            return <>&#8804; </>
        }
        if (value >= max) {
            return <>&#8805; </>
        }
        return ''
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
        this.setState(({position: prevPosition}) => {
            if (position !== prevPosition) {
                return {position}
            }
        })
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

const formatValue = ({dataType, value, magnitude}) => {
    switch (dataType) {
    case 'fractionalYears': return format.date(format.fractionalYearsToDate(value))
    default: return format.numberToMagnitude({value, magnitude})
    }
}

export const PaletteLayer = compose(
    _PaletteLayer,
    connect(),
    withMapArea(),
    withRecipe(mapRecipeToProps),
    withCursorValue(),
    withSubscriptions()
)

PaletteLayer.propTypes = {}
