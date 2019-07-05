import {Form, form} from 'widget/form/form'
import {Layout} from 'widget/layout'
import {Panel} from 'widget/panel/panel'
import {activatable} from 'widget/activation/activatable'
import {closeRecipe} from './recipe'
import {compose} from 'compose'
import {msg} from 'translate'
import {saveRecipe} from './recipe'
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
        this.saveUpdatedRecipe({...activatable.recipe, title: name.value})
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
            <Panel.Buttons onEnter={save} onEscape={cancel}>
                <Panel.Buttons.Main>
                    <Panel.Buttons.Cancel onClick={cancel}/>
                    <Panel.Buttons.Save
                        disabled={form.isInvalid()}
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
                modal
                close={() => this.close()}>
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
    activatable({id: 'saveRecipeDialog', policy})
)
