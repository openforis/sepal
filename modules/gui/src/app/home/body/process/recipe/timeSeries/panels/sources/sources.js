import _ from 'lodash'
import React from 'react'

import {getDataSetOptions as opticalDataSetOptions, isOpticalDataSet} from '~/app/home/body/process/recipe/opticalMosaic/sources'
import {getDataSetOptions as planetDataSetOptions} from '~/app/home/body/process/recipe/planetMosaic/sources'
import {getDataSetOptions as radarDataSetOptions, isRadarDataSet} from '~/app/home/body/process/recipe/radarMosaic/sources'
import {RecipeActions} from '~/app/home/body/process/recipe/timeSeries/timeSeriesRecipe'
import {recipeAccess} from '~/app/home/body/process/recipeAccess'
import {RecipeFormPanel, recipeFormPanel} from '~/app/home/body/process/recipeFormPanel'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {toSources} from '~/sources'
import {selectFrom} from '~/stateUtils'
import {select} from '~/store'
import {msg} from '~/translate'
import {Form} from '~/widget/form'
import {Layout} from '~/widget/layout'
import {Notifications} from '~/widget/notifications'
import {Panel} from '~/widget/panel/panel'

import styles from './sources.module.css'

const fields = {
    dataSetType: new Form.Field()
        .notEmpty(),
    dataSets: new Form.Field()
        .notEmpty(),
    asset: new Form.Field()
        .skip((v, {dataSets}) => !['BASEMAPS', 'DAILY'].includes(dataSets))
        .notBlank(),
    validAsset: new Form.Field()
        .skip((v, {dataSets}) => !['BASEMAPS', 'DAILY'].includes(dataSets))
        .notBlank(),
    classification: new Form.Field()
}

const mapStateToProps = () => {
    return {
        recipes: select('process.recipes')
    }
}

const mapRecipeToProps = recipe => ({
    dates: selectFrom(recipe, 'model.dates')
})

class _Sources extends React.Component {
    state = {}

    constructor(props) {
        super(props)
        this.recipeActions = RecipeActions(props.recipeId)
    }

    render() {
        return (
            <RecipeFormPanel
                className={styles.panel}
                placement='bottom-right'>
                <Panel.Header
                    icon='cog'
                    title={msg('process.timeSeries.panel.sources.title')}/>
                <Panel.Content>
                    <Layout>
                        {this.renderDataSetTypes()}
                        {this.renderDataSets()}
                        {this.renderAssetId()}
                        {this.renderClassification()}
                    </Layout>
                </Panel.Content>
                <Form.PanelButtons/>
            </RecipeFormPanel>
        )
    }

    renderDataSetTypes() {
        const {inputs: {dataSetType}} = this.props
        const options = [
            {value: 'OPTICAL', label: msg('process.ccdc.panel.sources.form.dataSetTypes.OPTICAL')},
            {value: 'RADAR', label: msg('process.ccdc.panel.sources.form.dataSetTypes.RADAR')},
            {value: 'PLANET', label: msg('process.ccdc.panel.sources.form.dataSetTypes.PLANET')},
        ]
        return (
            <Form.Buttons
                label={msg('process.ccdc.panel.sources.form.dataSetType.label')}
                input={dataSetType}
                options={options}
            />
        )
    }

    renderDataSets() {
        const {inputs: {dataSetType, dataSets}} = this.props
        if (!dataSetType.value) {
            return null
        }
        return (
            <Form.Buttons
                label={msg('process.ccdc.panel.sources.form.dataSets.label')}
                input={dataSets}
                options={this.dataSetOptions()}
                multiple={dataSetType.value === 'OPTICAL'}
            />
        )
    }

    renderClassification() {
        const {recipes, inputs: {classification}} = this.props
        const options = recipes
            .filter(({type}) => type === 'CLASSIFICATION')
            .map(recipe => ({
                value: recipe.id,
                label: recipe.name
            }))
        return (
            <Form.Combo
                label={msg('process.timeSeries.panel.sources.form.classification.label')}
                tooltip={msg('process.timeSeries.panel.sources.form.classification.tooltip')}
                placeholder={msg('process.timeSeries.panel.sources.form.classification.placeholder')}
                input={classification}
                options={options}
                busyMessage={this.props.stream('LOAD_CLASSIFICATION_RECIPE').active && msg('widget.loading')}
                onChange={selected => selected
                    ? this.loadClassification(selected.value)
                    : this.deselectClassification()}
                allowClear
            />
        )
    }

    renderAssetId() {
        const {inputs: {dataSets, asset, validAsset}} = this.props
        if (!['BASEMAPS', 'DAILY'].includes(dataSets.value)) {
            return null
        }
        return (
            <Form.AssetCombo
                input={asset}
                label={msg('process.planetMosaic.panel.sources.form.asset.label')}
                placeholder={msg('process.planetMosaic.panel.sources.form.asset.placeholder')}
                allowedTypes={['ImageCollection']}
                autoFocus
                onLoading={() => validAsset.set('')}
                onLoaded={() => validAsset.set('valid')}
            />
        )
    }

    componentDidMount() {
        const {inputs: {dataSetType, classification}} = this.props
        if (!dataSetType.value) {
            dataSetType.set('OPTICAL')
        }
        if (classification.value) {
            this.loadClassification(classification.value)
        }
    }

    componentDidUpdate(prevProps) {
        const {inputs: {dataSetType: {value: prevDataSetType}}} = prevProps
        const {inputs: {dataSetType: {value: dataSetType}, dataSets, asset}} = this.props
        const dataSetTypeChanged = prevDataSetType !== dataSetType
        if (dataSetTypeChanged) {
            const options = this.dataSetOptions()
            const validDataSets = _.intersection(options.map(({value}) => value), dataSets.value)
            if (!validDataSets.length) {
                const defaultDataSets =
                    dataSetType === 'OPTICAL'
                        ? [options[0].value]
                        : options[0].value
                dataSets.set(defaultDataSets)
            }
            if (dataSetType !== 'PLANET') {
                asset.set(null)
            }
        }
    }

    dataSetOptions() {
        const {dates, inputs: {dataSetType}} = this.props
        switch (dataSetType.value) {
        case 'OPTICAL': return opticalDataSetOptions({...dates})
        case 'RADAR': return radarDataSetOptions({...dates})
        case 'PLANET': return planetDataSetOptions({...dates}).filter(({value}) => value !== 'NICFI')
        default: return []
        }
    }

    loadClassification(recipeId) {
        const {stream, loadRecipe$} = this.props
        this.deselectClassification()
        stream('LOAD_CLASSIFICATION_RECIPE',
            loadRecipe$(recipeId),
            classification => this.setState({
                classificationLegend: classification.model.legend,
                classifierType: classification.model.classifier.type
            }),
            error => Notifications.error({
                message: msg('process.timeSeries.panel.sources.classificationLoadError', {error}),
                error
            })
        )
    }

    deselectClassification() {
        this.setState({
            classificationLegend: null,
            classifierType: null
        })
    }
}

const valuesToModel = ({dataSetType, asset, dataSets, classification}) => {
    return ({
        dataSetType,
        dataSets: toSources(_.isArray(dataSets) ? dataSets : [dataSets]),
        assets: asset ? [asset] : [],
        classification
    })
}

const modelToValues = ({dataSetType, assets, dataSets, classification}) => {
    const dataSetIds = _.uniq(Object.values(dataSets).flat())
    const defaultedDataSetType = dataSetType
        ? dataSetType
        : dataSetIds.find(dataSetId => isOpticalDataSet(dataSetId))
            ? 'OPTICAL'
            : dataSetIds.find(dataSetId => isRadarDataSet(dataSetId))
                ? 'RADAR'
                : 'PLANET'
    return ({
        dataSetType: defaultedDataSetType,
        dataSets: defaultedDataSetType === 'OPTICAL' || !dataSetIds.length ? dataSetIds : dataSetIds[0],
        asset: _.isEmpty(assets) ? null : assets[0],
        validAsset: true,
        classification
    })
}

export const Sources = compose(
    _Sources,
    connect(mapStateToProps),
    recipeFormPanel({id: 'sources', fields, mapRecipeToProps, modelToValues, valuesToModel}),
    recipeAccess()
)

Sources.propTypes = {}
