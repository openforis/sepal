import {Button} from '~/widget/button'
import {EditLegendPanel} from './editLegendPanel'
import {Layout} from '~/widget/layout'
import {LegendItem} from './legendItem'
import {ListItem} from '~/widget/listItem'
import {NoData} from '~/widget/noData'
import {Widget} from '~/widget/widget'
import {compose} from '~/compose'
import {msg} from '~/translate'
import {selectFrom} from '~/stateUtils'
import {withActivators} from '~/widget/activation/activator'
import {withRecipe} from '~/app/home/body/process/recipeContext'
import PropTypes from 'prop-types'
import React from 'react'

const mapRecipeToProps = (recipe, {componentId}) => ({
    updatedEntries: selectFrom(recipe, toUpdatedEntryPath(componentId))
})

class _Legend extends React.Component {
    render() {
        const {label, entries, disabled, errorMessage} = this.props
        return (
            <Widget
                label={label}
                disabled={disabled}
                errorMessage={errorMessage}
                labelButtons={this.renderLabelButtons()}>
                <EditLegendPanel/>
                {entries && entries.length ? this.renderEntries() : this.renderNoEntries()}
            </Widget>
        )
    }

    renderLabelButtons() {
        const {entries, recipe, band, activator: {activatables}, componentId, onUpdate} = this.props

        const editLegend = () => {
            activatables.editLegendPanel.activate({recipe, band, entries, statePath: toUpdatedEntryPath(componentId)})
        }

        return onUpdate
            ? [
                <Button
                    key="edit"
                    icon="edit"
                    tooltip={msg('widget.legend.edit.tooltip')}
                    chromeless
                    shape="circle"
                    size="small"
                    onClick={editLegend}
                />
            ]
            : null
    }

    renderNoEntries() {
        return (
            <NoData message={msg('widget.legend.noEntries')}/>
        )
    }

    renderEntries() {
        const {entries} = this.props
        return (
            <Layout type='vertical' spacing='tight'>
                {entries.map(entry => this.renderEntry(entry))}
            </Layout>
        )
    }

    renderEntry({color, value, label}) {
        const {selected = [], onSelectionChange} = this.props
        const onClick = onSelectionChange ? () => this.select(value) : null
        return (
            <ListItem
                key={value}
                onClick={onClick}>
                <LegendItem
                    color={color}
                    value={value}
                    label={label}
                    selected={selected.includes(value)}
                    onClick={onClick}
                />
            </ListItem>
        )
    }

    select(value) {
        const {selected, onSelectionChange} = this.props
        if (onSelectionChange) {
            const filtered = selected.filter(v => v !== value)
            if (selected.length === filtered.length) {
                onSelectionChange([...selected, value])
            } else {
                onSelectionChange([...filtered])
            }
        }
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
    withActivators('editLegendPanel')
)

Legend.propTypes = {
    entries: PropTypes.array.isRequired,
    activator: PropTypes.any,
    band: PropTypes.any,
    disabled: PropTypes.any,
    errorMessage: PropTypes.any,
    label: PropTypes.any,
    recipe: PropTypes.any,
    selected: PropTypes.array,
    onSelectionChange: PropTypes.func,
    onUpdate: PropTypes.func
}
