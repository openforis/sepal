import React from 'react'

import {getDataSetOptions as opticalDataSetOptions} from '~/app/home/body/process/recipe/opticalMosaic/sources'
import {RecipeFormPanel, recipeFormPanel} from '~/app/home/body/process/recipeFormPanel'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {Form} from '~/widget/form'
import {Layout} from '~/widget/layout'
import {Panel} from '~/widget/panel/panel'

import styles from './sources.module.css'

const enabledOptions = () => [
    {value: true, label: msg('button.enabled')},
    {value: false, label: msg('button.disabled')}
]

const fields = {
    landsatEnabled: new Form.Field(),
    landsatDataSets: new Form.Field()
        .skip((v, {landsatEnabled}) => !landsatEnabled)
        .notEmpty('process.dias.panel.sources.form.landsat.dataSets.required'),
    sentinel2Enabled: new Form.Field(),
    sentinel1Enabled: new Form.Field(),
    sentinel1Orbits: new Form.Field()
        .skip((v, {sentinel1Enabled}) => !sentinel1Enabled)
        .notEmpty('process.dias.panel.sources.form.sentinel1.orbits.required'),
    planetEnabled: new Form.Field(),
    planetAsset: new Form.Field()
        .skip((v, {planetEnabled}) => !planetEnabled)
        .notBlank('process.dias.panel.sources.form.planet.asset.required')
}

const constraints = {
    atLeastOneSensor: new Form.Constraint(['landsatEnabled', 'sentinel2Enabled', 'sentinel1Enabled', 'planetEnabled'])
        .predicate(({landsatEnabled, sentinel2Enabled, sentinel1Enabled, planetEnabled}) =>
            landsatEnabled || sentinel2Enabled || sentinel1Enabled || planetEnabled,
        'process.dias.panel.sources.form.atLeastOneSensor')
}

const mapRecipeToProps = recipe => ({
    dates: selectFrom(recipe, 'model.dates')
})

class _Sources extends React.Component {
    render() {
        return (
            <RecipeFormPanel
                className={styles.panel}
                placement='bottom-right'>
                <Panel.Header
                    icon='cog'
                    title={msg('process.dias.panel.sources.title')}/>
                <Panel.Content>
                    <Layout>
                        {this.renderErrorMessage()}
                        {this.renderLandsat()}
                        {this.renderSentinel2()}
                        {this.renderSentinel1()}
                        {this.renderPlanet()}
                    </Layout>
                </Panel.Content>
                <Form.PanelButtons/>
            </RecipeFormPanel>
        )
    }

    renderErrorMessage() {
        const {landsatEnabled} = this.props.inputs
        return (
            <Form.FieldSet errorMessage={[landsatEnabled, 'atLeastOneSensor']}/>
        )
    }

    renderLandsat() {
        const {dates, inputs: {landsatEnabled, landsatDataSets}} = this.props
        return (
            <React.Fragment>
                <Form.Buttons
                    label={msg('process.dias.panel.sources.form.landsat.label')}
                    input={landsatEnabled}
                    options={enabledOptions()}
                />
                {landsatEnabled.value
                    ? (
                        <Form.Buttons
                            label={msg('process.dias.panel.sources.form.landsat.dataSets.label')}
                            input={landsatDataSets}
                            options={landsatDataSetOptions(dates)}
                            multiple
                        />
                    )
                    : null}
            </React.Fragment>
        )
    }

    renderSentinel2() {
        const {inputs: {sentinel2Enabled}} = this.props
        return (
            <Form.Buttons
                label={msg('process.dias.panel.sources.form.sentinel2.label')}
                input={sentinel2Enabled}
                options={enabledOptions()}
            />
        )
    }

    renderSentinel1() {
        const {inputs: {sentinel1Enabled, sentinel1Orbits}} = this.props
        return (
            <React.Fragment>
                <Form.Buttons
                    label={msg('process.dias.panel.sources.form.sentinel1.label')}
                    input={sentinel1Enabled}
                    options={enabledOptions()}
                />
                {sentinel1Enabled.value
                    ? (
                        <Form.Buttons
                            label={msg('process.dias.panel.sources.form.sentinel1.orbits.label')}
                            input={sentinel1Orbits}
                            options={[
                                {value: 'ASCENDING', label: msg('process.dias.panel.sources.form.sentinel1.orbits.ASCENDING')},
                                {value: 'DESCENDING', label: msg('process.dias.panel.sources.form.sentinel1.orbits.DESCENDING')}
                            ]}
                            multiple
                        />
                    )
                    : null}
            </React.Fragment>
        )
    }

    renderPlanet() {
        const {inputs: {planetEnabled, planetAsset}} = this.props
        return (
            <React.Fragment>
                <Form.Buttons
                    label={msg('process.dias.panel.sources.form.planet.label')}
                    input={planetEnabled}
                    options={enabledOptions()}
                />
                {planetEnabled.value
                    ? (
                        <Form.AssetCombo
                            input={planetAsset}
                            label={msg('process.dias.panel.sources.form.planet.asset.label')}
                            placeholder={msg('process.dias.panel.sources.form.planet.asset.placeholder')}
                            allowedTypes={['ImageCollection']}
                        />
                    )
                    : null}
            </React.Fragment>
        )
    }

    componentDidMount() {
        const {inputs: {landsatEnabled, sentinel2Enabled, sentinel1Enabled, planetEnabled}} = this.props
        if (typeof landsatEnabled.value !== 'boolean') landsatEnabled.set(true)
        if (typeof sentinel2Enabled.value !== 'boolean') sentinel2Enabled.set(true)
        if (typeof sentinel1Enabled.value !== 'boolean') sentinel1Enabled.set(false)
        if (typeof planetEnabled.value !== 'boolean') planetEnabled.set(false)
    }
}

const landsatDataSetOptions = dates =>
    opticalDataSetOptions(dates).filter(({value}) => value.startsWith('LANDSAT'))

const valuesToModel = ({
    landsatEnabled, landsatDataSets,
    sentinel2Enabled,
    sentinel1Enabled, sentinel1Orbits,
    planetEnabled, planetAsset
}) => ({
    landsat: {enabled: landsatEnabled, dataSets: landsatDataSets || []},
    sentinel2: {enabled: sentinel2Enabled},
    sentinel1: {enabled: sentinel1Enabled, orbits: sentinel1Orbits || []},
    planet: {enabled: planetEnabled, asset: planetAsset || null}
})

const modelToValues = ({landsat = {}, sentinel2 = {}, sentinel1 = {}, planet = {}}) => ({
    landsatEnabled: landsat.enabled,
    landsatDataSets: landsat.dataSets,
    sentinel2Enabled: sentinel2.enabled,
    sentinel1Enabled: sentinel1.enabled,
    sentinel1Orbits: sentinel1.orbits,
    planetEnabled: planet.enabled,
    planetAsset: planet.asset
})

export const Sources = compose(
    _Sources,
    recipeFormPanel({id: 'sources', fields, constraints, mapRecipeToProps, valuesToModel, modelToValues})
)

Sources.propTypes = {}
