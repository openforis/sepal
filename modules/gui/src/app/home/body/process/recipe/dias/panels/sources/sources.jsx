import React from 'react'

import {isPlanetDailySchema} from '#sepal/recipe/planet/planetBands'
import {dataSetPeriod} from '#sepal/recipe/type/dias'
import {RecipeFormPanel, recipeFormPanel} from '~/app/home/body/process/recipeFormPanel'
import {compose} from '~/compose'
import {dataSetOptions, toDataSetIds, toSources} from '~/sources'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {Form} from '~/widget/form'
import {Layout} from '~/widget/layout'
import {Panel} from '~/widget/panel/panel'

import styles from './sources.module.css'

// DIAS reads Planet as a collection of daily scenes from an asset (lib/js/ee/src/dias/diCollection.js).
const PLANET = 'DAILY'

const fields = {
    dataSets: new Form.Field()
        .notEmpty('process.dias.panel.sources.form.dataSets.required'),
    planetAsset: new Form.Field()
        .skip((value, {dataSets}) => !hasPlanet(dataSets))
        .notBlank('process.dias.panel.sources.form.planetAsset.required'),
    // Whether the chosen collection holds daily scenes: true or false once its metadata is read, blank while it is.
    planetAssetDaily: new Form.Field()
        .skip((value, {dataSets}) => !hasPlanet(dataSets))
        .predicate(value => value === true, 'process.dias.panel.sources.form.planetAsset.notDaily')
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
                        {this.renderDataSets()}
                        {this.renderPlanetAsset()}
                    </Layout>
                </Panel.Content>
                <Form.PanelButtons/>
            </RecipeFormPanel>
        )
    }

    componentDidUpdate(prevProps) {
        const {inputs: {dataSets, planetAsset, planetAssetDaily}} = this.props
        // Removing Planet drops its collection, as Sources drop a Planet asset when Planet is left in other recipes.
        if (hasPlanet(prevProps.inputs.dataSets.value) && !hasPlanet(dataSets.value)) {
            planetAsset.set(null)
            planetAssetDaily.set('')
        }
    }

    renderDataSets() {
        const {form, inputs: {dataSets}} = this.props
        return (
            <Form.Buttons
                label={msg('process.dias.panel.sources.form.dataSets.label')}
                input={dataSets}
                options={this.dataSetOptions()}
                multiple
                errorMessage={form.getErrorMessage(dataSets)}
            />
        )
    }

    renderPlanetAsset() {
        const {inputs: {dataSets, planetAsset, planetAssetDaily}} = this.props
        return hasPlanet(dataSets.value)
            ? (
                <Form.AssetCombo
                    label={msg('process.dias.panel.sources.form.planetAsset.label')}
                    tooltip={msg('process.dias.panel.sources.form.planetAsset.tooltip')}
                    placeholder={msg('process.dias.panel.sources.form.planetAsset.placeholder')}
                    input={planetAsset}
                    allowedTypes={['ImageCollection']}
                    errorMessage={planetAssetDaily.value === false ? planetAssetDaily : planetAsset}
                    onLoading={() => planetAssetDaily.set('')}
                    onLoaded={loaded => planetAssetDaily.set(isPlanetDailySchema(loaded?.metadata?.bandNames))}
                />
            )
            : null
    }

    dataSetOptions() {
        const {dates, inputs: {dataSets}} = this.props
        const period = dataSetPeriod({dates})
        const chosen = dataSets.value
        return [
            ...dataSetOptions({type: 'OPTICAL', period, chosen}),
            ...dataSetOptions({type: 'RADAR', period, chosen}),
            ...dataSetOptions({type: 'PLANET', period, chosen})
                .filter(({value}) => value === PLANET)
                .map(option => ({
                    ...option,
                    label: msg('process.dias.panel.sources.form.dataSets.PLANET.label'),
                    tooltip: msg('process.dias.panel.sources.form.dataSets.PLANET.tooltip')
                }))
        ]
    }
}

const hasPlanet = dataSets => (dataSets || []).includes(PLANET)

const valuesToModel = ({dataSets, planetAsset}) => ({
    dataSets: toSources(dataSets || []),
    assets: hasPlanet(dataSets) && planetAsset ? [planetAsset] : []
})

// A saved collection was found daily when it was applied.
const modelToValues = ({dataSets, assets = []}) => ({
    dataSets: toDataSetIds(dataSets),
    planetAsset: assets[0] || null,
    planetAssetDaily: assets[0] ? true : ''
})

export const Sources = compose(
    _Sources,
    recipeFormPanel({id: 'sources', fields, mapRecipeToProps, modelToValues, valuesToModel})
)

Sources.propTypes = {}
