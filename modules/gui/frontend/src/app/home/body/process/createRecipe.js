import {Button} from 'widget/button'
import {Panel, PanelButtons, PanelContent, PanelHeader} from 'widget/panel'
import {Scrollable, ScrollableContainer} from 'widget/scrollable'
import {connect} from 'store'
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
                .set(['process', 'tabs', recipeIndex, 'placeholder'],
                    `${title.replace(/[^\w-.]/g, '_')}_${moment().format('YYYY-MM-DD_HH-mm-ss')}`
                )
        })
        .dispatch()

class CreateRecipe extends React.Component {
    state = {
        selectedRecipeType: null
    }

    showRecipeTypeInfo(type) {
        this.setState(prevState => ({
            ...prevState,
            selectedRecipeType: type
        }))
    }

    closePanel() {
        this.showRecipeTypeInfo()
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
                onClick={() => this.showRecipeTypeInfo()}/>
        )
    }

    renderRecipeTypeInfo(type) {
        const {recipeTypes} = this.props
        const recipeType = recipeTypes.find(recipeType => recipeType.type === type)
        return (
            <React.Fragment>
                <PanelHeader
                    icon='book-open'
                    title={recipeType.name}>
                </PanelHeader>
                <PanelContent>
                    <ScrollableContainer>
                        <Scrollable>
                            {recipeType ? recipeType.details : null}
                        </Scrollable>
                    </ScrollableContainer>
                </PanelContent>
                <PanelButtons>
                    <PanelButtons.Main>
                        <PanelButtons.Close
                            onClick={() => this.closePanel()}/>
                    </PanelButtons.Main>
                    <PanelButtons.Extra>
                        <PanelButtons.Back
                            onClick={() => this.showRecipeTypeInfo()}/>
                    </PanelButtons.Extra>
                </PanelButtons>
            </React.Fragment>
        )
    }

    renderRecipeTypes() {
        const {recipeId, recipeTypes, trigger} = this.props
        return (
            <React.Fragment>
                <PanelHeader
                    icon='book-open'
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
                                    onInfo={details ? () => this.showRecipeTypeInfo(type) : null}/>
                            )}
                        </ul>
                    </div>
                </PanelContent>
                <PanelButtons shown={!trigger}>
                    <PanelButtons.Main>
                        <PanelButtons.Close
                            onClick={() => this.closePanel()}/>
                    </PanelButtons.Main>
                </PanelButtons>
            </React.Fragment>
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
                shape='circle'
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
