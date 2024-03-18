import {ButtonSelect} from '~/widget/buttonSelect'
import {Confirm} from '~/widget/confirm'
import {CrudItem} from '~/widget/crudItem'
import {Form} from '~/widget/form'
import {Layout} from '~/widget/layout'
import {ListItem} from '~/widget/listItem'
import {NoData} from '~/widget/noData'
import {Panel} from '~/widget/panel/panel'
import {RecipeActions} from '~/app/home/body/process/recipe/classification/classificationRecipe'
import {RecipeFormPanel, recipeFormPanel} from '~/app/home/body/process/recipeFormPanel'
import {Subject} from 'rxjs'
import {TrainingDataSet} from './trainingDataSet'
import {compose} from '~/compose'
import {downloadCsv} from '~/widget/download'
import {msg} from '~/translate'
import {selectFrom} from '~/stateUtils'
import {uuid} from '~/uuid'
import {withActivators} from '~/widget/activation/activator'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './trainingData.module.css'

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
        const {dataSets, dataCollectionManager} = this.props
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
                <TrainingDataSet dataCollectionManager={dataCollectionManager}/>
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
            },
            {
                value: 'clear',
                label: msg('process.classification.panel.trainingData.clearCollected.label'),
                onSelect: () => this.askConfirmation(true)
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
        const {dataCollectionManager} = this.props
        const name = dataSet.name
        if (!name)
            return null
        const collected = dataSet.type === 'COLLECTED'
        return (
            <ListItem
                key={`${dataSet.type}-${dataSet.dataSetId}`}
                disabled={collected}
                onClick={() => this.editDataSet(dataSet)}>
                <CrudItem
                    title={msg(`process.classification.panel.trainingData.type.${dataSet.type}.label`)}
                    description={collected ? msg('process.classification.panel.trainingData.type.COLLECTED.label') : name}
                    removeMessage={msg('process.classification.panel.trainingData.remove.confirmationMessage', {name})}
                    removeTooltip={msg('process.classification.panel.trainingData.remove.tooltip')}
                    onRemove={() => {
                        this.removeDataSet(dataSet)
                        setTimeout(() => dataCollectionManager.updateAll())
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

    renderClearConfirmation() {
        return (
            <Confirm
                title={msg('process.classification.panel.trainingData.clearCollected.confirmation.title')}
                message={msg('process.classification.panel.trainingData.clearCollected.confirmation.message')}
                label={msg('process.classification.panel.trainingData.clearCollected.confirmation.label')}
                onConfirm={() => {
                    this.clearCollectedReferenceData()
                    this.askConfirmation(false)
                }}
                onCancel={() => this.askConfirmation(false)}
            />
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

    clearCollectedReferenceData() {
        const {dataCollectionManager, dataSets} = this.props
        dataSets
            .filter(({type}) => type === 'COLLECTED')
            .forEach(dataSet => {
                this.recipeActions.clearTrainingDataSet(dataSet)
                setTimeout(() => dataCollectionManager.updateAll())
            })
    }

    exportReferenceData() {
        const {dataSets, title} = this.props
        const csv = [
            ['XCoordinate,YCoordinate,class'],
            dataSets
                .filter(({type}) => type !== 'CLASSIFICATION')
                .map(({referenceData}) => referenceData)
                .flat()
                .map(point => `${point.x},${point.y},${point.class}`)
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

TrainingData.propTypes = {
    dataCollectionManager: PropTypes.object.isRequired
}
