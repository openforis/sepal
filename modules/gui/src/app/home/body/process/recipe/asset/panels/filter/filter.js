import {CrudItem} from 'widget/crudItem'
import {Form} from 'widget/form/form'
import {ImageConstraints, renderConstraintsDescription} from 'widget/imageConstraints/imageConstraints'
import {Layout} from 'widget/layout'
import {ListItem} from 'widget/listItem'
import {NoData} from 'widget/noData'
import {Panel} from 'widget/panel/panel'
import {RecipeActions} from '../../assetRecipe'
import {RecipeFormPanel, recipeFormPanel} from 'app/home/body/process/recipeFormPanel'
import {compose} from 'compose'
import {msg} from 'translate'
import {selectFrom} from 'stateUtils'
import {withActivators} from 'widget/activation/activator'
import React from 'react'
import guid from 'guid'
import styles from './filter.module.css'

const mapRecipeToProps = recipe => ({
    filtersEntries: selectFrom(recipe, 'model.filter.filtersEntries') || [],
    firstImageProperties: selectFrom(recipe, 'model.assetDetails.metadata.properties')
})

class Filter extends React.Component {
    state = {
        selectedFiltersEntry: {id: undefined, booleanOperator: undefined, constraints: undefined}
    }

    constructor(props) {
        super(props)
        this.saveFiltersEntry = this.saveFiltersEntry.bind(this)
    }

    render() {
        const {firstImageProperties} = this.props
        const {selectedFiltersEntry: {id, booleanOperator, constraints}} = this.state
        return (
            <React.Fragment>
                <RecipeFormPanel
                    className={styles.panel}
                    placement='bottom-right'>
                    <Panel.Header
                        icon='filter'
                        title={msg('process.asset.panel.filter.title')}/>
                    <Panel.Content>
                        {this.renderContent()}
                    </Panel.Content>
                    <Form.PanelButtons>
                        <Panel.Buttons.Add onClick={() => this.addFilters()}/>
                    </Form.PanelButtons>
                </RecipeFormPanel>
                <FiltersPanel
                    id={'filters'}
                    properties={toProperties(firstImageProperties)}
                    constraintsId={id}
                    constraints={constraints}
                    booleanOperator={booleanOperator}
                    onChange={this.saveFiltersEntry}
                />
            </React.Fragment>
        )
    }

    renderContent() {
        const {filtersEntries = []} = this.props
        return filtersEntries.length
            ? this.renderFiltersEntries(filtersEntries)
            : this.renderNoFiltersMessage()
    }

    renderFiltersEntries(filtersEntries) {
        return (
            <Layout type='vertical' spacing='tight'>
                {filtersEntries.map(filtersEntry => this.renderFilters(filtersEntry))}
            </Layout>
        )
    }

    renderFilters(filtersEntry) {
        return (
            <ListItem
                key={filtersEntry.id}
                onClick={() => this.editFiltersEntry(filtersEntry)}>
                    
                <CrudItem
                    description={renderConstraintsDescription(filtersEntry)}
                    removeTooltip={msg('process.asset.panel.filter.remove.tooltip')}
                    onRemove={() => this.removeFiltersEntry(filtersEntry)}
                />
            </ListItem>
        )
    }

    renderNoFiltersMessage() {
        return (
            <NoData message={msg('process.asset.panel.filter.noFilters')}/>
        )
    }

    addFilters() {
        const {activator: {activatables: {filters}}} = this.props
        this.setState(
            {selectedFiltersEntry: {id: guid(), booleanOperator: 'or', filters: undefined}},
            () => filters.activate()
        )
    }

    editFiltersEntry(filtersEntry) {
        const {activator: {activatables: {filters}}} = this.props
        this.setState({selectedFiltersEntry: filtersEntry})
        filters.activate()
    }

    removeFiltersEntry(filtersEntryToRemove) {
        const {recipeId} = this.props
        RecipeActions(recipeId).removeFiltersEntry(filtersEntryToRemove.id)
    }

    saveFiltersEntry(filtersEntry) {
        const {recipeId, filtersEntries} = this.props
        const updating = filtersEntries.find(({id}) => id === filtersEntry.id)
        updating
            ? RecipeActions(recipeId).updateFiltersEntry(filtersEntry)
            : RecipeActions(recipeId).createFiltersEntry(filtersEntry)
    }

}

const toImages = ({properties}) => [
    {
        id: 'this-recipe',
        description: 'This recipe',
        properties
    }
]

const toProperties = p =>
    Object.keys(p)
        .map(name => ({
            name, type: typeof p[name]
        }))
        .filter(({type}) => ['string', 'number'].includes(type))

const FiltersPanel = ({id, properties, constraintsId, constraints, booleanOperator, onChange}) =>
    <ImageConstraints
        id={id}
        title={msg('process.asset.panel.filter.filters.title')}
        images={toImages({properties})}
        constraintsId={constraintsId}
        constraints={constraints}
        booleanOperator={booleanOperator}
        applyOn={'properties'}
        onChange={onChange}
    />

Filter.propTypes = {}
const additionalPolicy = () => ({_: 'allow'})
// [HACK] This actually isn't a form, and we don't want to update the model. This prevents the selected images from
// being overridden.
const valuesToModel = null

export default compose(
    Filter,
    recipeFormPanel({id: 'filter', mapRecipeToProps, valuesToModel, additionalPolicy}),
    withActivators(['filters'])
)
