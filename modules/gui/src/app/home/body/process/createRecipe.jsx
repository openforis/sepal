import _ from 'lodash'
import memoizeOne from 'memoize-one'
import moment from 'moment'
import PropTypes from 'prop-types'
import React from 'react'

import {actionBuilder} from '~/action-builder'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {publishEvent} from '~/eventPublisher'
import {select} from '~/store'
import {simplifyString, splitString} from '~/string'
import {msg} from '~/translate'
import {Button} from '~/widget/button'
import {Buttons} from '~/widget/buttons'
import {CrudItem} from '~/widget/crudItem'
import {FastList} from '~/widget/fastList'
import {Layout} from '~/widget/layout'
import {ListItem} from '~/widget/listItem'
import {Panel} from '~/widget/panel/panel'
import {SearchBox} from '~/widget/searchBox'

import styles from './createRecipe.module.css'
import {getRecipeType} from './recipeTypeRegistry'

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

const getHighlightMatcher = memoizeOne(
    filterValues => filterValues.length
        ? new RegExp(`(?:${filterValues.join('|')})`, 'i')
        : ''
)

class _CreateRecipe extends React.Component {
    constructor(props) {
        super(props)
        this.createRecipe = this.createRecipe.bind(this)
        this.renderRecipeType = this.renderRecipeType.bind(this)
        this.closePanel = this.closePanel.bind(this)
        this.showRecipeTypeInfo = this.showRecipeTypeInfo.bind(this)
        this.renderRecipeType = this.renderRecipeType.bind(this)
        this.setTextFilter = this.setTextFilter.bind(this)
        this.setTagsFilter = this.setTagsFilter.bind(this)
    }

    state = {
        selectedRecipeType: null,
        textFilterValues: [],
        tagsFilter: []
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

    renderButton() {
        const {modal} = this.props
        return (
            <Button
                look='add'
                icon='plus'
                shape='pill'
                label='Add recipe'
                keybinding='Ctrl+n'
                onClick={showRecipeTypes}
                tooltip={msg('process.recipe.newRecipe.tooltip')}
                tooltipPlacement='left'
                tooltipDisabled={modal}/>
        )
    }

    renderPanel() {
        const {selectedRecipeType} = this.state
        return (
            <Panel className={styles.panel} type='modal'>
                {selectedRecipeType
                    ? this.renderRecipeTypeInfo(selectedRecipeType)
                    : this.renderRecipeTypeList()}
            </Panel>
        )
    }

    renderRecipeTypeInfo(type) {
        const recipeType = getRecipeType(type)
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
                            onClick={this.closePanel}
                        />
                    </Panel.Buttons.Main>
                    <Panel.Buttons.Extra>
                        <Panel.Buttons.Back
                            onClick={this.showRecipeTypeInfo}
                        />
                    </Panel.Buttons.Extra>
                </Panel.Buttons>
            </React.Fragment>
        )
    }

    renderRecipeTypeList() {
        const {textFilterValues} = this.state
        const recipeTypes = this.getFilteredRecipeTypes()
        const itemKey = recipeType => `${recipeType.id}|${this.getHighlightMatcher()}`
        return (
            <React.Fragment>
                <Panel.Header
                    icon='book-open'
                    title={msg('process.recipe.newRecipe.title')}/>
                <Panel.Content scrollable={false}>
                    {this.renderHeader()}
                    <FastList
                        items={recipeTypes}
                        itemKey={itemKey}
                        itemRenderer={this.renderRecipeType}
                        spacing='tight'
                        overflow={50}
                        onEnter={this.createRecipe}
                    />
                </Panel.Content>
                <Panel.Buttons>
                    <Panel.Buttons.Main>
                        <Panel.Buttons.Close
                            keybinding={textFilterValues.length ? null : ['Enter', 'Escape']}
                            onClick={this.closePanel}
                        />
                    </Panel.Buttons.Main>
                </Panel.Buttons>
            </React.Fragment>
        )
    }

    renderHeader() {
        return (
            <Layout
                className={styles.header}
                type='horizontal'
                spacing='compact'>
                {this.renderSearch()}
                {this.renderTagsFilter()}
            </Layout>
        )
    }

    renderSearch() {
        const {filterValue} = this.props
        return (
            <SearchBox
                value={filterValue}
                placeholder={msg('process.recipe.newRecipe.search.placeholder')}
                debounce={0}
                onSearchValue={this.setTextFilter}
            />
        )
    }

    renderTagsFilter() {
        const {tags, tagsFilter} = this.state

        const recipeOptions = tags?.map(tag => ({
            label: msg(`process.recipe.newRecipe.tags.${tag}`),
            value: tag
        }))

        const options = [{
            label: msg('process.recipe.newRecipe.tags.ALL'),
            // value: null,
            deselect: true
        }, ...recipeOptions]

        return (
            <Buttons
                chromeless
                layout='horizontal'
                spacing='tight'
                options={options}
                multiple
                selected={tagsFilter}
                onSelect={this.setTagsFilter}
            />
        )
    }

    renderRecipeType(recipeType, hovered) {
        const {projectId, recipeId} = this.props
        return (
            <RecipeType
                key={recipeType.id}
                projectId={projectId}
                recipeId={recipeId}
                type={recipeType}
                onInfo={() => this.showRecipeTypeInfo(recipeType.id)}
                beta={recipeType.beta}
                highlight={this.getHighlightMatcher()}
                hovered={hovered}
            />
        )
    }

    createRecipe(recipeType) {
        const {projectId, recipeId} = this.props
        createRecipe({projectId, recipeId, type: recipeType.id, tabPlaceholder: recipeType.labels.tabPlaceholder})
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

    setTextFilter(textFilterValue) {
        const textFilterValues = splitString(simplifyString(textFilterValue))
        this.setState({textFilterValues})
    }

    setTagsFilter(tagsFilter) {
        this.setState({tagsFilter})
    }

    getFilteredRecipeTypes() {
        const {recipeTypes} = this.props
        return _.chain(recipeTypes)
            .map(({id, labels, tags, beta}) => ({id, labels, tags, beta}))
            .filter(recipeType => this.recipeTypeMatchesFilters(recipeType))
            .value()
    }

    recipeTypeMatchesFilters(recipeType) {
        return this.recipeTypeMatchesFilterValues(recipeType)
            && this.recipeTypeMatchesTags(recipeType)
    }

    recipeTypeMatchesFilterValues(recipeType) {
        const {textFilterValues} = this.state
        const searchMatchers = textFilterValues.map(filter => RegExp(filter, 'i'))
        const searchProperties = ['labels.name', 'labels.creationDescription']
        return textFilterValues
            ? _.every(searchMatchers, matcher =>
                _.find(searchProperties, property =>
                    matcher.test(simplifyString(_.get(recipeType, property)))
                )
            )
            : true
    }

    recipeTypeMatchesTags(recipeType) {
        const {tagsFilter} = this.state
        return _.every(tagsFilter, tag => recipeType?.tags?.includes(tag))
    }

    getHighlightMatcher() {
        const {textFilterValues} = this.state
        return getHighlightMatcher(textFilterValues)
    }

    updateTags() {
        const {recipeTypes} = this.props
        const tags = _.chain(recipeTypes)
            .map(({tags}) => tags)
            .flatten()
            .uniq()
            .compact()
            .value()
        this.setState({tags})
    }

    componentDidMount() {
        this.updateTags()
    }

    componentDidUpdate({recipeTypes: prevRecipeTypes}) {
        const {recipeTypes} = this.props
        if (!_.isEqual(recipeTypes, prevRecipeTypes)) {
            this.updateTags()
        }
    }
}

export const CreateRecipe = compose(
    _CreateRecipe,
    connect(mapStateToProps)
)

CreateRecipe.propTypes = {
    recipeId: PropTypes.string.isRequired,
    recipeTypes: PropTypes.array.isRequired
}

class RecipeType extends React.Component {
    constructor(props) {
        super(props)
        this.createRecipe = this.createRecipe.bind(this)
    }
    
    render() {
        const {type: {id: recipeTypeId, labels: {name, creationDescription}, beta}, highlight, hovered} = this.props
        const title = beta
            ? <span>{name}<sup className={styles.beta}>Beta</sup></span>
            : name
        return (
            <ListItem
                key={recipeTypeId}
                hovered={hovered}
                onClick={this.createRecipe}>
                <CrudItem
                    className={styles.recipe}
                    title={title}
                    description={creationDescription}
                    highlight={highlight}
                />
            </ListItem>
        )
    }

    createRecipe() {
        const {projectId, recipeId, type: {id: recipeTypeId, labels: {tabPlaceholder}}} = this.props
        createRecipe({projectId, recipeId, type: recipeTypeId, tabPlaceholder})
    }
}
