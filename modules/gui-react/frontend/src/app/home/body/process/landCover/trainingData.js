import {RecipeActions, recipePath, RecipeState} from './landCoverRecipe'
import PropTypes from 'prop-types'
import React from 'react'
import {msg} from 'translate'
import {form} from 'widget/form'
import {Panel, PanelContent, PanelHeader} from 'widget/panel'
import PanelButtons from 'widget/panelButtons'
import styles from './trainingData.module.css'

const fields = {}

const mapStateToProps = (state, ownProps) => {
    const recipeId = ownProps.recipeId
    const recipeState = RecipeState(recipeId)
    let values = recipeState('ui.trainingData')
    if (!values) {
        const model = recipeState('model.trainingData')
        values = modelToValues(model)
        RecipeActions(recipeId).setTrainingData({values, model}).dispatch()
    }
    return {values}
}

class TrainingData extends React.Component {
    constructor(props) {
        super(props)
        const {recipeId} = props
        this.recipeActions = RecipeActions(recipeId)
    }

    render() {
        const {recipeId, form} = this.props
        return (
            <Panel className={styles.panel}>
                <PanelHeader
                    icon='cog'
                    title={msg('process.landCover.panel.trainingData.title')}/>

                <PanelContent>
                    {this.renderContent()}
                </PanelContent>

                <PanelButtons
                    statePath={recipePath(recipeId, 'ui')}
                    form={form}
                    onApply={values => this.recipeActions.setTrainingData({
                        values,
                        model: valuesToModel(values)
                    }).dispatch()}/>
            </Panel>
        )
    }

    renderContent() {
        return (
            <div className={styles.content}>
                Collect or select training data here.
            </div>
        )
    }
}

TrainingData.propTypes = {
    recipeId: PropTypes.string,
}

export default form({fields, mapStateToProps})(TrainingData)

const valuesToModel = (values) => ({
    ...values
})

const modelToValues = (model = {}) => ({
    ...model
})