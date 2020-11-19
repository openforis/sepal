import {Form} from 'widget/form/form'
import {MosaicPreview} from '../../../mosaic/mosaicPreview'
import {NoData} from 'widget/noData'
import {Panel} from 'widget/panel/panel'
import {RecipeActions} from '../../classificationRecipe'
import {RecipeFormPanel, recipeFormPanel} from 'app/home/body/process/recipeFormPanel'
import {Subject} from 'rxjs'
import {SuperButton} from 'widget/superButton'
import {activator} from 'widget/activation/activator'
import {compose} from 'compose'
import {msg} from 'translate'
import {selectFrom} from 'stateUtils'
import React from 'react'
import TrainingDataSet from './trainingDataSet'
import guid from 'guid'
import styles from './trainingData.module.css'

const mapRecipeToProps = recipe => ({
    dataSets: selectFrom(recipe, 'model.trainingData.dataSets') || []
})

class TrainingData extends React.Component {
    constructor(props) {
        super(props)
        this.eeTableChanged$ = new Subject()
        const {recipeId} = props
        this.preview = MosaicPreview(recipeId)
        this.recipeActions = RecipeActions(recipeId)
    }
    render() {
        const {dataSets} = this.props
        return (
            <React.Fragment>
                <RecipeFormPanel
                    className={styles.panel}
                    placement='bottom-right'
                    onClose={() => this.preview.show()}>
                    <Panel.Header
                        icon='table'
                        title={msg('process.classification.panel.trainingData.title')}/>
                    <Panel.Content>
                        {this.renderContent()}
                    </Panel.Content>
                    <Form.PanelButtons invalid={!dataSets.length}>
                        <Panel.Buttons.Add onClick={() => this.addDataSet()}/>
                    </Form.PanelButtons>
                </RecipeFormPanel>
                <TrainingDataSet/>
            </React.Fragment>
        )
    }

    renderContent() {
        const {dataSets = []} = this.props
        return dataSets.length
            ? this.renderDataSets(dataSets)
            : this.renderNoDataSetMessage()
    }

    renderDataSets(dataSets) {
        return dataSets
            .filter(dataSet => dataSet)
            .map(dataSet => this.renderDataSet(dataSet))
    }

    renderDataSet(dataSet) {
        const name = dataSet.name
        if (!name)
            return null
        return (
            <SuperButton
                key={`${dataSet.type}-${dataSet.dataSetId}`}
                title={msg(`process.classification.panel.trainingData.type.${dataSet.type}.label`)}
                description={name}
                removeMessage={msg('process.classification.panel.trainingData.remove.confirmationMessage', {name})}
                removeTooltip={msg('process.classification.panel.trainingData.remove.tooltip')}
                onClick={() => this.editDataSet(dataSet)}
                onRemove={() => this.removeDataSet(dataSet)}
            />
        )
    }

    renderNoDataSetMessage() {
        return (
            <NoData message={msg('process.classification.panel.trainingData.noDataSet')}/>
        )
    }

    addDataSet() {
        const {activator: {activatables: {trainingDataSet}}} = this.props
        trainingDataSet.activate({dataSetId: guid()})
    }

    editDataSet(dataSet) {
        const {activator: {activatables: {trainingDataSet}}} = this.props
        trainingDataSet.activate({dataSetId: dataSet.dataSetId})
    }

    componentDidMount() {
        this.preview.hide()
    }

    removeDataSet(dataSetToRemove) {
        this.recipeActions.removeTrainingDataSet(dataSetToRemove)
    }
}

TrainingData.propTypes = {}

const additionalPolicy = () => ({'trainingDataSet': 'allow'})
// [HACK] This actually isn't a form, and we don't want to update the model. This prevents the selected data sets from
// being overridden.
const valuesToModel = null

export default compose(
    TrainingData,
    recipeFormPanel({id: 'trainingData', mapRecipeToProps, valuesToModel, additionalPolicy}),
    activator('trainingDataSet')
)
