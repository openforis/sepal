import React from 'react'

import {compose} from '~/compose'
import {toSafeString} from '~/string'
import {msg} from '~/translate'
import {withActivatable} from '~/widget/activation/activatable'
import {Form} from '~/widget/form'
import {withForm} from '~/widget/form/form'
import {Layout} from '~/widget/layout'
import {Panel} from '~/widget/panel/panel'

import {closeRecipe, saveRecipe} from './recipe'
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

class _SaveRecipe extends React.Component {
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
                type='modal'
                form={form}
                isActionForm={true}>
                <Panel.Header
                    icon='save'
                    title={msg('process.saveRecipe.title')}/>
                {this.renderPanel()}
            </Form.Panel>
        )
    }
}

const policy = () => ({
    _: 'allow'
})

export const SaveRecipe = compose(
    _SaveRecipe,
    withForm({fields, mapStateToProps}),
    withActivatable({id: 'saveRecipeDialog', policy})
)

SaveRecipe.propTypes = {}
