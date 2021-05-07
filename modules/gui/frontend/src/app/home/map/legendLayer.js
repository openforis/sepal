import {compose} from 'compose'
import {connect} from 'store'
import {selectFrom} from 'stateUtils'
import {withMapAreaContext} from './mapAreaContext'
import {withRecipe} from 'app/home/body/process/recipeContext'
import React from 'react'
import format from 'format'
import styles from './legendLayer.module.css'

const mapRecipeToProps = recipe => ({
    areas: selectFrom(recipe, 'layers.areas') || {}
})

class _LegendLayer extends React.Component {
    render() {
        const {mapAreaContext: {area}, areas} = this.props
        const {min, max, palette} = selectFrom(areas[area], 'imageLayer.layerConfig.visParams') || {}
        return this.renderLegend({min: min[0], max: max[0], palette})
    }

    renderLegend({min, max, palette}) {
        return (
            <div className={styles.container}>
                <div className={styles.legend}>
                    <Value value={min}/>
                    <div className={styles.palette} style={{'--palette': palette}}/>
                    <Value value={max}/>
                </div>
            </div>
        )
    }
}

const Value = ({value}) =>
    <div className={styles.value}>
        {format.number({value, precisionDigits: 3})}
    </div>

export const LegendLayer = compose(
    _LegendLayer,
    connect(),
    withMapAreaContext(),
    withRecipe(mapRecipeToProps)
)

LegendLayer.propTypes = {}
