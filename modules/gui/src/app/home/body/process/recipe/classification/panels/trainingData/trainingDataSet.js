/* eslint-disable react/jsx-key */
import PropTypes from 'prop-types'
import React from 'react'

import {RecipeFormPanel, recipeFormPanel} from '~/app/home/body/process/recipeFormPanel'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {Form} from '~/widget/form'
import {PanelSections} from '~/widget/panelSections'

import {ClassMappingStep} from './classMappingStep'
import {ClassStep} from './classStep'
import {CsvUploadSection} from './csvUploadSection'
import {EETableSection} from './eeTableSection'
import {LocationStep} from './locationStep'
import {RecipeSection} from './recipeSection'
import {SampleClassificationSection} from './sampleClassificationSection'
import {SectionSelection} from './sectionSelection'
import styles from './trainingDataSet.module.css'

const fields = {
    dataSetId: new Form.Field()
        .notBlank('process.classification.panel.trainingData.form.dataSetId.required'),
    name: new Form.Field()
        .notBlank('process.classification.panel.trainingData.form.name.required'),
    type: new Form.Field()
        .notBlank('process.classification.panel.trainingData.form.section.required'),
    wizardStep: new Form.Field(),
    inputData: new Form.Field()
        .skip((value, {type}) => type === 'RECIPE')
        .notEmpty('process.classification.panel.trainingData.form.inputData.required'),
    columns: new Form.Field()
        .skip((value, {type}) => type === 'RECIPE')
        .notEmpty('process.classification.panel.trainingData.form.inputData.required'),

    recipe: new Form.Field()
        .skip((value, {type}) => type !== 'RECIPE')
        .notBlank('process.classification.panel.trainingData.form.recipe.required'),

    eeTable: new Form.Field()
        .skip((value, {type}) => type !== 'EE_TABLE')
        .notBlank('process.classification.panel.trainingData.form.eeTable.required'),

    typeToSample: new Form.Field()
        .skip((value, {type}) => type !== 'SAMPLE_CLASSIFICATION')
        .notBlank(),
    assetToSample: new Form.Field()
        .skip((value, {type, typeToSample}) => type !== 'SAMPLE_CLASSIFICATION' || typeToSample !== 'ASSET')
        .notBlank('process.classification.panel.trainingData.form.sampleClassification.assetToSample.required'),
    recipeIdToSample: new Form.Field()
        .skip((value, {type, typeToSample}) => type !== 'SAMPLE_CLASSIFICATION' || typeToSample !== 'RECIPE')
        .notBlank('process.classification.panel.trainingData.form.sampleClassification.recipeToSample.required'),
    samplesPerClass: new Form.Field()
        .skip((value, {type}) => type !== 'SAMPLE_CLASSIFICATION')
        .notBlank('process.classification.panel.trainingData.form.sampleClassification.numberOfSamples.required'),
    sampleScale: new Form.Field()
        .skip((value, {type}) => type !== 'SAMPLE_CLASSIFICATION')
        .notBlank('process.classification.panel.trainingData.form.sampleClassification.sampleScale.required'),

    locationType: new Form.Field()
        .skip((value, {type}) => type === 'RECIPE')
        .skip((value, {wizardStep}) => wizardStep !== 1)
        .notBlank('process.classification.panel.trainingData.form.location.locationType.required'),
    geoJsonColumn: new Form.Field()
        .skip((value, {wizardStep}) => wizardStep !== 1)
        .skip((value, {locationType}) => locationType !== 'GEO_JSON')
        .notBlank('process.classification.panel.trainingData.form.location.geoJsonColumn.required'),
    xColumn: new Form.Field()
        .skip((value, {wizardStep}) => wizardStep !== 1)
        .skip((value, {locationType}) => locationType === 'GEO_JSON')
        .notBlank('process.classification.panel.trainingData.form.location.xColumn.required'),
    yColumn: new Form.Field()
        .skip((value, {wizardStep}) => wizardStep !== 1)
        .skip((value, {locationType}) => locationType === 'GEO_JSON')
        .notBlank('process.classification.panel.trainingData.form.location.yColumn.required'),

    // TODO: CRS

    filterExpression: new Form.Field(),
    invalidFilterExpression: new Form.Field()
        .skip((value, {wizardStep}) => wizardStep !== 2)
        .predicate(invalid => !invalid, 'process.classification.panel.trainingData.form.class.filterExpression.invalid'),
    classColumnFormat: new Form.Field()
        .skip((value, {wizardStep}) => wizardStep !== 2)
        .notBlank('process.classification.panel.trainingData.form.class.classColumnFormat.required'),
    valueColumn: new Form.Field()
        .skip((value, {wizardStep}) => wizardStep !== 2)
        .skip((value, {classColumnFormat}) => classColumnFormat !== 'SINGLE_COLUMN')
        .notBlank('process.classification.panel.trainingData.form.class.valueColumn.required'),
    valueMapping: new Form.Field(),
    columnMapping: new Form.Field(),
    customMapping: new Form.Field(),
    defaultValue: new Form.Field(),

    referenceData: new Form.Field()
        .skip((value, {wizardStep}) => wizardStep !== 3)
        .notEmpty('process.classification.panel.trainingData.form.referenceData.required')
}

const mapRecipeToProps = recipe => ({
    recipeId: recipe.id
})

class _TrainingDataSet extends React.Component {
    render() {
        const {dataCollectionManager, inputs} = this.props

        return (
            <RecipeFormPanel
                className={styles.panel}
                placement='modal'
                onApply={() => setTimeout(() => dataCollectionManager.updateAll())}>
                <PanelSections
                    inputs={inputs}
                    sections={this.getSectionOptions()}
                    selected={inputs.type}
                    step={inputs.wizardStep}
                    icon='table'
                    label={msg('process.classification.panel.trainingData.sectionSelection.title')}
                />
            </RecipeFormPanel>
        )
    }

    getSectionOptions() {
        const {inputs} = this.props
        return [
            {
                component: <SectionSelection section={inputs.type}/>
            },
            {
                value: 'CSV_UPLOAD',
                label: msg('process.classification.panel.trainingData.type.CSV_UPLOAD.label'),
                tooltip: msg('process.classification.panel.trainingData.type.CSV_UPLOAD.tooltip'),
                title: msg('process.classification.panel.trainingData.type.CSV_UPLOAD.title'),
                steps: [
                    <CsvUploadSection ${...this.props}/>,
                    <LocationStep ${...this.props}/>,
                    <ClassStep ${...this.props}/>,
                    <ClassMappingStep ${...this.props}/>
                ]
            },
            {
                value: 'EE_TABLE',
                label: msg('process.classification.panel.trainingData.type.EE_TABLE.label'),
                tooltip: msg('process.classification.panel.trainingData.type.EE_TABLE.tooltip'),
                title: msg('process.classification.panel.trainingData.type.EE_TABLE.title'),
                steps: [
                    <EETableSection ${...this.props}/>,
                    <LocationStep ${...this.props}/>,
                    <ClassStep ${...this.props}/>,
                    <ClassMappingStep ${...this.props}/>
                ]
            },
            {
                value: 'SAMPLE_CLASSIFICATION',
                label: msg('process.classification.panel.trainingData.type.SAMPLE_CLASSIFICATION.label'),
                tooltip: msg('process.classification.panel.trainingData.type.SAMPLE_CLASSIFICATION.tooltip'),
                title: msg('process.classification.panel.trainingData.type.SAMPLE_CLASSIFICATION.title'),
                steps: [
                    <SampleClassificationSection ${...this.props}/>,
                    <LocationStep ${...this.props}/>,
                    <ClassStep ${...this.props}/>,
                    <ClassMappingStep ${...this.props}/>
                ]
            },
            {
                value: 'RECIPE',
                label: msg('process.classification.panel.trainingData.type.RECIPE.label'),
                tooltip: msg('process.classification.panel.trainingData.type.RECIPE.tooltip'),
                title: msg('process.classification.panel.trainingData.type.RECIPE.title'),
                component: <RecipeSection ${...this.props}/>
            }
        ]
    }

    componentDidMount() {
        // const {inputs: {bandSetSpecs}} = this.props
        // if (!bandSetSpecs.value)
        //     bandSetSpecs.set([{id: uuid(), type: 'IMAGE_BANDS', class: 'IMAGE_BANDS'}])
    }

    componentDidUpdate() {
        const {inputs, activatable: {dataSetId}} = this.props
        inputs.dataSetId.set(dataSetId)
    }

    addImage() {
        const {onAdd, activatable: {deactivate}} = this.props
        onAdd(this.getSelectedImage())
        deactivate()
    }

    getSelectedImage() {
        const {inputs: {section, recipe, asset}} = this.props
        switch (section.value) {
        case 'ASSET':
            return {
                type: 'ASSET',
                id: asset.value
            }
        case 'RECIPE_REF':
            return {
                type: 'RECIPE_REF',
                id: recipe.value
            }
        default:
            throw Error(`Unexpected image section: ${section.value}`)
        }
    }

}

const modelToValues = model => {
    return {
        dataSetId: model.dataSetId,
        name: model.name,
        type: model.type,
        inputData: model.inputData,
        columns: model.columns,
        eeTable: model.eeTable,
        typeToSample: model.typeToSample || 'ASSET',
        assetToSample: model.assetToSample,
        recipeIdToSample: model.recipeIdToSample,
        samplesPerClass: model.samplesPerClass,
        sampleScale: model.sampleScale,
        recipe: model.recipe,
        locationType: model.locationType,
        geoJsonColumn: model.geoJsonColumn,
        xColumn: model.xColumn,
        yColumn: model.yColumn,
        filterExpression: model.filterExpression,
        classColumnFormat: model.classColumnFormat,
        valueColumn: model.valueColumn,
        valueMapping: model.valueMapping || {},
        columnMapping: model.columnMapping,
        customMapping: model.customMapping,
        defaultValue: model.defaultValue
    }
}

const valuesToModel = values => {
    return {
        ...values,
        inputData: values.type === 'CSV_UPLOAD' ? values.inputData : undefined,
        referenceData: values.referenceData.referenceData
    }
}

const policy = () => ({_: 'allow'})
const panelOptions = {
    id: 'trainingDataSet',
    path: props => {
        const dataSetId = selectFrom(props, 'activatable.dataSetId')
        return dataSetId ? ['trainingData.dataSets', {dataSetId}] : null
    },
    fields,
    valuesToModel,
    modelToValues,
    mapRecipeToProps,
    policy
}

export const TrainingDataSet = compose(
    _TrainingDataSet,
    recipeFormPanel(panelOptions)
)

TrainingDataSet.propTypes = {
    dataCollectionManager: PropTypes.object.isRequired
}
