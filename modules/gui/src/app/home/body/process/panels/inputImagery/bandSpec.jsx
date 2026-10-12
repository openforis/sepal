import PropTypes from 'prop-types'
import React from 'react'

import {msg} from '~/translate'
import {Buttons} from '~/widget/buttons'
import {CrudItem} from '~/widget/crudItem'
import {Legend} from '~/widget/legend/legend'
import {ListItem} from '~/widget/listItem'
import {Tooltip} from '~/widget/tooltip'

import styles from './bandSpec.module.css'

// One selected band, named in its header beside the choice of its type. A categorical band's legend is its body, which
// can be collapsed; a continuous band has none.
export class BandSpec extends React.Component {
    render() {
        const {spec: {id, type}, expanded, missing, disabled, onToggle, onRemove} = this.props
        const categorical = type === 'categorical'
        return (
            <ListItem
                error={!!missing}
                expansion={categorical ? this.renderLegend() : null}
                expanded={categorical && expanded}
                disabled={disabled}
                onClick={categorical ? () => onToggle(id) : undefined}>
                <CrudItem
                    content={this.renderHeader()}
                    unsafeRemove
                    onRemove={() => onRemove(id)}
                />
            </ListItem>
        )
    }

    // Its name, saying why where its source lacks it and otherwise naming it in full, however short it is cut.
    renderHeader() {
        const {spec: {band}, missing} = this.props
        return (
            <div className={styles.header}>
                <Tooltip msg={missing ? this.missingMessage() : band}>
                    <div className={styles.name}>{band}</div>
                </Tooltip>
                {this.renderTypeSelector()}
            </div>
        )
    }

    // Its buttons keep their clicks from the row, which a type choice neither expands nor collapses.
    renderTypeSelector() {
        const {spec: {type}, disabled, onTypeChange} = this.props
        return (
            <Buttons
                className={styles.type}
                size='x-small'
                shape='pill'
                spacing='none'
                groupSpacing='none'
                selected={type}
                disabled={disabled}
                options={[
                    {value: 'continuous', label: msg('process.panels.inputImagery.form.type.continuous')},
                    {value: 'categorical', label: msg('process.panels.inputImagery.form.type.categorical')}
                ]}
                onChange={type => onTypeChange(type)}
            />
        )
    }

    renderLegend() {
        const {recipe, spec, onUpdate} = this.props
        return (
            <Legend
                label={msg('process.panels.inputImagery.form.legend.label')}
                band={spec.band}
                entries={spec.legendEntries || []}
                recipe={recipe}
                onUpdate={legendEntries => onUpdate({...spec, legendEntries})}
            />
        )
    }

    missingMessage() {
        const {spec: {band}} = this.props
        return msg('process.panels.inputImagery.form.missingBands', {bands: band})
    }
}

BandSpec.propTypes = {
    spec: PropTypes.object.isRequired,
    onRemove: PropTypes.func.isRequired,
    onToggle: PropTypes.func.isRequired,
    onTypeChange: PropTypes.func.isRequired,
    onUpdate: PropTypes.func.isRequired,
    disabled: PropTypes.any,
    // A categorical band's legend is shown.
    expanded: PropTypes.any,
    // Its source is known not to have this band.
    missing: PropTypes.bool,
    recipe: PropTypes.object
}
