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
        const {mapAreaContext: {area}, areas} = this.props
        const {value} = this.state
        const {bands, min, max} = selectFrom(areas[area], 'imageLayer.layerConfig.visParams') || {}
        return (
            <div className={styles.container}>
                {[0, 1, 2].map(i => this.renderBand({
                    key: i,
                    band: bands[i],
                    min: min[i],
                    max: max[i],
                    value: value && value[i]
                }))}
            </div>
        )
    }

    renderBand({key, band, min, max, value}) {
        const clampedValue = Math.min(max, Math.max(min, value))
        const prefix = clampedValue === min
            ? <>&#8804; </>
            : clampedValue === max
                ? <>&#8805; </>
                : ''
        const formatted = format.number({value: clampedValue, precisionDigits: 3})
        return (
            <div key={key} className={styles.band}>
                <div className={styles.name}>{band}</div>
                {_.isFinite(value)
                    ? (
                        <div className={styles.value}>
                            {prefix}
                            {formatted}
                        </div>
                    )
                    : (
                        <div className={styles.value}>
                            n/a
                        </div>
                    )
                }
            </div>
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
