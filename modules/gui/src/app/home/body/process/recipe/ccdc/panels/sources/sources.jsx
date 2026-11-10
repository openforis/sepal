import _ from 'lodash'
import React from 'react'

import {dataSetPeriod} from '#sepal/recipe/type/ccdc'
import {draftSelection, withSelectedClassification} from '~/app/home/body/process/recipe/collections/selectedClassification'
import {isOpticalDataSet} from '~/app/home/body/process/recipe/opticalMosaic/sources'
import {isRadarDataSet} from '~/app/home/body/process/recipe/radarMosaic/sources'
import {RecipeInput} from '~/app/home/body/process/recipe/sources/recipeInput'
import {RecipeFormPanel, recipeFormPanel} from '~/app/home/body/process/recipeFormPanel'
import {compose} from '~/compose'
import {dataSetOptions, defaultDataSet, groupedBandOptions, toDataSetIds, toSources, withChosenBands} from '~/sources'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {Button} from '~/widget/button'
import {Form} from '~/widget/form'
import {Layout} from '~/widget/layout'
import {Panel} from '~/widget/panel/panel'

import styles from './sources.module.css'

const fields = {
    advanced: new Form.Field(),
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
    cloudPercentageThreshold: new Form.Field(),
    classification: new Form.Field(),
    breakpointBands: new Form.Field()
        .notEmpty()
}

const mapRecipeToProps = recipe => ({
    dates: selectFrom(recipe, 'model.dates'),
    corrections: selectFrom(recipe, 'model.options.corrections')
})

class _Sources extends React.Component {
    // More is where the classification is chosen, so Sources open on it while one is selected, as on More pressed before.
    constructor(props) {
        super(props)
        const {inputs: {advanced, classification}} = props
        this.state = {advanced: Boolean(advanced.value) || Boolean(classification.value)}
    }

    render() {
        const {advanced} = this.state
        return (
            <RecipeFormPanel
                className={this.panelClassName()}
                placement='bottom-right'>
                <Panel.Header
                    icon='cog'
                    title={msg('process.ccdc.panel.sources.title')}/>
                <Panel.Content>
                    {advanced ? this.renderAdvanced() : this.renderSimple()}
                </Panel.Content>
                <Form.PanelButtons>
                    <Button
                        label={advanced ? msg('button.less') : msg('button.more')}
                        onClick={() => this.setAdvanced(!advanced)}/>
                </Form.PanelButtons>
            </RecipeFormPanel>
        )
    }

    // Sized for the family chosen in the draft and the view shown. What a Classification or a message adds scrolls,
    // leaving the panel's height as it is.
    panelClassName() {
        const {inputs: {dataSetType}} = this.props
        const {advanced} = this.state
        return [styles.panel, styles[dataSetType.value?.toLowerCase()], advanced ? styles.more : null].join(' ')
    }

    renderAdvanced() {
        const {inputs: {dataSetType}} = this.props
        return (
            <Layout>
                {this.renderDataSetTypes()}
                {this.renderDataSets()}
                {dataSetType.value === 'OPTICAL' ? this.renderCloudPercentageThreshold() : null}
                {this.renderAssetId()}
                {this.renderClassification()}
                {this.renderBreakpointBands()}
            </Layout>
        )
    }

    renderSimple() {
        const {inputs: {dataSetType}} = this.props
        return (
            <Layout>
                {this.renderDataSetTypes()}
                {this.renderDataSets()}
                {dataSetType.value === 'OPTICAL' ? this.renderCloudPercentageThreshold() : null}
                {this.renderAssetId()}
                {this.classificationProblem() ? this.renderClassification() : null}
                {this.renderBreakpointBands()}
            </Layout>
        )
    }

    // The classification is chosen under More; while what is selected there cannot be used, it shows anyway, saying why.
    classificationProblem() {
        const {form, inputs: {classification}} = this.props
        return !!form.getErrorMessage(classification)
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
        const {form, inputs: {dataSetType, dataSets}} = this.props
        if (!dataSetType.value) {
            return null
        }
        return (
            <Form.Buttons
                label={msg('process.ccdc.panel.sources.form.dataSets.label')}
                input={dataSets}
                options={this.dataSetOptions()}
                multiple={dataSetType.value === 'OPTICAL'}
                errorMessage={form.getErrorMessage(dataSets)}
            />
        )
    }
    
    renderCloudPercentageThreshold() {
        const {inputs: {cloudPercentageThreshold}} = this.props
        return (
            <Form.Slider
                label={msg('process.ccdc.panel.sources.form.cloudPercentageThreshold.label')}
                tooltip={msg('process.ccdc.panel.sources.form.cloudPercentageThreshold.tooltip')}
                input={cloudPercentageThreshold}
                minValue={0}
                maxValue={100}
                ticks={[0, 10, 25, 50, 75, 90, 100]}
                range='low'
                info={value =>
                    msg('process.ccdc.panel.sources.form.cloudPercentageThreshold.value', {value})
                }
            />
        )
    }

    renderClassification() {
        const {inputs: {classification}} = this.props
        return (
            <RecipeInput
                label={msg('process.ccdc.panel.sources.form.classification.label')}
                tooltip={msg('process.ccdc.panel.sources.form.classification.tooltip')}
                placeholder={msg('process.ccdc.panel.sources.form.classification.placeholder')}
                input={classification}
                filter={type => type.id === 'CLASSIFICATION'}
                allowClear
                busyMessage={this.props.selectedClassification.loading && msg('widget.loading')}
            />
        )
    }

    // Every band chosen stays shown, so the form has none to drop (form/buttons.jsx) and a refused one is explained beside it.
    renderBreakpointBands() {
        const {form, selectedClassification: {labelOf}, inputs: {breakpointBands}} = this.props
        const options = withChosenBands(this.breakpointBandOptions(), breakpointBands.value, labelOf)
            .filter(group => group.length)
            .map(group => ({options: group}))
        return (
            <Form.Buttons
                label={msg('process.ccdc.panel.sources.form.breakpointBands.label')}
                input={breakpointBands}
                options={options}
                multiple
                disabled={!options.length}
                framed
                errorMessage={form.getErrorMessage(breakpointBands)}
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

    dataSetOptions() {
        const {inputs: {dataSetType, dataSets}} = this.props
        return dataSetOptions({type: dataSetType.value, period: this.period(), chosen: dataSets.value})
    }

    period() {
        const {dates} = this.props
        return dataSetPeriod({dates})
    }

    breakpointBandOptions() {
        const {corrections, selectedClassification: {classificationLegend, classifierType, classifier}, inputs: {dataSets}} = this.props
        return dataSets.value && dataSets.value.length
            ? groupedBandOptions({
                dataSets: toDataSetIds(dataSets),
                corrections,
                classification: {classificationLegend, classifierType, classifier, include: ['regression', 'probabilities']}
            })
            : []
    }

    componentDidMount() {
        const {inputs: {dataSetType, cloudPercentageThreshold}} = this.props
        if (!dataSetType.value) {
            dataSetType.set('OPTICAL')
        }
        if (_.isUndefined(cloudPercentageThreshold)) {
            cloudPercentageThreshold.set(100)
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
                const first = defaultDataSet(dataSetType, this.period())
                dataSets.set(dataSetType === 'OPTICAL' ? [first].filter(Boolean) : first ?? null)
            }
            if (dataSetType !== 'PLANET') {
                asset.set(null)
            }
        }
    }

    setAdvanced(enabled) {
        const {inputs: {advanced}} = this.props
        this.setState({advanced: enabled})
        advanced.set(enabled)
    }
}

const valuesToModel = ({dataSetType, asset, dataSets, cloudPercentageThreshold, classification, breakpointBands}) => {
    return ({
        dataSetType,
        dataSets: toSources(_.isArray(dataSets) ? dataSets : [dataSets]),
        cloudPercentageThreshold,
        assets: asset ? [asset] : [],
        classification,
        breakpointBands
    })
}

const modelToValues = ({dataSetType, assets, dataSets, cloudPercentageThreshold, classification, breakpointBands}) => {
    const dataSetIds = _.uniq(Object.values(dataSets || {}).flat())
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
        cloudPercentageThreshold,
        asset: _.isEmpty(assets) ? null : assets[0],
        validAsset: true,
        classification,
        breakpointBands
    })
}

// Band options depend on what the classifier produces, so Sources hold the Classification their draft selects, whichever
// view is showing: the controls needing it are not always shown beside the selector.
export const Sources = compose(
    _Sources,
    withSelectedClassification({candidate: draftSelection, loadError: 'process.ccdc.panel.sources.classificationLoadError'}),
    recipeFormPanel({id: 'sources', fields, mapRecipeToProps, modelToValues, valuesToModel})
)

Sources.propTypes = {}
