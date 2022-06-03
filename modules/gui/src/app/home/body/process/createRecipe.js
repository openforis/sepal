import {Button} from 'widget/button'
import {CrudItem} from 'widget/crudItem'
import {Layout} from 'widget/layout'
import {ListItem} from 'widget/listItem'
import {Panel} from 'widget/panel/panel'
import {compose} from 'compose'
import {connect, select} from 'store'
import {getRecipeType, listRecipeTypes} from './recipeTypes'
import {msg} from 'translate'
import {publishEvent} from 'eventPublisher'
import PropTypes from 'prop-types'
import React from 'react'
import actionBuilder from 'action-builder'
import moment from 'moment'
import styles from './createRecipe.module.css'

const mapStateToProps = state => {
    return {
        projectId: select('process.projectId'),
        panel: state.ui && state.ui.createRecipe,
        modal: state.ui && state.ui.modal
    }
}

export const showRecipeTypes = () =>
    actionBuilder('CREATE_RECIPE')
        .set('ui.createRecipe', 'SHOW_RECIPE_TYPES')
        .set('ui.modal', true)
        .dispatch()

export const closePanel = () =>
    actionBuilder('CREATE_RECIPE')
        .del('ui.createRecipe')
        .del('ui.modal')
        .dispatch()

const createRecipe = ({projectId, recipeId, type, tabPlaceholder}) => {
    publishEvent('create_recipe', {recipe_type: type})
    setTabType({projectId, recipeId, type, tabPlaceholder})
    closePanel()
}

const setTabType = ({projectId, recipeId, type, tabPlaceholder}) => {
    const placeholder = `${tabPlaceholder}_${moment().format('YYYY-MM-DD_HH-mm-ss')}`
    const recipe = {
        id: recipeId,
        projectId,
        type,
        placeholder,
        ui: {unsaved: true}
    }
    return actionBuilder('SET_TAB_TYPE', {projectId, recipeId, type, tabPlaceholder})
        .merge(['process.tabs', {id: recipeId}], {projectId, placeholder, type})
        .merge(['process.loadedRecipes', recipeId], recipe)
        .dispatch()
}

class _CreateRecipe extends React.Component {
    state = {
        selectedRecipeType: null
    }

    showRecipeTypeInfo(type) {
        this.setState({
            selectedRecipeType: type
        })
    }

    closePanel() {
        this.showRecipeTypeInfo()
        closePanel()
    }

    renderButton() {
        const {modal} = this.props
        return (
            <Button
                look='add'
                icon='plus'
                shape='pill'
                label='Add recipe'
                keybinding='Ctrl+n'
                onClick={() => showRecipeTypes()}
                tooltip={msg('process.recipe.newRecipe.tooltip')}
                tooltipPlacement='left'
                tooltipDisabled={modal}/>
        )
    }

    renderRecipeTypeInfo(type) {
        const recipeType = getRecipeType(type)
        const close = () => this.closePanel()
        const back = () => this.showRecipeTypeInfo()
        return (
            <React.Fragment>
                <Panel.Header
                    icon='book-open'
                    title={recipeType.name}>
                </Panel.Header>
                <Panel.Content>
                    {recipeType ? recipeType.details : null}
                </Panel.Content>
                <Panel.Buttons>
                    <Panel.Buttons.Main>
                        <Panel.Buttons.Close
                            keybinding={['Enter', 'Escape']}
                            onClick={close}
                        />
                    </Panel.Buttons.Main>
                    <Panel.Buttons.Extra>
                        <Panel.Buttons.Back
                            onClick={back}
                        />
                    </Panel.Buttons.Extra>
                </Panel.Buttons>
            </React.Fragment>
        )
    }

    renderRecipeTypes() {
        const {trigger} = this.props
        const close = () => this.closePanel()
        return (
            <React.Fragment>
                <Panel.Header
                    icon='book-open'
                    title={msg('process.recipe.newRecipe.title')}/>
                <Panel.Content>
                    <Layout type='vertical' spacing='tight'>
                        {listRecipeTypes().map(recipeType => this.renderRecipeType(recipeType))}
                    </Layout>
                </Panel.Content>
                <Panel.Buttons>
                    <Panel.Buttons.Main>
                        <Panel.Buttons.Close
                            hidden={trigger}
                            keybinding={['Enter', 'Escape']}
                            onClick={close}
                        />
                    </Panel.Buttons.Main>
                </Panel.Buttons>
            </React.Fragment>
        )
    }

    renderRecipeType(recipeType) {
        const {projectId, recipeId} = this.props
        return (
            <RecipeType
                key={recipeType.id}
                projectId={projectId}
                recipeId={recipeId}
                type={recipeType}
                onInfo={() => this.showRecipeTypeInfo(recipeType.id)}/>
        )
    }

    renderPanel() {
        const {selectedRecipeType} = this.state
        const {trigger} = this.props
        const modal = !trigger
        return (
            <Panel
                className={[styles.panel, modal ? styles.modal : null].join(' ')}
                type={modal ? 'modal' : 'center'}>
                {selectedRecipeType
                    ? this.renderRecipeTypeInfo(selectedRecipeType)
                    : this.renderRecipeTypes()}
            </Panel>
        )
    }

    render() {
        const {panel, trigger} = this.props
        return (
            <React.Fragment>
                {trigger ? null : this.renderButton()}
                {panel || trigger ? this.renderPanel() : null}
            </React.Fragment>
        )
    }
}

export const CreateRecipe = compose(
    _CreateRecipe,
    connect(mapStateToProps)
)

CreateRecipe.propTypes = {
    recipeId: PropTypes.string.isRequired,
    trigger: PropTypes.any
}

class RecipeType extends React.Component {
    render() {
        const {projectId, recipeId, type: {id: recipeTypeId, labels: {name, tabPlaceholder, creationDescription}, beta}} = this.props
        const title = beta
            ? <span>{name}<sup className={styles.beta}>Beta</sup></span>
            : name
        return (
            <ListItem
                key={recipeTypeId}
                onClick={() => createRecipe({projectId, recipeId, type: recipeTypeId, tabPlaceholder})}>
                <CrudItem
                    className={styles.recipe}
                    title={title}
                    description={creationDescription}
                />
            </ListItem>
        )
    }
}
