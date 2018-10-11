import {Panel, PanelContent, PanelHeader} from 'widget/panel'
import {RecipeActions, RecipeState, recipePath} from './landCoverRecipe'
import {form} from 'widget/form'
import {msg} from 'translate'
import PanelButtons from 'widget/panelButtons'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './compositeOptions.module.css'

const fields = {}

const mapStateToProps = (state, ownProps) => {
    const recipeId = ownProps.recipeId
    const recipeState = RecipeState(recipeId)
    let values = recipeState('ui.compositeOptions')
    if (!values) {
        const model = recipeState('model.compositeOptions')
        values = modelToValues(model)
        RecipeActions(recipeId).setCompositeOptions({values, model}).dispatch()
    }
    return {values}
}

class CompositeOptions extends React.Component {
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
                    title={msg('process.landCover.panel.compositeOptions.title')}/>

                <PanelContent>
                    {this.renderContent()}
                </PanelContent>

                <PanelButtons
                    statePath={recipePath(recipeId, 'ui')}
                    form={form}
                    onApply={values => this.recipeActions.setCompositeOptions({
                        values,
                        model: valuesToModel(values)
                    }).dispatch()}/>
            </Panel>
        )
    }

    renderContent() {
        return (
            <div className={styles.content}>
                Configure how the composite should be created here.
            </div>
        )
    }
}

CompositeOptions.propTypes = {
    recipeId: PropTypes.string,
}

export default form({fields, mapStateToProps})(CompositeOptions)

const valuesToModel = values => ({
    ...values
})

const modelToValues = (model = {}) => ({
    ...model
})
