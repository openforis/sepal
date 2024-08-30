import PropTypes from 'prop-types'
import React from 'react'

import {defaultBand, defaultLegendEntries} from '~/app/home/body/process/recipe/remapping/remappingRecipe'
import {msg} from '~/translate'
import {Buttons} from '~/widget/buttons'
import {Combo} from '~/widget/combo'
import {CrudItem} from '~/widget/crudItem'
import {Layout} from '~/widget/layout'
import {Legend} from '~/widget/legend/legend'
import {ListItem} from '~/widget/listItem'

import styles from './bandSpec.module.css'

export class BandSpec extends React.Component {
    render() {
        const {selected, spec: {id, band, type}, disabled, onClick, onRemove} = this.props
        return (
            <ListItem
                expansion={this.renderExpansion()}
                expanded={selected}
                disabled={disabled}
                onClick={() => onClick(id)}>
                <CrudItem
                    title={msg(['process.remapping.panel.inputImagery.form.type', type])}
                    description={band}
                    unsafeRemove
                    onRemove={() => onRemove(id)}
                />
            </ListItem>
        )
    }

    renderTitle() {
        const {spec: {band, type}} = this.props
        return (
            <div>
                {band} {type}
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
        const {bands, spec: {band}} = this.props
        const bandOptions = (Object.keys(bands) || [])
            .map(bandName => ({
                value: bandName,
                label: bandName
            }))
        return (
            <Combo
                label={msg('process.remapping.panel.inputImagery.form.band.label')}
                value={band}
                options={bandOptions}
                className={styles.bandSelector}
                onChange={({value}) => this.updateBand(value)}
            />
        )
    }

    renderTypeSelector() {
        const {spec: {type}} = this.props
        const typeOptions = [
            {value: 'categorical', label: msg('process.remapping.panel.inputImagery.form.type.categorical')},
            {value: 'continuous', label: msg('process.remapping.panel.inputImagery.form.type.continuous')}
        ]
        return (
            <Buttons
                label={msg('process.remapping.panel.inputImagery.form.type.label')}
                selected={type}
                options={typeOptions}
                onChange={type => this.updateType(type)}
            />
        )
    }

    renderLegend() {
        const {recipe, spec: {band, legendEntries}} = this.props
        return (
            <Legend
                label={msg('process.remapping.panel.inputImagery.form.legend.label')}
                band={band}
                entries={legendEntries || []}
                recipe={recipe}
                onUpdate={legendEntries => this.updateSpec({legendEntries})}
            />
        )
    }

    updateBand(band) {
        const {spec, bands} = this.props
        if (spec.band !== band) {
            const updatedSpec = {...defaultBand(band, bands), id: spec.id}
            this.updateSpec(updatedSpec)
        }
    }

    updateType(type) {
        const {spec, bands} = this.props
        if (spec.type !== type) {
            const legendEntries = type === 'categorical'
                ? defaultLegendEntries(spec.band, bands)
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
