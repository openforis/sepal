import {Form, form} from 'widget/form/form'
import {PanelContent, PanelHeader} from 'widget/panel'
import {RecipeActions, RecipeState} from '../landCoverRecipe'
import {activatable} from 'widget/activation/activatable'
import {compose} from 'compose'
import {initValues} from 'app/home/body/process/recipe'
import {msg} from 'translate'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './typology.module.css'

const fields = {}

class Typology extends React.Component {
    constructor(props) {
        super(props)
        const {recipeId} = props
        this.recipeActions = RecipeActions(recipeId)
    }

    render() {
        const {recipePath, form} = this.props
        return (
            <Form.Panel
                className={styles.panel}
                form={form}
                statePath={recipePath + '.ui'}
                onApply={values => this.recipeActions.setTypology({
                    values,
                    model: valuesToModel(values)
                }).dispatch()}>
                <PanelHeader
                    icon='cog'
                    title={msg('process.landCover.panel.typology.title')}/>
                <PanelContent>
                    {this.renderContent()}
                </PanelContent>
                <Form.PanelButtons/>
            </Form.Panel>
        )
    }

    renderContent() {
        return (
            <div className={styles.content}>
                Select (or create?) a typology somehow here.
            </div>
        )
    }
}

Typology.propTypes = {
    recipeId: PropTypes.string,
}

const valuesToModel = values => ({
    ...values
})

const modelToValues = (model = {}) => ({
    ...model
})

const policy = () => ({_: 'allow-then-deactivate'})

export default compose(
    Typology,
    form({fields}),
    initValues({
        getModel: props => RecipeState(props.recipeId)('model.typology'),
        getValues: props => RecipeState(props.recipeId)('ui.typology'),
        modelToValues,
        onInitialized: ({model, values, props}) =>
            RecipeActions(props.recipeId)
                .setTypology({values, model})
                .dispatch()
    }),
    activatable('typology', policy)
)

// export default activatable('typology', policy)(
//     initValues({
//         getModel: props => RecipeState(props.recipeId)('model.typology'),
//         getValues: props => RecipeState(props.recipeId)('ui.typology'),
//         modelToValues,
//         onInitialized: ({model, values, props}) =>
//             RecipeActions(props.recipeId)
//                 .setTypology({values, model})
//                 .dispatch()
//     })(
//         form({fields})(Typology)
//     )
// )
