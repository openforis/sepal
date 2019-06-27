import {Button} from 'widget/button'
import {Panel, PanelButtons, PanelContent, PanelHeader} from 'widget/panel'
import {SuperButton} from 'widget/superButton'
import {compose} from 'compose'
import {connect} from 'store'
import {getRecipeType, listRecipeTypes} from './recipeTypes'
import {msg} from 'translate'
import Keybinding from 'widget/keybinding'
import PropTypes from 'prop-types'
import React from 'react'
import actionBuilder from 'action-builder'
import moment from 'moment'
import styles from './createRecipe.module.css'

const mapStateToProps = state => {
    return {
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

const createRecipe = (recipeId, type, tabPlaceholder) => {
    setTabType(recipeId, type, tabPlaceholder)
    closePanel()
}

const setTabType = (recipeId, type, tabPlaceholder) =>
    actionBuilder('SET_TAB_TYPE')
        .merge(['process.tabs', {id: recipeId}], {
            type,
            placeholder: `${tabPlaceholder}_${moment().format('YYYY-MM-DD_HH-mm-ss')}`,
            ui: {unsaved: true}
        })
        .dispatch()

class CreateRecipe extends React.Component {
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
            <div className={styles.createButton}>
                <Keybinding keymap={{'Ctrl+n': () => showRecipeTypes()}}>
                    <Button
                        look='add'
                        size='xx-large'
                        icon='plus'
                        shape='circle'
                        onClick={() => showRecipeTypes()}
                        tooltip={msg('process.recipe.newRecipe.tooltip')}
                        tooltipPlacement='left'
                        tooltipDisabled={modal}/>
                </Keybinding>
            </div>
        )
    }

    renderRecipeTypeInfo(type) {
        const recipeType = getRecipeType(type)
        const close = () => this.closePanel()
        const back = () => this.showRecipeTypeInfo()
        return (
            <React.Fragment>
                <PanelHeader
                    icon='book-open'
                    title={recipeType.name}>
                </PanelHeader>
                <PanelContent>
                    {recipeType ? recipeType.details : null}
                </PanelContent>
                <PanelButtons onEnter={close} onEscape={close}>
                    <PanelButtons.Main>
                        <PanelButtons.Close onClick={close}/>
                    </PanelButtons.Main>
                    <PanelButtons.Extra>
                        <PanelButtons.Back onClick={back}/>
                    </PanelButtons.Extra>
                </PanelButtons>
            </React.Fragment>
        )
    }

    renderRecipeTypes() {
        const {trigger} = this.props
        const close = () => this.closePanel()
        return (
            <React.Fragment>
                <PanelHeader
                    icon='book-open'
                    title={msg('process.recipe.newRecipe.title')}/>
                <PanelContent>
                    {listRecipeTypes().map(recipeType => this.renderRecipeType(recipeType))}
                </PanelContent>
                <PanelButtons shown={!trigger} onEnter={close} onEscape={close}>
                    <PanelButtons.Main>
                        <PanelButtons.Close onClick={close}/>
                    </PanelButtons.Main>
                </PanelButtons>
            </React.Fragment>
        )
    }

    renderRecipeType(recipeType) {
        const {recipeId} = this.props
        return (
            <RecipeType
                key={recipeType.id}
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

CreateRecipe.propTypes = {
    recipeId: PropTypes.string.isRequired,
    trigger: PropTypes.any
}

export default compose(
    CreateRecipe,
    connect(mapStateToProps)
)

class RecipeType extends React.Component {
    render() {
        const {recipeId, type: {id, labels: {name, tabPlaceholder, creationDescription}, beta, details}, onInfo} = this.props
        const title = beta
            ? <span>{name}<sup className={styles.beta}>Beta</sup></span>
            : name
        return (
            <SuperButton
                key={id}
                className={styles.recipe}
                title={title}
                description={creationDescription}
                onClick={() => createRecipe(recipeId, id, tabPlaceholder)}
                onInfo={() => details && onInfo && onInfo(id)}
            />
        )
    }
}
