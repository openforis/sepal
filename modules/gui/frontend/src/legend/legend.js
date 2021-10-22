import * as PropTypes from 'prop-types'
import {Button} from 'widget/button'
import {EditLegendPanel} from './editLegendPanel'
import {Layout} from 'widget/layout'
import {Widget} from 'widget/widget'
import {activator} from 'widget/activation/activator'
import {compose} from 'compose'
import {msg} from 'translate'
import {selectFrom} from 'stateUtils'
import {withRecipe} from 'app/home/body/process/recipeContext'
import React from 'react'
import styles from './legend.module.css'

const mapRecipeToProps = (recipe, {componentId}) => ({
    updatedEntries: selectFrom(recipe, toUpdatedEntryPath(componentId))
})

class _Legend extends React.Component {
    render() {
        const {label, entries, disabled, recipe, band, activator: {activatables}, componentId, onUpdate} = this.props
        const renderOption = ({color, value, label}) => {
            return (
                <div key={value} className={styles.entry}>
                    <div className={styles.color} style={{'--color': color}}/>
                    <div className={styles.value}>{value}</div>
                    <div className={styles.label}>{label}</div>
                </div>
            )
        }

        const editLegend = () => {
            activatables.editLegendPanel.activate({recipe, band, entries, statePath: toUpdatedEntryPath(componentId)})
        }

        const labelButtons = onUpdate
            ? [<Button
                key="edit"
                icon="edit"
                tooltip={msg('widget.legend.edit.tooltip')}
                chromeless
                shape="circle"
                size="small"
                onClick={editLegend}
            />]
            : []
        return (
            <Widget label={label} disabled={disabled} labelButtons={labelButtons}>
                <EditLegendPanel/>
                {entries && entries.length
                    ? (
                        <Layout type="vertical" spacing="compact" className={styles.entries}>
                            {entries.map(renderOption)}
                        </Layout>
                    )
                    : (
                        <div className={styles.noData}>
                            {msg('widget.legend.noEntries')}
                        </div>
                    )
                }
            </Widget>
        )
    }

    componentDidUpdate() {
        const {componentId, recipeActionBuilder, updatedEntries, onUpdate} = this.props
        if (updatedEntries) {
            recipeActionBuilder('CLEAR_UPDATED_ENTRIES', {updatedEntries})
                .del(toUpdatedEntryPath(componentId))
                .dispatch()
            onUpdate && onUpdate(updatedEntries)
        }
    }
}

_Legend.defaultProps = {entries: []}

const toUpdatedEntryPath = componentId => ['ui', 'widget.Legend', componentId, 'updatedEntries']

export const Legend = compose(
    _Legend,
    withRecipe(mapRecipeToProps),
    activator('editLegendPanel')
)

Legend.propTypes = {
    entries: PropTypes.array.isRequired,
    activator: PropTypes.any,
    band: PropTypes.any,
    disabled: PropTypes.any,
    label: PropTypes.any,
    recipe: PropTypes.any,
    onUpdate: PropTypes.func
}
