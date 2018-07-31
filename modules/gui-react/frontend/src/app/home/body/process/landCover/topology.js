import {RecipeActions, recipePath, RecipeState} from './landCoverRecipe'
import PropTypes from 'prop-types'
import React from 'react'
import {msg} from 'translate'
import {form} from 'widget/form'
import {Panel, PanelContent, PanelHeader} from 'widget/panel'
import PanelButtons from 'widget/panelButtons'
import styles from './topology.module.css'

const fields = {}

const mapStateToProps = (state, ownProps) => {
    const recipeId = ownProps.recipeId
    const recipeState = RecipeState(recipeId)
    let values = recipeState('ui.topology')
    if (!values) {
        const model = recipeState('model.topology')
        values = modelToValues(model)
        RecipeActions(recipeId).setTopology({values, model}).dispatch()
    }
    return {values}
}

class Topology extends React.Component {
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
                    title={msg('process.landCover.panel.topology.title')}/>

                <PanelContent>
                    {this.renderContent()}
                </PanelContent>

                <PanelButtons
                    statePath={recipePath(recipeId, 'ui')}
                    form={form}
                    onApply={values => this.recipeActions.setTopology({
                        values,
                        model: valuesToModel(values)
                    }).dispatch()}/>
            </Panel>
        )
    }

    renderContent() {
        return (
            <div className={styles.content}>
                Select (or create?) a topology somehow here.
            </div>
        )
    }
}

Topology.propTypes = {
    recipeId: PropTypes.string,
}

export default form({fields, mapStateToProps})(Topology)

const valuesToModel = (values) => ({
    ...values
})

const modelToValues = (model = {}) => ({
    ...model
})