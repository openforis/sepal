import {Form, form} from 'widget/form/form'
import {Layout} from 'widget/layout'
import {Panel} from 'widget/panel/panel'
import {closeRecipe, saveRecipe} from './recipe'
import {compose} from 'compose'
import {msg} from 'translate'
import {toSafeString} from 'string'
import {withActivatable} from 'widget/activation/activatable'
import React from 'react'
import styles from './saveRecipe.module.css'

const fields = {
    name: new Form.Field()
        .notBlank('process.saveRecipe.form.name.required'),
}

const mapStateToProps = (state, ownProps) => ({
    values: {
        name: ownProps.activatable.recipe.placeholder
    }
})

class SaveRecipe extends React.Component {
    saveRecipe() {
        const {inputs: {name}, activatable} = this.props
        const title = toSafeString(name.value)
        this.saveUpdatedRecipe({...activatable.recipe, title})
    }

    saveUpdatedRecipe(recipe) {
        const {onSave, activatable} = this.props
        saveRecipe(recipe)
        onSave && onSave(recipe)
        activatable.deactivate()
        if (activatable.closeTabOnSave) {
            closeRecipe(recipe.id)
        }
    }

    renderPanel() {
        const {form, inputs: {name}, activatable} = this.props
        const save = () => this.saveRecipe()
        const cancel = () => activatable.deactivate()
        return <React.Fragment>
            <Panel.Content>
                <Layout>
                    <Form.Input
                        label={msg('process.saveRecipe.form.name.label')}
                        autoFocus
                        input={name}
                        errorMessage
                    />
                </Layout>
            </Panel.Content>
            <Panel.Buttons>
                <Panel.Buttons.Main>
                    <Panel.Buttons.Cancel
                        keybinding='Escape'
                        onClick={cancel}/>
                    <Panel.Buttons.Save
                        disabled={form.isInvalid()}
                        keybinding='Enter'
                        onClick={save}/>
                </Panel.Buttons.Main>
            </Panel.Buttons>
        </React.Fragment>
    }

    render() {
        const {form} = this.props
        return (
            <Form.Panel
                className={styles.panel}
                form={form}
                isActionForm={true}
                modal>
                <Panel.Header
                    icon='save'
                    title={msg('process.saveRecipe.title')}/>
                {this.renderPanel()}
            </Form.Panel>
        )
    }
}

SaveRecipe.propTypes = {}

const policy = () => ({
    _: 'allow'
})

export default compose(
    SaveRecipe,
    form({fields, mapStateToProps}),
    withActivatable({id: 'saveRecipeDialog', policy})
)
