import {Field, FieldSet, Input, form} from 'widget/form'
import {PanelButtons, PanelContent, PanelHeader} from 'widget/panel'
import {activatable} from 'widget/activation/activatable'
import {closeRecipe} from './recipe'
import {compose} from 'compose'
import {msg} from 'translate'
import {saveRecipe} from './recipe'
import FormPanel from 'widget/formPanel'
import React from 'react'
import styles from './saveRecipe.module.css'

const fields = {
    name: new Field()
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
            <PanelContent>
                <FieldSet>
                    <Input
                        label={msg('process.saveRecipe.form.name.label')}
                        autoFocus
                        input={name}
                        errorMessage
                    />
                </FieldSet>
            </PanelContent>
            <PanelButtons onEnter={save} onEscape={cancel}>
                <PanelButtons.Main>
                    <PanelButtons.Cancel onClick={cancel}/>
                    <PanelButtons.Save
                        disabled={form.isInvalid()}
                        onClick={save}/>
                </PanelButtons.Main>
            </PanelButtons>
        </React.Fragment>
    }

    render() {
        const {form} = this.props
        return (
            <FormPanel
                className={styles.panel}
                form={form}
                isActionForm={true}
                modal
                close={() => this.close()}>
                <PanelHeader
                    icon='save'
                    title={msg('process.saveRecipe.title')}/>
                {this.renderPanel()}
            </FormPanel>
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
