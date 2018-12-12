import {Button} from 'widget/button'
import {connect} from 'store'
import {msg} from 'translate'
import Panel, {PanelContent, PanelHeader} from 'widget/panel'
import PanelButtons from 'widget/panelButtons'
import Portal from 'widget/portal'
import PropTypes from 'prop-types'
import React from 'react'
import actionBuilder from 'action-builder'
import lookStyles from 'style/look.module.css'
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

// export const showRecipeType = type =>
//     actionBuilder('CREATE_RECIPE')
//         .set('ui.createRecipe', type)
//         .set('ui.modal', true)
//         .dispatch()

export const closePanel = () =>
    actionBuilder('CREATE_RECIPE')
        .del('ui.createRecipe')
        .del('ui.modal')
        .dispatch()

const createRecipe = (recipeId, type, title) => {
    setTabType(recipeId, type, title)
    closePanel()
}
    
const setTabType = (recipeId, type, title) =>
    actionBuilder('SET_TAB_TYPE')
        .withState('process.tabs', (recipes, stateBuilder) => {
            const recipeIndex = recipes.findIndex(recipe => recipe.id === recipeId)
            if (recipeIndex === -1)
                throw new Error('Unable to create recipe')
            return stateBuilder
                .set(['process', 'tabs', recipeIndex, 'type'], type)
                .set(['process', 'tabs', recipeIndex, 'placeholder'], `${title.replace(/[^\w-.]/g, '_')}_${moment().format('YYYY-MM-DD_HH-mm-ss')}`)
        })
        .dispatch()
    
class CreateRecipe extends React.Component {
    state = {
        selectedRecipeType: null
    }

    showRecipeType(type) {
        this.setState(prevState => ({
            ...prevState,
            selectedRecipeType: type
        }))
    }

    renderButton() {
        const {modal} = this.props
        return (
            <Button
                look='add'
                size='large'
                icon='plus-circle'
                shape='pill'
                label='Create recipe'
                onClick={() => showRecipeTypes()}
                tooltip={'Create a new recipe'}
                tooltipPlacement='top'
                tooltipDisabled={modal}/>
        )
    }

    renderRecipeTypesPanel() {
        return (
            <Portal>
                <Panel
                    className={styles.panel}
                    statePath='createRecipe'
                    center
                    modal
                    onCancel={() => closePanel()}>
                    <PanelHeader
                        icon='book-open'
                        title={'Available recipe types'}/>
                    <PanelContent>
                        {this.renderRecipeTypes()}
                    </PanelContent>
                    <PanelButtons/>
                </Panel>
            </Portal>
        )
    }

    renderRecipeType(recipeId, type, label) {
        return (
            <li
                key={type}
                className={[styles.recipe, lookStyles.look, lookStyles.transparent].join(' ')}
                onClick={() => createRecipe(recipeId, type, label)}>
                <div className={styles.header}>
                    <div>{label}</div>
                    <Button
                        chromeless
                        size='large'
                        icon='info-circle'
                        onClick={() => this.showRecipeType(type)}
                    />
                </div>
            </li>
        )
    }

    renderRecipeTypes() {
        const {recipeId} = this.props
        return (
            <div className={styles.recipeTypes}>
                <ul>
                    {this.renderRecipeType(recipeId, 'MOSAIC', msg('process.mosaic.create'))}
                    {this.renderRecipeType(recipeId, 'CLASSIFICATION', msg('process.classification.create'))}
                    {this.renderRecipeType(recipeId, 'CHANGE_DETECTION', msg('process.changeDetection.create'))}
                    {this.renderRecipeType(recipeId, 'TIME_SERIES', msg('process.timeSeries.create'))}
                    {this.renderRecipeType(recipeId, 'LAND_COVER', msg('process.landCover.create'))}
                </ul>
            </div>
        )
    }

    renderRecipeTypePanel(recipeType) {
        return (
            <Portal>
                <Panel
                    className={styles.panel}
                    statePath='createRecipe'
                    center
                    modal
                    onCancel={() => this.showRecipeType()}>
                    <PanelHeader
                        icon='book-open'
                        title={'Recipe type details'}/>
                    <PanelContent>
                        Details here
                    </PanelContent>
                    <PanelButtons/>
                </Panel>
            </Portal>
        )
    }

    renderPanel() {
        const {selectedRecipeType} = this.state
        return selectedRecipeType
            ? this.renderRecipeTypePanel(selectedRecipeType)
            : this.renderRecipeTypesPanel()
    }

    render() {
        const {panel} = this.props
        return (
            <React.Fragment>
                {this.renderButton()}
                {panel ? this.renderPanel() : null}
            </React.Fragment>
        )
    }
}

CreateRecipe.propTypes = {
    recipeId: PropTypes.string.isRequired
}

export default connect(mapStateToProps)(CreateRecipe)
