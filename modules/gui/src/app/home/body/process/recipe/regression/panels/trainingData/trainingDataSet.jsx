/* eslint-disable react/jsx-key */
import React from 'react'

import {RecipeFormPanel, recipeFormPanel} from '~/app/home/body/process/recipeFormPanel'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {Form} from '~/widget/form'
import {PanelSections} from '~/widget/panelSections'

import {EETableSection} from './eeTableSection'
import {RecipeSection} from './recipeSection'
import {SampleImageSection} from './sampleImageSection'
import {SectionSelection} from './sectionSelection'
import styles from './trainingDataSet.module.css'

const fields = {
    dataSetId: new Form.Field()
        .notBlank('process.classification.panel.trainingData.form.dataSetId.required'),
    name: new Form.Field()
        .notBlank('process.classification.panel.trainingData.form.name.required'),
    type: new Form.Field()
        .notBlank('process.classification.panel.trainingData.form.section.required'),

    recipe: new Form.Field()
        .skip((value, {type}) => type !== 'RECIPE')
        .notBlank('process.classification.panel.trainingData.form.recipe.required'),

    eeTable: new Form.Field()
        .skip((value, {type}) => type !== 'EE_TABLE')
        .notBlank('process.classification.panel.trainingData.form.eeTable.required'),

    typeToSample: new Form.Field()
        .skip((value, {type}) => type !== 'SAMPLE_IMAGE')
        .notBlank(),
    assetToSample: new Form.Field()
        .skip((value, {type, typeToSample}) => type !== 'SAMPLE_IMAGE' || typeToSample !== 'ASSET')
        .notBlank('process.classification.panel.trainingData.form.sampleClassification.assetToSample.required'),
    recipeIdToSample: new Form.Field()
        .skip((value, {type, typeToSample}) => type !== 'SAMPLE_IMAGE' || typeToSample !== 'RECIPE')
        .notBlank('process.classification.panel.trainingData.form.sampleClassification.recipeToSample.required'),
    sampleCount: new Form.Field()
        .skip((value, {type}) => type !== 'SAMPLE_IMAGE')
        .notBlank('process.classification.panel.trainingData.form.sampleClassification.numberOfSamples.required'),
    sampleScale: new Form.Field()
        .skip((value, {type}) => type !== 'SAMPLE_IMAGE')
        .notBlank('process.classification.panel.trainingData.form.sampleClassification.sampleScale.required'),

    valueColumn: new Form.Field()
        .skip((value, {type}) => type === 'RECIPE')
        .notBlank('process.classification.panel.trainingData.form.class.valueColumn.required'),

    referenceData: new Form.Field()
        .skip((value, {type}) => type === 'RECIPE')
        .notEmpty('process.classification.panel.trainingData.form.referenceData.required')
}

const mapRecipeToProps = recipe => ({
    recipeId: recipe.id
})

class _TrainingDataSet extends React.Component {
    render() {
        const {inputs} = this.props

        return (
            <RecipeFormPanel
                className={styles.panel}
                placement='modal'>
                <PanelSections
                    inputs={inputs}
                    sections={this.getSectionOptions()}
                    selected={inputs.type}
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
                value: 'EE_TABLE',
                label: msg('process.classification.panel.trainingData.type.EE_TABLE.label'),
                tooltip: msg('process.classification.panel.trainingData.type.EE_TABLE.tooltip'),
                title: msg('process.classification.panel.trainingData.type.EE_TABLE.title'),
                component: <EETableSection ${...this.props}/>,
            },
            {
                value: 'SAMPLE_IMAGE',
                label: msg('process.regression.panel.trainingData.type.SAMPLE_IMAGE.label'),
                tooltip: msg('process.regression.panel.trainingData.type.SAMPLE_IMAGE.tooltip'),
                title: msg('process.regression.panel.trainingData.type.SAMPLE_IMAGE.title'),
                component: <SampleImageSection ${...this.props}/>
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
        referenceData: values.referenceData
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

