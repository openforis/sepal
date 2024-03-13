import {CrudItem} from '~/widget/crudItem'
import {Layout} from '~/widget/layout'
import {Shape} from '~/widget/shape'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {selectFrom} from '~/stateUtils'
import {withCursorValue} from './cursorValue'
import {withMapArea} from './mapAreaContext'
import {withRecipe} from '~/app/home/body/process/recipeContext'
import {withSubscriptions} from '~/subscription'
import React from 'react'
import format from '~/format'
import styles from './valuesLayer.module.css'

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
        const {cursorValue$, mapArea: {area}, areas} = this.props
        if (!cursorValue$) {
            return null
        }
        const {value} = this.state
        const {bands, min, max} = selectFrom(areas[area], 'imageLayer.layerConfig.visParams') || {}
        return bands ?
            (
                <div className={styles.container}>
                    <Layout
                        type='horizontal-nowrap'
                        spacing='tight'>
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
        const magnitude = format.stepMagnitude({min, max, minSteps: MIN_STEPS})
        const formatted = format.numberToMagnitude({
            value: clampedValue,
            magnitude,
            defaultValue: 'N/A'
        })
        const padding = (magnitude < 0
            ? -magnitude + 1
            : magnitude
        ) + 7
        const description = `${clampingIndicator} ${formatted}`.padStart(padding)
        return (
            <Shape key={key} shape='pill' size='small'>
                <CrudItem title={band}>
                    <pre className={[styles.value, clamping ? styles.clamping : null].join(' ')}>
                        {description}
                    </pre>
                </CrudItem>
            </Shape>
        )
    }
}

export const ValuesLayer = compose(
    _ValuesLayer,
    connect(),
    withMapArea(),
    withRecipe(mapRecipeToProps),
    withCursorValue(),
    withSubscriptions()
)

ValuesLayer.propTypes = {}
