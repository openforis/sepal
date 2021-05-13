import {ElementResizeDetector} from '../../../widget/elementResizeDetector'
import {compose} from 'compose'
import {connect} from 'store'
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
        const cursorValues = value.map(v =>
            <CursorValue
                key={v}
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

const CursorValue = ({value, min, max, paletteWidth}) => {
    const factor = (value - min) / (max - min)
    const left = paletteWidth * factor
    const prefix = value <= min
        ? <>&#8805; </>
        : value >= max
            ? <>&#8804; </>
            : ''
    const formatted = format.number({value, precisionDigits: 3})
    return (
        <div
            className={styles.cursorValue}
            style={{'--left': `${left}px`}}>
            {prefix}
            {formatted}
            <div className={styles.arrow}/>
        </div>
    )
}

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
