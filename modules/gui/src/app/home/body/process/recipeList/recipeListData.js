import {Button} from 'widget/button'
import {ButtonGroup} from 'widget/buttonGroup'
import {CenteredProgress} from 'widget/progress'
import {CheckButton} from 'widget/checkButton'
import {Combo} from 'widget/combo'
import {CrudItem} from 'widget/crudItem'
import {Layout} from 'widget/layout'
import {ListItem} from 'widget/listItem'
import {Pageable} from 'widget/pageable/pageable'
import {ProjectsButton} from './projects'
import {ScrollableContainer, Unscrollable} from 'widget/scrollable'
import {SearchBox} from 'widget/searchBox'
import {compose} from 'compose'
import {getRecipeType} from '../recipeTypes'
import {msg} from 'translate'
import {withRecipeListContext} from './recipeListContext'
import ButtonPopup from 'widget/buttonPopup'
import Confirm from 'widget/confirm'
import PropTypes from 'prop-types'
import React from 'react'
import RemoveButton from 'widget/removeButton'
import styles from './recipeListData.module.css'

class _RecipeListData extends React.Component {
    state = {
        edit: false,
        move: false
    }

    setEdit(edit) {
        this.setState({edit})
    }

    setMove(move) {
        this.setState({move})
    }

    render() {
        const {recipeListContext: {isLoading}} = this.props
        return isLoading()
            ? this.renderProgress()
            : this.renderData()
    }

    renderProgress() {
        return <CenteredProgress title={msg('process.recipe.loading')}/>
    }

    renderData() {
        const {recipeListContext: {hasData, highlightMatcher}} = this.props
        const {move} = this.state
        return hasData()
            ? (
                <ScrollableContainer>
                    <Unscrollable>
                        {this.renderHeader()}
                    </Unscrollable>
                    <Unscrollable className={styles.recipes}>
                        <Pageable.Data
                            itemKey={recipe => `${recipe.id}|${highlightMatcher}`}>
                            {recipe => this.renderRecipe(recipe, highlightMatcher)}
                        </Pageable.Data>
                        {move && this.renderMoveConfirmation()}
                    </Unscrollable>
                </ScrollableContainer>
            )
            : null
    }

    renderHeader() {
        return (
            <Layout type='horizontal' spacing='compact' className={styles.header}>
                <ProjectsButton/>
                {this.renderSearch()}
                {this.renderEditButtons()}
                <Layout.Spacer/>
                {this.renderSortButtons()}
            </Layout>
        )
    }

    renderSearch() {
        const {recipeListContext: {setFilter}} = this.props
        return (
            <SearchBox
                placeholder={msg('process.menu.searchRecipes')}
                onSearchValue={searchValue => setFilter(searchValue)}
            />
        )
    }

    renderEditButtons() {
        const {edit} = this.state
        return edit
            ? this.renderActionButtons()
            : (
                <Button
                    icon='pen-to-square'
                    label='Edit'
                    shape='pill'
                    onClick={() => this.setEdit(true)}
                />
            )
    }

    renderActionButtons() {
        return (
            <ButtonGroup spacing='none'>
                {this.renderSelectButton()}
                {this.renderMoveButton()}
                {this.renderRemoveButton()}
                {this.renderExitButton()}
            </ButtonGroup>
        )
    }

    renderSelectButton() {
        const {recipeListContext: {isSelected, toggleAll}} = this.props
        const selected = isSelected()
        return (
            <CheckButton
                shape='pill'
                label='Select'
                checked={selected}
                tooltip={selected ? 'Deselect all recipes' : 'Select all recipes'}
                onToggle={toggleAll}/>
        )
    }

    renderMoveButton() {
        const {recipeListContext: {isSelected, moveSelected}} = this.props
        return moveSelected && (
            <ButtonPopup
                shape='pill'
                icon='shuffle'
                label='Move'
                placement='below'
                alignment='left'
                disabled={!isSelected()}
                tooltip='Move selected recipes to project'>
                {onBlur => (
                    <Combo
                        placement='below'
                        alignment='left'
                        placeholder='Destination project'
                        options={this.getDestinations()}
                        standalone
                        autoFocus
                        onCancel={onBlur}
                        onChange={option => {
                            this.setMove(option)
                            onBlur()
                        }}
                    />
                )}
            </ButtonPopup>
        )
    }

    renderMoveConfirmation() {
        const {recipeListContext: {isSelected, moveSelected}} = this.props
        const {move: {value: projectId, label: projectName}} = this.state
        return moveSelected && (
            <Confirm
                title={'Move recipes'}
                message={`Move ${isSelected()} recipes to project ${projectName}?`}
                onConfirm={() => {
                    this.setMove(false)
                    moveSelected(projectId)
                }}
                onCancel={() => this.setMove(false)}
            />
        )
    }

    renderRemoveButton() {
        const {recipeListContext: {isSelected, removeSelected}} = this.props
        return removeSelected && (
            <RemoveButton
                shape='pill'
                icon='trash'
                label='Remove'
                tooltip='Remove selected recipes'
                message={`Remove ${isSelected()} recipes?`}
                disabled={!isSelected()}
                onRemove={removeSelected}/>
        )
    }

    renderExitButton() {
        return (
            <Button
                icon='times'
                label='Exit'
                shape='pill'
                keybinding='Escape'
                onClick={() => this.setEdit(false)}
            />
        )
    }

    getDestinations() {
        const {recipeListContext: {projects}} = this.props
        return projects.map(({id, name}) => ({value: id, label: name}))
    }

    renderSortButtons() {
        return (
            <ButtonGroup layout='horizontal-nowrap' spacing='tight'>
                {this.renderSortButton('updateTime', msg('process.recipe.lastUpdate'))}
                {this.renderSortButton('name', msg('process.recipe.name'))}
            </ButtonGroup>
        )
    }

    renderSortButton(column, label) {
        const {recipeListContext: {sortingOrder, sortingDirection, setSorting}} = this.props
        return (
            <Button
                chromeless
                look='transparent'
                shape='pill'
                label={label}
                labelStyle={sortingOrder === column ? 'smallcaps-highlight' : 'smallcaps'}
                icon={this.getHandleIcon({column, sortingOrder, sortingDirection})}
                iconPlacement='right'
                onClick={() => setSorting(column)}/>
        )
    }

    getHandleIcon({column, sortingOrder, sortingDirection}) {
        const sorted = sortingOrder === column
        return sorted
            ? sortingDirection === 1
                ? 'sort-down'
                : 'sort-up'
            : 'sort'
    }

    renderRecipe(recipe, highlightMatcher) {
        const {onClick, onDuplicate, onRemove, recipeListContext: {isSelected, toggleOne}} = this.props
        const {edit} = this.state
        const project = recipe.project || 'ungrouped'
        const name = recipe.name
        const path = `${project} / ${name}`
        return (
            <ListItem
                key={recipe.id}
                onClick={onClick ? () => onClick(recipe.id) : null}>
                <CrudItem
                    title={this.getRecipeTypeName(recipe.type)}
                    description={path}
                    timestamp={recipe.updateTime}
                    highlight={highlightMatcher}
                    highlightTitle={false}
                    duplicateTooltip={msg('process.menu.duplicateRecipe.tooltip')}
                    removeTooltip={msg('process.menu.removeRecipe.tooltip')}
                    selectTooltip={msg('process.menu.selectRecipe.tooltip')}
                    selected={isSelected(recipe.id)}
                    onDuplicate={onDuplicate ? () => onDuplicate(recipe.id) : null}
                    onRemove={onRemove ? () => onRemove(recipe.id, recipe.type) : null}
                    onSelect={(edit && toggleOne) ? () => toggleOne(recipe.id) : null}
                />
            </ListItem>
        )
    }

    getRecipeTypeName(type) {
        const recipeType = getRecipeType(type)
        return recipeType && recipeType.labels.name
    }
}

export const RecipeListData = compose(
    _RecipeListData,
    withRecipeListContext()
)

RecipeListData.propTypes = {
    onClick: PropTypes.func,
    onDuplicate: PropTypes.func,
    onRemove: PropTypes.func,
    onSelect: PropTypes.func
}
