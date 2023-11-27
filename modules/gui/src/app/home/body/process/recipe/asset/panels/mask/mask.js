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
import styles from './mask.module.css'

const mapRecipeToProps = recipe => ({
    constraintsEntries: selectFrom(recipe, 'model.mask.constraintsEntries') || [],
    assetDetails: selectFrom(recipe, 'model.assetDetails')
})

class Mask extends React.Component {
    state = {
        selectedConstraintsEntry: {id: undefined, booleanOperator: undefined, constraints: undefined}
    }

    constructor(props) {
        super(props)
        this.saveConstraintsEntry = this.saveConstraintsEntry.bind(this)
    }

    render() {
        const {assetDetails: {bands, visualizations = []}} = this.props
        const {selectedConstraintsEntry: {id, booleanOperator, constraints}} = this.state
        return (
            <React.Fragment>
                <RecipeFormPanel
                    className={styles.panel}
                    placement='bottom-right'>
                    <Panel.Header
                        icon='map'
                        title={msg('process.asset.panel.mask.title')}/>
                    <Panel.Content>
                        {this.renderContent()}
                    </Panel.Content>
                    <Form.PanelButtons>
                        <Panel.Buttons.Add onClick={() => this.addConstraints()}/>
                    </Form.PanelButtons>
                </RecipeFormPanel>
                <ConstraintsPanel
                    id={'constraints'}
                    bands={bands}
                    visualizations={visualizations}
                    constraintsId={id}
                    constraints={constraints}
                    booleanOperator={booleanOperator}
                    onChange={this.saveConstraintsEntry}
                />
            </React.Fragment>
        )
    }

    renderContent() {
        const {constraintsEntries = []} = this.props
        return constraintsEntries.length
            ? this.renderConstraintsEntries(constraintsEntries)
            : this.renderNoConstraintsMessage()
    }

    renderConstraintsEntries(constraintsEntries) {
        return (
            <Layout type='vertical' spacing='tight'>
                {constraintsEntries.map(constraintsEntry => this.renderConstraints(constraintsEntry))}
            </Layout>
        )
    }

    renderConstraints(constraintsEntry) {
        return (
            <ListItem
                key={constraintsEntry.id}
                onClick={() => this.editConstraintsEntry(constraintsEntry)}>
                    
                <CrudItem
                    description={renderConstraintsDescription(constraintsEntry)}
                    removeTooltip={msg('process.asset.panel.mask.remove.tooltip')}
                    onRemove={() => this.removeConstraintsEntry(constraintsEntry)}
                />
            </ListItem>
        )
    }

    renderNoConstraintsMessage() {
        return (
            <NoData message={msg('process.asset.panel.mask.noConstraints')}/>
        )
    }

    addConstraints() {
        const {activator: {activatables: {constraints}}} = this.props
        this.setState(
            {selectedConstraintsEntry: {id: guid(), booleanOperator: 'or', constraints: undefined}},
            () => constraints.activate()
        )
    }

    editConstraintsEntry(constraintsEntry) {
        const {activator: {activatables: {constraints}}} = this.props
        this.setState({selectedConstraintsEntry: constraintsEntry})
        constraints.activate()
    }

    removeConstraintsEntry(constraintsEntryToRemove) {
        const {recipeId} = this.props
        RecipeActions(recipeId).removeConstraintsEntry(constraintsEntryToRemove.id)
    }

    saveConstraintsEntry(constraintsEntry) {
        const {recipeId, constraintsEntries} = this.props
        const updating = constraintsEntries.find(({id}) => id === constraintsEntry.id)
        updating
            ? RecipeActions(recipeId).updateConstraintsEntry(constraintsEntry)
            : RecipeActions(recipeId).createConstraintsEntry(constraintsEntry)
    }

}

const toImages = ({bands, visualizations}) => {
    const toLegendEntries = visParams =>
        visParams.values.map((value, i) => ({
            color: visParams.palette[i],
            value,
            label: visParams.labels[i]
        }))
    const imageBands = bands.map(({id: name}) => {
        const categoricalVisParams = visualizations
            .find(visParams => {
                return visParams.bands.length === 1
                    && visParams.bands[0] === name
                    && visParams.type === 'categorical'
            })
        const type = categoricalVisParams ? 'categorical' : 'continuous'
        const additional = type === 'categorical'
            ? {legendEntries: toLegendEntries(categoricalVisParams)}
            : {}
        return {name, type, ...additional}
    })
    return [
        {
            id: 'this-recipe',
            description: 'This recipe',
            bands: imageBands
        }
    ]
}

const ConstraintsPanel = ({id, bands, visualizations, constraintsId, constraints, booleanOperator, onChange}) =>
    <ImageConstraints
        id={id}
        title={msg('process.asset.panel.mask.constraints.title')}
        images={toImages({bands, visualizations})}
        constraintsId={constraintsId}
        constraints={constraints}
        booleanOperator={booleanOperator}
        applyOn={'bands'}
        onChange={onChange}
    />

Mask.propTypes = {}
const additionalPolicy = () => ({_: 'allow'})
// [HACK] This actually isn't a form, and we don't want to update the model. This prevents the selected images from
// being overridden.
const valuesToModel = null

export default compose(
    Mask,
    recipeFormPanel({id: 'mask', mapRecipeToProps, valuesToModel, additionalPolicy}),
    withActivators(['constraints'])
)
