import {Item} from 'widget/item'
import {Layout} from 'widget/layout'
import {Shape} from 'widget/shape'
import {compose} from 'compose'
import {connect} from 'store'
import {selectFrom} from 'stateUtils'
import {withCursorValue} from './cursorValue'
import {withMapAreaContext} from './mapAreaContext'
import {withRecipe} from 'app/home/body/process/recipeContext'
import React from 'react'
import _ from 'lodash'
import format from 'format'
import styles from './valuesLayer.module.css'
import withSubscriptions from 'subscription'

const mapRecipeToProps = recipe => ({
    areas: selectFrom(recipe, 'layers.areas') || {}
})

const MIN_STEPS = 40

class _ValuesLayer extends React.Component {
    state = {
        value: []
    }

    constructor(props) {
        super(props)
        const {cursorValue$, addSubscription} = props
        addSubscription(
            cursorValue$.subscribe(value => this.setState({value}))
        )
    }

    render() {
        const {cursorValue$, mapAreaContext: {area}, areas} = this.props
        if (!cursorValue$) {
            return null
        }
        const {value} = this.state
        const {bands, min, max} = selectFrom(areas[area], 'imageLayer.layerConfig.visParams') || {}
        return bands ?
            (
                <div className={styles.container}>
                    <Layout type='horizontal-nowrap' spacing='none' className={styles.bands}>
                        {[0, 1, 2].map(i => this.renderBand({
                            key: i,
                            band: bands[i],
                            min: min[i],
                            max: max[i],
                            value: value && value[i]
                        }))}
                    </Layout>
                </div>
            )
            : null
    }

    clamp({value, min, max}) {
        const clampedValue = Math.min(max, Math.max(min, value))
        if (clampedValue === min) {
            return {clampedValue, clamping: -1}
        }
        if (clampedValue === max) {
            return {clampedValue, clamping: 1}
        }
        return {clampedValue, clamping: 0}
    }

    clampingIndicator(clamping) {
        switch(clamping) {
        case -1:
            return '\u2264'
        case 1:
            return '\u2265'
        default:
            return ' '
        }
    }

    renderBand({key, band, min, max, value}) {
        const {clampedValue, clamping} = this.clamp({value, min, max})
        const clampingIndicator = this.clampingIndicator(clamping)
        const precisionDigits = Math.max(
            _.isNil(value)
                ? 3
                : format.significantDigits({value, min, max, minSteps: MIN_STEPS}),
            3
        )
        const description = format.number({
            value: _.isFinite(value) ? clampedValue : null,
            precisionDigits,
            padding: true,
            defaultValue: 'N/A'
        })
        return (
            <Shape key={key} shape='pill' size='small'>
                <Item title={band}>
                    <pre className={[styles.value, clamping ? styles.clamping : null].join(' ')}>
                        {clampingIndicator}
                        {description}
                    </pre>
                </Item>
            </Shape>
        )
    }
}

export const ValuesLayer = compose(
    _ValuesLayer,
    connect(),
    withMapAreaContext(),
    withRecipe(mapRecipeToProps),
    withCursorValue(),
    withSubscriptions()
)

ValuesLayer.propTypes = {}
