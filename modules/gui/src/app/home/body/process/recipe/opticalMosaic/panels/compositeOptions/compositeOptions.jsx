import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'

import {RecipeFormPanel, recipeFormPanel} from '~/app/home/body/process/recipeFormPanel'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {Button} from '~/widget/button'
import {Buttons} from '~/widget/buttons'
import {ButtonSelect} from '~/widget/buttonSelect'
import {CrudItem} from '~/widget/crudItem'
import {Form} from '~/widget/form'
import {Layout} from '~/widget/layout'
import {ListItem} from '~/widget/listItem'
import {NoData} from '~/widget/noData'
import {Panel} from '~/widget/panel/panel'
import {Widget} from '~/widget/widget'

import styles from './compositeOptions.module.css'

const fields = {
    advanced: new Form.Field(),
    corrections: new Form.Field(),
    brdfMultiplier: new Form.Field()
        .skip((value, {corrections}) => corrections)
        .notBlank()
        .greaterThan(0),
    includedFilters: new Form.Field(),
    shadowPercentile: new Form.Field(),
    hazePercentile: new Form.Field(),
    ndviPercentile: new Form.Field(),
    dayOfYearPercentile: new Form.Field(),

    includedCloudMasking: new Form.Field(),
    sentinel2CloudProbabilityMaxCloudProbability: new Form.Field(),
    sentinel2CloudScorePlusBand: new Form.Field(),
    sentinel2CloudScorePlusMaxCloudProbability: new Form.Field(),
    landsatCFMaskCloudMasking: new Form.Field(),
    landsatCFMaskCloudShadowMasking: new Form.Field(),
    landsatCFMaskCirrusMasking: new Form.Field(),
    landsatCFMaskDilatedCloud: new Form.Field(),
    sepalCloudScoreMaxCloudProbability: new Form.Field(),

    cloudBuffer: new Form.Field(),
    snowMasking: new Form.Field(),
    holes: new Form.Field(),
    orbitOverlap: new Form.Field(),
    tileOverlap: new Form.Field(),
    compose: new Form.Field()
}

const filterInputNameByType = {
    SHADOW: 'shadowPercentile',
    HAZE: 'hazePercentile',
    NDVI: 'ndviPercentile',
    DAY_OF_YEAR: 'dayOfYearPercentile',
}

const mapRecipeToProps = recipe => ({
    sources: selectFrom(recipe, 'model.sources')
})

class _CompositeOptions extends React.Component {
    constructor(props) {
        super(props)
        this.addFilter = this.addFilter.bind(this)
        this.addCloudMasking = this.addCloudMasking.bind(this)
    }

    render() {
        const {title, inputs: {advanced}} = this.props
        return (
            <RecipeFormPanel
                className={styles.panel}
                placement='bottom-right'>
                <Panel.Header
                    icon='layer-group'
                    title={title}/>
                <Panel.Content>
                    {advanced.value ? this.renderAdvanced() : this.renderSimple()}
                </Panel.Content>
                <Form.PanelButtons>
                    <Button
                        label={advanced.value ? msg('button.less') : msg('button.more')}
                        onClick={() => this.setAdvanced(!advanced.value)}/>
                </Form.PanelButtons>
            </RecipeFormPanel>
        )
    }

    renderSimple() {
        const {forCollection} = this.props
        return (
            <Layout type='vertical'>
                {this.renderCorrection()}
                {this.renderCloudMaskingPresets()}
                {!forCollection ? this.renderCompose() : null}
            </Layout>
        )
    }

    renderAdvanced() {
        const {forCollection, sources, inputs: {corrections}} = this.props
        const sentinel2 = Object.keys(sources.dataSets).includes('SENTINEL_2')
        const brdf = corrections.value.includes('BRDF')
        return (
            <Layout type='vertical'>
                <Layout type='horizontal'>
                    {this.renderCorrection()}
                    {brdf ? this.renderBrdfMultiplier() : null}
                </Layout>
                {sentinel2 ? this.renderOrbitOverlap() : null}
                {sentinel2 ? this.renderTileOverlap() : null}
                {this.renderCloudMasking()}
                {!forCollection ? this.renderCloudBuffer() : null}
                <Layout type='horizontal' alignment='distribute'>
                    {this.renderSnowMasking()}
                    {!forCollection ? this.renderHoles() : null}
                </Layout>
                {!forCollection ? this.renderFilters() : null}
                {!forCollection ? this.renderCompose() : null}
            </Layout>
        )
    }

    renderCorrection() {
        const {inputs: {corrections}, sources} = this.props
        return (
            <Form.Buttons
                label={msg('process.mosaic.panel.composite.form.corrections.label')}
                input={corrections}
                multiple={true}
                options={[{
                    value: 'SR',
                    label: msg('process.mosaic.panel.composite.form.corrections.surfaceReflectance.label'),
                    tooltip: msg('process.mosaic.panel.composite.form.corrections.surfaceReflectance.tooltip')
                }, {
                    value: 'BRDF',
                    label: msg('process.mosaic.panel.composite.form.corrections.brdf.label'),
                    tooltip: msg('process.mosaic.panel.composite.form.corrections.brdf.tooltip'),
                }, {
                    value: 'CALIBRATE',
                    label: msg('process.mosaic.panel.composite.form.corrections.calibrate.label'),
                    tooltip: msg('process.mosaic.panel.composite.form.corrections.calibrate.tooltip'),
                    neverSelected: _.flatten(Object.values(sources)).length < 2
                        || corrections.value.includes('SR')
                }]}
            />
        )
    }

    renderBrdfMultiplier() {
        const {inputs: {brdfMultiplier}} = this.props
        return (
            <Form.Input
                className={styles.brdfMultiplier}
                type='number'
                label={msg('process.mosaic.panel.composite.form.brdfMultiplier.label')}
                tooltip={msg('process.mosaic.panel.composite.form.brdfMultiplier.tooltip')}
                placeholder={msg('process.mosaic.panel.composite.form.brdfMultiplier.placeholder')}
                input={brdfMultiplier}
            />
        )
    }

    renderFilters() {
        const {inputs: {includedFilters, corrections}} = this.props
        const options = Object.keys(filterInputNameByType)
            .filter(type => type !== 'HAZE' || !corrections.value.includes('SR'))
            .filter(type => !includedFilters.value.includes(type))
            .map(type => ({
                value: type,
                label: msg(`process.mosaic.panel.composite.form.filters.${filterInputNameByType[type]}.label`)
            }))
            
        const addButton = (
            <ButtonSelect
                key='add'
                shape='circle'
                chromeless
                icon='plus'
                noChevron
                disabled={!options.length}
                hPlacement='over-left'
                options={options}
                onSelect={this.addFilter}
            />
        )
        return (
            <Widget
                label={msg('process.mosaic.panel.composite.form.filters.label')}
                tooltip={msg('process.mosaic.panel.composite.form.filters.tooltip')}
                labelButtons={[addButton]}>
                {includedFilters.value.length
                    ? this.renderFilterFields()
                    : <NoData message={msg('process.mosaic.panel.composite.form.filters.noData')} alignment='left'/>}
            </Widget>
        )
    }

    renderFilterFields() {
        const {inputs} = this.props
        return (
            <Layout spacing='compact'>
                {inputs.includedFilters.value.map(type =>
                    <PercentileField
                        key={type}
                        input={inputs[filterInputNameByType[type]]}
                        onRemove={() => this.removeFilter(type)}
                    />
                )}
            </Layout>
        )
    }

    addFilter({value: type}) {
        const {inputs} = this.props
        const includedFilters = inputs.includedFilters
        const filterInput = inputs[filterInputNameByType[type]]
        filterInput.set(50)
        includedFilters.set(includedFilters.value
            ? [...includedFilters.value, type]
            : [type]
        )
    }

    removeFilter(type) {
        const {inputs: {includedFilters}} = this.props
        includedFilters.set(
            includedFilters.value.filter(included => included !== type)
        )
    }

    renderCloudMaskingPresets() {
        const {inputs} = this.props

        const valuesByPreset = {
            MODERATE: {
                includedCloudMasking: ['sepalCloudScore', 'landsatCFMask', 'sentinel2CloudScorePlus'],
                sentinel2CloudScorePlusBand: 'cs_cdf',
                sentinel2CloudScorePlusMaxCloudProbability: 45,
                landsatCFMaskCloudMasking: 'MODERATE',
                landsatCFMaskCloudShadowMasking: 'MODERATE',
                landsatCFMaskCirrusMasking: 'MODERATE',
                sepalCloudScoreMaxCloudProbability: 30,
            },
            AGGRESSIVE: {
                includedCloudMasking: ['sepalCloudScore', 'landsatCFMask', 'sentinel2CloudScorePlus'],
                sentinel2CloudScorePlusBand: 'cs',
                sentinel2CloudScorePlusMaxCloudProbability: 35,
                landsatCFMaskCloudMasking: 'AGGRESSIVE',
                landsatCFMaskCloudShadowMasking: 'AGGRESSIVE',
                landsatCFMaskCirrusMasking: 'AGGRESSIVE',
                sepalCloudScoreMaxCloudProbability: 25,
            }
        }

        const preset = Object.keys(valuesByPreset).find(preset => {
            const values = valuesByPreset[preset]
            return Object.keys(values)
                .every(field => _.isEqual(values[field], inputs[field].value))
        })

        return (
            <Buttons
                label={msg('process.mosaic.panel.composite.form.cloudMasking.label')}
                selected={preset || 'CUSTOM'}
                options={[
                    {
                        value: 'MODERATE',
                        label: msg('process.mosaic.panel.composite.form.cloudMasking.moderate.label'),
                        tooltip: msg('process.mosaic.panel.composite.form.cloudMasking.moderate.tooltip')
                    },
                    {
                        value: 'AGGRESSIVE',
                        label: msg('process.mosaic.panel.composite.form.cloudMasking.aggressive.label'),
                        tooltip: msg('process.mosaic.panel.composite.form.cloudMasking.aggressive.tooltip')
                    },
                    {
                        value: 'CUSTOM',
                        disabled: true,
                        label: msg('process.mosaic.panel.composite.form.cloudMasking.custom.label')
                    }
                ]}
                onChange={preset => {
                    const values = valuesByPreset[preset]
                    return Object.keys(values)
                        .forEach(field => inputs[field].set(values[field]))
                }}
            />
        )
    }

    renderCloudMasking() {
        const {inputs: {includedCloudMasking}} = this.props
        const options = this.cloudMaskingOptions()
            .filter(option => !(includedCloudMasking.value || []).includes(option.value))
        const addButton = (
            <ButtonSelect
                key='add'
                shape='circle'
                chromeless
                icon='plus'
                noChevron
                disabled={!options.length}
                hPlacement='over-left'
                options={options}
                onSelect={this.addCloudMasking}
            />
        )
        const validTypes = this.cloudMaskingOptions().map(({value}) => value)
        const includedTypes = (includedCloudMasking.value || [])
            .filter(type => validTypes.includes(type))
        return (
            <Widget
                label={msg('process.mosaic.panel.composite.form.cloudMasking.label')}
                labelButtons={[addButton]}>
                {includedTypes.length
                    ? this.renderCloudMaskingFields(includedTypes)
                    : <NoData message={msg('process.mosaic.panel.composite.form.cloudMasking.noData')} alignment='left'/>}
            </Widget>
        )
    }

    renderCloudMaskingFields(types) {
        return (
            <Layout spacing='compact'>
                {types
                    .map(type => {
                        switch(type) {
                        case 'sentinel2CloudProbability': return this.renderSentinel2CloudProbability()
                        case 'sentinel2CloudScorePlus': return this.renderSentinel2CloudScorePlus()
                        case 'landsatCFMask': return this.renderLandsatCFMask()
                        case 'sepalCloudScore': return this.renderSepalCloudScore()
                        case 'pino26': return this.renderPino26()
                        }
                    })}
            </Layout>
        )
    }

    renderSentinel2CloudProbability() {
        const {inputs: {sentinel2CloudProbabilityMaxCloudProbability}} = this.props
        const type = 'sentinel2CloudProbability'
        const fields = (
            <Form.Slider
                input={sentinel2CloudProbabilityMaxCloudProbability}
                minValue={0}
                maxValue={100}
                ticks={[0, 10, 25, 50, 75, 90, 100]}
                range='low'
                info={percent => {
                    return msg(['process.mosaic.panel.composite.form.cloudMasking.sentinel2CloudProbability.maxCloudProbability.info'], {percent})
                }}
            />
        )
        return (
            <ListItem
                key={type}
                expansion={fields}
                expanded
                expansionInteractive>
                <CrudItem
                    descriptionClassName={styles.grow}
                    title={msg('process.mosaic.panel.composite.form.cloudMasking.sentinel2CloudProbability.label')}
                    unsafeRemove
                    onRemove={() => this.removeCloudMasking(type)}
                />
            </ListItem>
        )
    }

    renderSentinel2CloudScorePlus() {
        const {inputs: {sentinel2CloudScorePlusBand, sentinel2CloudScorePlusMaxCloudProbability}} = this.props
        const type = 'sentinel2CloudScorePlus'
        const fields = (
            <Layout>
                <Form.Slider
                    input={sentinel2CloudScorePlusMaxCloudProbability}
                    minValue={0}
                    maxValue={100}
                    ticks={[0, 10, 25, 50, 75, 90, 100]}
                    range='low'
                    info={percent => {
                        return msg(['process.mosaic.panel.composite.form.cloudMasking.sentinel2CloudScorePlus.maxCloudProbability.info'], {percent})
                    }}
                />
                <Form.Buttons
                    label={msg('process.mosaic.panel.composite.form.cloudMasking.sentinel2CloudScorePlus.band.label')}
                    input={sentinel2CloudScorePlusBand}
                    options={[
                        {value: 'cs', label: 'cs', tooltip: msg('process.mosaic.panel.composite.form.cloudMasking.sentinel2CloudScorePlus.band.cs.tooltip')},
                        {value: 'cs_cdf', label: 'cs_cdf', tooltip: msg('process.mosaic.panel.composite.form.cloudMasking.sentinel2CloudScorePlus.band.cs_cdf.tooltip')},
                    ]}
                />
            </Layout>
        )
        return (
            <ListItem
                key={type}
                expansion={fields}
                expanded
                expansionInteractive>
                <CrudItem
                    descriptionClassName={styles.grow}
                    title={msg('process.mosaic.panel.composite.form.cloudMasking.sentinel2CloudScorePlus.label')}
                    unsafeRemove
                    onRemove={() => this.removeCloudMasking(type)}
                    infoTooltip={msg('process.mosaic.panel.composite.form.cloudMasking.sentinel2CloudScorePlus.maxCloudProbability.tooltip')}
                    onInfo={() => undefined}
                />
            </ListItem>
        )
    }

    renderSepalCloudScore() {
        const {inputs: {sepalCloudScoreMaxCloudProbability}} = this.props
        const type = 'sepalCloudScore'
        const fields = (
            <Form.Slider
                input={sepalCloudScoreMaxCloudProbability}
                minValue={0}
                maxValue={100}
                ticks={[0, 10, 25, 50, 75, 90, 100]}
                range='low'
                info={percent => {
                    return msg(['process.mosaic.panel.composite.form.cloudMasking.sepalCloudScore.maxCloudProbability.info'], {percent})
                }}
            />
        )
        return (
            <ListItem
                key={type}
                expansion={fields}
                expanded
                expansionInteractive>
                <CrudItem
                    descriptionClassName={styles.grow}
                    title={msg('process.mosaic.panel.composite.form.cloudMasking.sepalCloudScore.label')}
                    unsafeRemove
                    onRemove={() => this.removeCloudMasking(type)}
                />
            </ListItem>
        )
    }

    renderLandsatCFMask() {
        const {inputs: {landsatCFMaskCloudMasking, landsatCFMaskCloudShadowMasking, landsatCFMaskCirrusMasking, landsatCFMaskDilatedCloud}} = this.props
        const type = 'landsatCFMask'

        const cloudMaskingOptions = [
            {value: 'OFF', label: msg('process.mosaic.panel.composite.form.cloudMasking.landsatCFMask.level.off')},
            {value: 'MODERATE', label: msg('process.mosaic.panel.composite.form.cloudMasking.landsatCFMask.level.moderate')},
            {value: 'AGGRESSIVE', label: msg('process.mosaic.panel.composite.form.cloudMasking.landsatCFMask.level.aggressive')},
        ]

        const fields = (
            <Layout spacing='compact'>
                <Form.Buttons
                    label={msg('process.mosaic.panel.composite.form.cloudMasking.landsatCFMask.cloudMasking.label')}
                    input={landsatCFMaskCloudMasking}
                    air='less'
                    options={cloudMaskingOptions}
                />
                <Form.Buttons
                    label={msg('process.mosaic.panel.composite.form.cloudMasking.landsatCFMask.cloudShadowMasking.label')}
                    input={landsatCFMaskCloudShadowMasking}
                    air='less'
                    options={cloudMaskingOptions}
                />
                <Form.Buttons
                    label={msg('process.mosaic.panel.composite.form.cloudMasking.landsatCFMask.cirrusMasking.label')}
                    input={landsatCFMaskCirrusMasking}
                    air='less'
                    options={cloudMaskingOptions}
                />
                <Form.Buttons
                    label={msg('process.mosaic.panel.composite.form.cloudMasking.landsatCFMask.dilatedCloud.label')}
                    input={landsatCFMaskDilatedCloud}
                    air='less'
                    options={[
                        {value: 'KEEP', label: msg('process.mosaic.panel.composite.form.cloudMasking.landsatCFMask.dilatedCloud.keep')},
                        {value: 'REMOVE', label: msg('process.mosaic.panel.composite.form.cloudMasking.landsatCFMask.dilatedCloud.remove')},
                    ]}
                />
            </Layout>
        )
        return (
            <ListItem
                key={type}
                expansion={fields}
                expanded
                expansionInteractive>
                <CrudItem
                    descriptionClassName={styles.grow}
                    title={msg('process.mosaic.panel.composite.form.cloudMasking.landsatCFMask.label')}
                    unsafeRemove
                    onRemove={() => this.removeCloudMasking(type)}
                />
            </ListItem>
        )
    }

    renderPino26() {
        const type = 'pino26'
        return (
            <ListItem
                key={type}>
                <CrudItem
                    descriptionClassName={styles.grow}
                    title={msg('process.mosaic.panel.composite.form.cloudMasking.pino26.label')}
                    unsafeRemove
                    onRemove={() => this.removeCloudMasking(type)}
                />
            </ListItem>
        )
    }

    cloudMaskingOptions() {
        const {sources, inputs: {corrections}} = this.props
        const pino26Disabled = corrections.value.includes('SR') || !_.isEqual(Object.keys(sources.dataSets), ['SENTINEL_2'])
        const sentinel2Disabled = !Object.keys(sources.dataSets).includes('SENTINEL_2')
        const landsatDisabled = !Object.keys(sources.dataSets).includes('LANDSAT')
        return [
            {value: 'sepalCloudScore', label: msg('process.mosaic.panel.composite.form.cloudMasking.sepalCloudScore.label')},
            sentinel2Disabled ? null : {value: 'sentinel2CloudScorePlus', label: msg('process.mosaic.panel.composite.form.cloudMasking.sentinel2CloudScorePlus.label')},
            sentinel2Disabled ? null : {value: 'sentinel2CloudProbability', label: msg('process.mosaic.panel.composite.form.cloudMasking.sentinel2CloudProbability.label')},
            landsatDisabled ? null : {value: 'landsatCFMask', label: msg('process.mosaic.panel.composite.form.cloudMasking.landsatCFMask.label')},
            pino26Disabled ? null : {value: 'pino26', label: msg('process.mosaic.panel.composite.form.cloudMasking.pino26.label')},
        ].filter(option => option)
            
    }

    addCloudMasking({value: type}) {
        const {inputs} = this.props
        const includedCloudMasking = inputs.includedCloudMasking
        includedCloudMasking.set(includedCloudMasking.value
            ? [...includedCloudMasking.value, type]
            : [type]
        )
    }

    removeCloudMasking(type) {
        const {inputs: {includedCloudMasking}} = this.props
        includedCloudMasking.set(
            includedCloudMasking.value.filter(included => included !== type)
        )
    }

    renderCloudBuffer() {
        const {inputs: {cloudBuffer}} = this.props
        return (
            <Form.Buttons
                label={msg('process.mosaic.panel.composite.form.cloudBuffer.label')}
                input={cloudBuffer}
                options={[{
                    value: 0,
                    label: msg('process.mosaic.panel.composite.form.cloudBuffer.none.label'),
                    tooltip: msg('process.mosaic.panel.composite.form.cloudBuffer.none.tooltip')
                }, {
                    value: 120,
                    label: msg('process.mosaic.panel.composite.form.cloudBuffer.moderate.label'),
                    tooltip: msg('process.mosaic.panel.composite.form.cloudBuffer.moderate.tooltip')
                }, {
                    value: 600,
                    label: msg('process.mosaic.panel.composite.form.cloudBuffer.aggressive.label'),
                    tooltip: msg('process.mosaic.panel.composite.form.cloudBuffer.aggressive.tooltip')
                }]}
                type='horizontal'
            />
        )
    }

    renderHoles() {
        const {inputs: {holes}} = this.props
        return (
            <Form.Buttons
                label={msg('process.mosaic.panel.composite.form.holes.label')}
                input={holes}
                options={[
                    {
                        value: 'PREVENT',
                        label: msg('process.mosaic.panel.composite.form.holes.prevent.label'),
                        tooltip: msg('process.mosaic.panel.composite.form.holes.prevent.tooltip')
                    },
                    {
                        value: 'ALLOW',
                        label: msg('process.mosaic.panel.composite.form.holes.allow.label'),
                        tooltip: msg('process.mosaic.panel.composite.form.holes.allow.tooltip')
                    }
                ]}
                type='horizontal-nowrap'
            />
        )
    }

    renderSnowMasking() {
        const {inputs: {snowMasking}} = this.props
        return (
            <Form.Buttons
                label={msg('process.mosaic.panel.composite.form.snowMasking.label')}
                input={snowMasking}
                options={[{
                    value: 'OFF',
                    label: msg('process.mosaic.panel.composite.form.snowMasking.off.label'),
                    tooltip: msg('process.mosaic.panel.composite.form.snowMasking.off.tooltip')
                }, {
                    value: 'ON',
                    label: msg('process.mosaic.panel.composite.form.snowMasking.on.label'),
                    tooltip: msg('process.mosaic.panel.composite.form.snowMasking.on.tooltip')
                }]}
                type='horizontal-nowrap'
            />
        )
    }

    renderOrbitOverlap() {
        const {inputs: {orbitOverlap}} = this.props
        return (
            <Form.Buttons
                label={msg('process.mosaic.panel.composite.form.orbitOverlap.label')}
                input={orbitOverlap}
                options={[{
                    value: 'KEEP',
                    label: msg('process.mosaic.panel.composite.form.orbitOverlap.keep.label'),
                    tooltip: msg('process.mosaic.panel.composite.form.orbitOverlap.keep.tooltip')
                }, {
                    value: 'REMOVE',
                    label: msg('process.mosaic.panel.composite.form.orbitOverlap.remove.label'),
                    tooltip: msg('process.mosaic.panel.composite.form.orbitOverlap.remove.tooltip')
                }]}
                type='horizontal-nowrap'
            />
        )
    }

    renderTileOverlap() {
        const {inputs: {tileOverlap}} = this.props
        return (
            <Form.Buttons
                label={msg('process.mosaic.panel.composite.form.tileOverlap.label')}
                input={tileOverlap}
                options={[{
                    value: 'KEEP',
                    label: msg('process.mosaic.panel.composite.form.tileOverlap.keep.label'),
                    tooltip: msg('process.mosaic.panel.composite.form.tileOverlap.keep.tooltip')
                }, {
                    value: 'QUICK_REMOVE',
                    label: msg('process.mosaic.panel.composite.form.tileOverlap.quickRemove.label'),
                    tooltip: msg('process.mosaic.panel.composite.form.tileOverlap.quickRemove.tooltip')
                }, {
                    value: 'REMOVE',
                    label: msg('process.mosaic.panel.composite.form.tileOverlap.remove.label'),
                    tooltip: msg('process.mosaic.panel.composite.form.tileOverlap.remove.tooltip')
                }]}
                type='horizontal-nowrap'
            />
        )
    }
    renderCompose() {
        const {inputs: {compose}} = this.props
        return (
            <Form.Buttons
                label={msg('process.mosaic.panel.composite.form.composingMethod.label')}
                input={compose}
                options={[{
                    value: 'MEDOID',
                    label: msg('process.mosaic.panel.composite.form.composingMethod.medoid.label'),
                    tooltip: msg('process.mosaic.panel.composite.form.composingMethod.medoid.tooltip')
                }, {
                    value: 'MEDIAN',
                    label: msg('process.mosaic.panel.composite.form.composingMethod.median.label'),
                    tooltip: msg('process.mosaic.panel.composite.form.composingMethod.median.tooltip')
                }]}
                type='horizontal-nowrap'
            />
        )
    }

    componentDidMount() {
        const {inputs: {orbitOverlap, tileOverlap, cloudBuffer}} = this.props
        if (cloudBuffer.value === undefined) {
            cloudBuffer.set(0)
        }
        if (!orbitOverlap.value) {
            orbitOverlap.set('KEEP')
        }
        if (!tileOverlap.value) {
            tileOverlap.set('KEEP')
        }
    }

    setAdvanced(enabled) {
        const {inputs: {advanced}} = this.props
        advanced.set(enabled)
    }
}

const PercentileField = ({input, disabled = false, onRemove}) => {
    const slider = (
        <Form.Slider
            input={input}
            minValue={0}
            maxValue={100}
            ticks={[0, 10, 25, 50, 75, 90, 100]}
            range='high'
            info={percentile => {
                const type = percentile === 0 ? 'off' : percentile === 100 ? 'max' : 'percentile'
                return msg(['process.mosaic.panel.composite.form.filters', input.name, type], {percentile})
            }}
            disabled={disabled}/>
    )
    return (
        (<ListItem
            expansion={slider}
            expanded
            expansionInteractive
        >
            <CrudItem
                descriptionClassName={styles.grow}
                title={msg(`process.mosaic.panel.composite.form.filters.${input.name}.label`)}
                range='high'
                unsafeRemove
                onRemove={onRemove}
            />
        </ListItem>)
    )
}

PercentileField.propTypes = {
    disabled: PropTypes.any,
    input: PropTypes.object
}

const valuesToModel = values => ({
    corrections: values.corrections,
    brdfMultiplier: values.brdfMultiplier,
    filters: values.includedFilters
        .map(type => ({type, percentile: values[filterInputNameByType[type]]}))
        .filter(({percentile}) => percentile),
    orbitOverlap: values.orbitOverlap,
    tileOverlap: values.tileOverlap,
    includedCloudMasking: values.includedCloudMasking,
    sentinel2CloudProbabilityMaxCloudProbability: values.sentinel2CloudProbabilityMaxCloudProbability,
    sentinel2CloudScorePlusBand: values.sentinel2CloudScorePlusBand,
    sentinel2CloudScorePlusMaxCloudProbability: values.sentinel2CloudScorePlusMaxCloudProbability,
    landsatCFMaskCloudMasking: values.landsatCFMaskCloudMasking,
    landsatCFMaskCloudShadowMasking: values.landsatCFMaskCloudShadowMasking,
    landsatCFMaskCirrusMasking: values.landsatCFMaskCirrusMasking,
    landsatCFMaskDilatedCloud: values.landsatCFMaskDilatedCloud,
    sepalCloudScoreMaxCloudProbability: values.sepalCloudScoreMaxCloudProbability,
    cloudBuffer: values.cloudBuffer,
    holes: values.holes,
    snowMasking: values.snowMasking,
    compose: values.compose,
})

const modelToValues = model => {
    const getPercentile = type => {
        const filter = (model.filters || []).find(filter => filter.type === type)
        return filter ? filter.percentile : 0
    }
    const includedFilters = (model.filters || []).map(({type}) => type)
    return ({
        corrections: model.corrections,
        brdfMultiplier: model.brdfMultiplier,
        includedFilters,
        shadowPercentile: getPercentile('SHADOW'),
        hazePercentile: getPercentile('HAZE'),
        ndviPercentile: getPercentile('NDVI'),
        dayOfYearPercentile: getPercentile('DAY_OF_YEAR'),
        orbitOverlap: model.orbitOverlap,
        tileOverlap: model.tileOverlap,
        includedCloudMasking: model.includedCloudMasking,
        sentinel2CloudProbabilityMaxCloudProbability: model.sentinel2CloudProbabilityMaxCloudProbability,
        sentinel2CloudScorePlusBand: model.sentinel2CloudScorePlusBand,
        sentinel2CloudScorePlusMaxCloudProbability: model.sentinel2CloudScorePlusMaxCloudProbability,
        landsatCFMaskCloudMasking: model.landsatCFMaskCloudMasking,
        landsatCFMaskCloudShadowMasking: model.landsatCFMaskCloudShadowMasking,
        landsatCFMaskCirrusMasking: model.landsatCFMaskCirrusMasking,
        landsatCFMaskDilatedCloud: model.landsatCFMaskDilatedCloud,
        sepalCloudScoreMaxCloudProbability: model.sepalCloudScoreMaxCloudProbability,

        cloudBuffer: model.cloudBuffer,
        holes: model.holes,
        snowMasking: model.snowMasking,
        compose: model.compose,
    })
}

export const createCompositeOptions = ({id, additionalPolicy}) =>
    compose(
        _CompositeOptions,
        recipeFormPanel({
            id,
            fields,
            mapRecipeToProps,
            modelToValues,
            valuesToModel,
            additionalPolicy
        })
    )
