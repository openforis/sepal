import * as PropTypes from 'prop-types'
import {ElementResizeDetector} from 'widget/elementResizeDetector'
import {Scrollable, ScrollableContainer} from '../../../widget/scrollable'
import {Subject, animationFrameScheduler, interval, of} from 'rxjs'
import {compose} from 'compose'
import {connect} from 'store'
import {distinctUntilChanged, map, scan, switchMap} from 'rxjs/operators'
import {isMobile} from '../../../widget/userAgent'
import {selectFrom} from 'stateUtils'
import {withCursorValue} from './cursorValue'
import {withMapAreaContext} from './mapAreaContext'
import {withRecipe} from 'app/home/body/process/recipeContext'
import React from 'react'
import Tooltip from '../../../widget/tooltip'
import _ from 'lodash'
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
        const {labels, values, palette} = selectFrom(areas[area], 'imageLayer.layerConfig.visParams') || {}
        if (!values || !palette) {
            return null
        }
        const {value, paletteWidth} = this.state
        const cursorValues = value
            ? value.map((v, i) =>
                <CursorValue
                    key={i}
                    value={v}
                    values={values}
                    labels={labels}
                    paletteWidth={paletteWidth}
                />
            )
            : null
        const colors = palette.map(color =>
            <div
                key={color}
                style={{'--color': color}}
                className={styles.color}
            />
        )
        return (
            <div className={styles.container}>
                <Tooltip
                    msg={this.renderFullLegend()}
                    placement='top'
                    clickTrigger={isMobile()}>
                    <div className={styles.legend}>
                        {colors}
                        <ElementResizeDetector onResize={({width}) => this.setState({paletteWidth: width})}/>
                        {cursorValues}
                    </div>
                </Tooltip>
            </div>
        )
    }

    renderFullLegend() {
        const {mapAreaContext: {area}, areas} = this.props
        const {labels, values, palette} = selectFrom(areas[area], 'imageLayer.layerConfig.visParams') || {}
        return (
            <ScrollableContainer>
                <Scrollable direction='y'>
                    <div className={styles.fullLegend}>
                        {_.range(0, values.length).map(i =>
                            <React.Fragment key={values[i]}>
                                <div className={styles.fullLegendColor} style={{'--color': palette[i]}}/>
                                <div className={styles.fullLegendValue}>{values[i]}</div>
                                <div className={styles.fullLegendLabel}>{labels[i]}</div>
                            </React.Fragment>
                        )}
                    </div>
                </Scrollable>
            </ScrollableContainer>
        )
    }
}

class _CursorValue extends React.Component {
    state = {
        position: null
    }
    targetPosition$ = new Subject()

    render() {
        const {value, values, labels} = this.props
        const {position} = this.state
        const label = labels[values.findIndex(v => v === value)]
        return (
            <div
                className={styles.cursorValue}
                style={{'--left': `${position}px`}}>
                <div className={styles.label}>{label}</div>
                <div className={styles.value}>({value})</div>
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
        const {value, values, paletteWidth} = this.props
        const {position} = this.state
        const i = values.findIndex(v => v === value)
        const valueWidth = paletteWidth / values.length
        const nextPosition = Math.round(valueWidth * i + valueWidth / 2)
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
    labels: PropTypes.any,
    paletteWidth: PropTypes.any,
    value: PropTypes.any,
    values: PropTypes.any,
}

const lerp = (rate, speed = 1) => (value, target) => value + (target - value) * (rate * speed)

export const LegendLayer = compose(
    _LegendLayer,
    connect(),
    withMapAreaContext(),
    withRecipe(mapRecipeToProps),
    withCursorValue(),
    withSubscriptions()
)

LegendLayer.propTypes = {}
