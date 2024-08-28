import React from 'react'
import {Subject} from 'rxjs'

import {RecipeActions} from '~/app/home/body/process/recipe/classification/classificationRecipe'
import {RecipeFormPanel, recipeFormPanel} from '~/app/home/body/process/recipeFormPanel'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {uuid} from '~/uuid'
import {withActivators} from '~/widget/activation/activator'
import {ButtonSelect} from '~/widget/buttonSelect'
import {CrudItem} from '~/widget/crudItem'
import {downloadCsv} from '~/widget/download'
import {Form} from '~/widget/form'
import {Layout} from '~/widget/layout'
import {ListItem} from '~/widget/listItem'
import {NoData} from '~/widget/noData'
import {Panel} from '~/widget/panel/panel'

import styles from './trainingData.module.css'
import {TrainingDataSet} from './trainingDataSet'

const mapRecipeToProps = recipe => ({
    dataSets: selectFrom(recipe, 'model.trainingData.dataSets') || [],
    title: recipe.title || recipe.placeholder
})

class _TrainingData extends React.Component {
    state = {
        askConfirmation: false
    }

    constructor(props) {
        super(props)
        this.eeTableChanged$ = new Subject()
        const {recipeId} = props
        this.recipeActions = RecipeActions(recipeId)
    }

    render() {
        const {dataSets} = this.props
        const {askConfirmation} = this.state
        return (
            <React.Fragment>
                <RecipeFormPanel
                    className={styles.panel}
                    placement='bottom-right'>
                    <Panel.Header
                        icon='table'
                        title={msg('process.classification.panel.trainingData.title')}/>
                    <Panel.Content>
                        {this.renderContent()}
                    </Panel.Content>
                    <Form.PanelButtons invalid={!dataSets.length}>
                        {this.renderAddButton()}
                    </Form.PanelButtons>
                </RecipeFormPanel>
                <TrainingDataSet/>
                {askConfirmation ? this.renderClearConfirmation() : null}
            </React.Fragment>
        )
    }

    renderAddButton() {
        const options = [
            {
                value: 'export',
                label: msg('process.classification.panel.trainingData.export.label'),
                onSelect: () => this.exportReferenceData()
            }
        ]
        return (
            <ButtonSelect
                look={'add'}
                icon={'plus'}
                label={msg('button.add')}
                placement='above'
                tooltipPlacement='bottom'
                options={options}
                onClick={() => this.addDataSet()}
            />
        )
    }

    getDataSets() {
        const {dataSets = []} = this.props
        return dataSets
            .filter(dataSet => dataSet)
            .map(dataSet => this.renderDataSet(dataSet))
    }

    renderContent() {
        const dataSets = this.getDataSets()
        return dataSets.length
            ? this.renderDataSets(dataSets)
            : this.renderNoDataSetMessage()
    }

    renderDataSets(dataSets) {
        return (
            <Layout type='vertical' spacing='tight'>
                {dataSets}
            </Layout>
        )
    }

    renderDataSet(dataSet) {
        const name = dataSet.name
        if (!name)
            return null
        return (
            <ListItem
                key={`${dataSet.type}-${dataSet.dataSetId}`}
                onClick={() => this.editDataSet(dataSet)}>
                <CrudItem
                    title={msg(`process.regression.panel.trainingData.type.${dataSet.type}.label`)}
                    description={name}
                    removeMessage={msg('process.classification.panel.trainingData.remove.confirmationMessage', {name})}
                    removeTooltip={msg('process.classification.panel.trainingData.remove.tooltip')}
                    onRemove={() => {
                        this.removeDataSet(dataSet)
                    }}
                />
            </ListItem>
        )
    }

    renderNoDataSetMessage() {
        return (
            <NoData message={msg('process.classification.panel.trainingData.noDataSet')}/>
        )
    }

    addDataSet() {
        const {activator: {activatables: {trainingDataSet}}} = this.props
        trainingDataSet.activate({dataSetId: uuid()})
    }

    editDataSet(dataSet) {
        const {activator: {activatables: {trainingDataSet}}} = this.props
        trainingDataSet.activate({dataSetId: dataSet.dataSetId})
    }

    removeDataSet(dataSetToRemove) {
        this.recipeActions.removeTrainingDataSet(dataSetToRemove)
    }

    exportReferenceData() {
        const {dataSets, title} = this.props
        const csv = [
            ['XCoordinate,YCoordinate,value'],
            dataSets
                .map(({referenceData}) => referenceData)
                .flat()
                .map(point => `${point.x},${point.y},${point.value}`)
        ].flat().join('\n')
        const filename = `${title}_reference_data.csv`
        downloadCsv(csv, filename)
    }

    askConfirmation(askConfirmation) {
        this.setState({askConfirmation})
    }
}

const additionalPolicy = () => ({'trainingDataSet': 'allow'})
// [HACK] This actually isn't a form, and we don't want to update the model. This prevents the selected data sets from
// being overridden.
const valuesToModel = null

export const TrainingData = compose(
    _TrainingData,
    recipeFormPanel({id: 'trainingData', mapRecipeToProps, valuesToModel, additionalPolicy}),
    withActivators('trainingDataSet')
)
