import PropTypes from 'prop-types'
import React from 'react'

import {msg} from '~/translate'
import {Buttons} from '~/widget/buttons'
import {Combo} from '~/widget/combo'
import {CrudItem} from '~/widget/crudItem'
import {Layout} from '~/widget/layout'
import {Legend} from '~/widget/legend/legend'
import {ListItem} from '~/widget/listItem'

import {defaultBand, defaultLegendEntries} from './bands'
import styles from './bandSpec.module.css'

export class BandSpec extends React.Component {
    render() {
        const {selected, spec: {id, name, type}, disabled, onClick, onRemove} = this.props
        return (
            <ListItem
                expansion={this.renderExpansion()}
                expanded={selected}
                disabled={disabled}
                onClick={() => onClick(id)}>
                <CrudItem
                    title={msg(['process.panels.inputImagery.form.type', type])}
                    description={name}
                    unsafeRemove
                    onRemove={() => onRemove(id)}
                />
            </ListItem>
        )
    }

    renderTitle() {
        const {spec: {name, type}} = this.props
        return (
            <div>
                {name} {type}
            </div>
        )
    }

    renderExpansion() {
        const {spec: {type}} = this.props
        return (
            <Layout>
                <Layout type={'horizontal'}>
                    {this.renderBandSelector()}
                    {this.renderTypeSelector()}
                </Layout>
                {type === 'categorical'
                    ? this.renderLegend()
                    : null}
            </Layout>
        )
    }

    renderBandSelector() {
        const {bands, spec: {name}} = this.props
        const bandOptions = (Object.keys(bands) || [])
            .map(bandName => ({
                value: bandName,
                label: bandName
            }))
        return (
            <Combo
                label={msg('process.panels.inputImagery.form.band.label')}
                value={name}
                options={bandOptions}
                className={styles.bandSelector}
                onChange={({value}) => this.updateBand(value)}
            />
        )
    }

    renderTypeSelector() {
        const {spec: {type}} = this.props
        const typeOptions = [
            {value: 'categorical', label: msg('process.panels.inputImagery.form.type.categorical')},
            {value: 'continuous', label: msg('process.panels.inputImagery.form.type.continuous')}
        ]
        return (
            <Buttons
                label={msg('process.panels.inputImagery.form.type.label')}
                selected={type}
                options={typeOptions}
                onChange={type => this.updateType(type)}
            />
        )
    }

    renderLegend() {
        const {recipe, spec: {name, legendEntries}} = this.props
        return (
            <Legend
                label={msg('process.panels.inputImagery.form.legend.label')}
                band={name}
                entries={legendEntries || []}
                recipe={recipe}
                onUpdate={legendEntries => this.updateSpec({legendEntries})}
            />
        )
    }

    updateBand(name) {
        const {spec, bands} = this.props
        if (spec.name !== name) {
            const updatedSpec = {...defaultBand(name, bands), id: spec.id}
            this.updateSpec(updatedSpec)
        }
    }

    updateType(type) {
        const {spec, bands} = this.props
        if (spec.type !== type) {
            const legendEntries = type === 'categorical'
                ? defaultLegendEntries(spec.name, bands)
                : []
            this.updateSpec({type, legendEntries})
        }
    }

    updateSpec(update) {
        const {spec, onUpdate} = this.props
        onUpdate({...spec, ...update})
    }
}

BandSpec.propTypes = {
    bands: PropTypes.object.isRequired,
    spec: PropTypes.object.isRequired,
    onClick: PropTypes.func.isRequired,
    onRemove: PropTypes.func.isRequired,
    onUpdate: PropTypes.func.isRequired,
    recipe: PropTypes.object,
    selected: PropTypes.any,
}
