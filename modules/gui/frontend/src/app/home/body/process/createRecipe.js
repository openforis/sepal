import {Button} from 'widget/button'
import {Scrollable, ScrollableContainer} from 'widget/scrollable'
import {connect} from 'store'
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

    closePanel() {
        this.showRecipeType()
        closePanel()
    }

    renderButton() {
        const {modal} = this.props
        return (
            <div className={styles.bottomRight}>
                <Button
                    look='add'
                    size='xx-large'
                    icon='plus'
                    shape='circle'
                    // shape='pill'
                    // label='Create recipe'
                    onClick={() => showRecipeTypes()}
                    tooltip={'Create a new recipe'}
                    tooltipPlacement='left'
                    tooltipDisabled={modal}/>
            </div>
        )
    }

    renderBackButton() {
        return (
            <Button
                chromeless
                icon='arrow-left'
                shape='none'
                additionalClassName={styles.backButton}
                onClick={() => this.showRecipeType()}/>
        )
    }

    renderRecipeType(type) {
        const {recipeTypes} = this.props
        const recipeType = recipeTypes.find(recipeType => recipeType.type === type)
        return (
            <React.Fragment>
                <PanelHeader>
                    {this.renderBackButton()}
                    <span>{recipeType.name}</span>
                </PanelHeader>
                <PanelContent>
                    <ScrollableContainer>
                        <Scrollable>
                            {recipeType ? recipeType.details : null}
                        </Scrollable>
                    </ScrollableContainer>
                </PanelContent>
            </React.Fragment>
        )
    }

    renderRecipeTypes() {
        const {recipeId, recipeTypes} = this.props
        return (
            <React.Fragment>
                <PanelHeader
                    icon='plus-circle'
                    title={'Create recipe'}/>
                <PanelContent>
                    <div className={styles.recipeTypes}>
                        <ul>
                            {recipeTypes.map(({type, name, description, beta, details}) =>
                                <RecipeType
                                    key={type}
                                    recipeId={recipeId}
                                    type={type}
                                    name={name}
                                    description={description}
                                    beta={beta}
                                    onInfo={details ? () => this.showRecipeType(type) : null}/>
                            )}
                        </ul>
                    </div>
                </PanelContent>
            </React.Fragment>
        )
    }

    renderPanel() {
        const {selectedRecipeType} = this.state
        const {trigger} = this.props
        return (
            <Portal>
                <Panel
                    className={styles.panel}
                    statePath='createRecipe'
                    modal={!trigger}
                    onCancel={() => this.closePanel()}>
                    {selectedRecipeType ? this.renderRecipeType(selectedRecipeType) : this.renderRecipeTypes()}
                    {trigger ? null : <PanelButtons/>}
                </Panel>
            </Portal>
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
    recipeTypes: PropTypes.array.isRequired,
    trigger: PropTypes.any
}

export default connect(mapStateToProps)(CreateRecipe)

class RecipeType extends React.Component {
    renderInfoButton() {
        const {type, onInfo} = this.props
        return (
            <Button
                chromeless
                size='large'
                icon='info-circle'
                onClick={() => onInfo && onInfo(type)}
            />
        )
    }

    render() {
        const {recipeId, type, name, description, beta, onInfo} = this.props
        return (
            <li
                key={type}
                className={[styles.recipe, lookStyles.look, lookStyles.transparent].join(' ')}
                onClick={() => createRecipe(recipeId, type, name)}>
                <div className={styles.header}>
                    <div>
                        <div className='itemType'>
                            {name}
                            {beta ? <sup className={styles.beta}>Beta</sup> : null}
                        </div>
                        <div>{description}</div>
                    </div>
                    {onInfo ? this.renderInfoButton() : null}
                </div>
            </li>
        )
    }
}
