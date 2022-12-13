import {CrudItem} from 'widget/crudItem'
import {Form} from 'widget/form/form'
import {ImageConstraints} from 'widget/imageConstraints/imageConstraints'
import {LegendItem} from 'widget/legend/legendItem'
import {ListItem} from 'widget/listItem'
import {NoData} from 'widget/noData'
import {Panel} from 'widget/panel/panel'
import {RecipeFormPanel, recipeFormPanel} from 'app/home/body/process/recipeFormPanel'
import {compose} from 'compose'
import {msg} from 'translate'
import {selectFrom} from 'stateUtils'
import {withActivator} from 'widget/activation/activator'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import styles from './mapping.module.css'

const mapRecipeToProps = recipe => ({
    legendEntries: selectFrom(recipe, 'model.legend.entries') || []
})

class _Mapping extends React.Component {
    state = {colorMode: 'palette'}

    render() {
        return (
            <RecipeFormPanel
                placement='bottom-right'
                className={styles.panel}>
                <Panel.Header
                    icon='list'
                    title={msg('process.indexChange.panel.mapping.title')}
                />

                <Panel.Content>
                    {this.renderContent()}
                </Panel.Content>

                <Form.PanelButtons/>
            </RecipeFormPanel>
        )
    }

    renderContent() {
        const {legendEntries} = this.props
        return (
            <div>
                {legendEntries.map(entry => this.renderEntryMapping(entry))}
            </div>
        )
    }

    onClick() {

    }

    renderEntryMapping(entry) {
        const {activator: {activatables}} = this.props
        const onClick = () => activatables[`entryMapping-${entry.id}}`].activate()
        return (
            <ListItem
                key={entry.id}
                onClick={onClick}
                expansion={this.renderMappingOverview(entry)}
                expansionClickable
                expanded>
                <CrudItem
                    content={
                        <LegendItem
                            color={entry.color}
                            value={entry.value}
                            label={entry.label}
                            onClick={onClick}
                        />
                    }/>
            </ListItem>
        )
    }

    renderMappingOverview({id, color, value, label, constraints = [], booleanOperator}) {
        const images = [
            {
                id: 'this-recipe',
                description: 'This recipe',
                bands: [
                    {name: 'difference', type: 'continuous'},
                    {name: 'normalized_difference', type: 'continuous'},
                    {name: 'ratio', type: 'continuous'},
                ]
            }
        ]
        return (
            <React.Fragment>
                <ImageConstraints
                    id={`entryMapping-${id}}`}
                    title={
                        <LegendItem
                            color={color}
                            label={label}
                            value={value}
                        />
                    }
                    images={images}
                    constraints={constraints}
                    onChange={({constraints, booleanOperator}) => this.updateConstraints(id, constraints, booleanOperator)}
                />
                {constraints.length
                    ? this.renderConstraintsDescription(constraints, booleanOperator)
                    : <NoData message={'Not mapping created for this change category'}/>}

            </React.Fragment>
        )
    }

    renderConstraintsDescription(constraints, booleanOperator) {
        const booleans = Array(constraints.length - 1).fill(booleanOperator)
        const descriptions =
            _.zip(constraints, booleans)
                .map(([{id, description}, operator]) =>
                    <div key={id}>{description} {operator}</div>
                )
        return (
            <div className={styles.constraintsDescriptions}>
                {descriptions}
            </div>
        )
    }

    updateConstraints(id, constraints, booleanOperator) {
        const {recipeActionBuilder} = this.props
        recipeActionBuilder('UPDATE_LEGEND_ENTRY_CONSTRAINTS', {constraints, booleanOperator})
            .assign(['model.legend.entries', {id}], {constraints, booleanOperator})
            .dispatch()
    }
}

const additionalPolicy = () => ({
    _: 'disallow'
})

export const Mapping = compose(
    _Mapping,
    recipeFormPanel({id: 'mapping', mapRecipeToProps, additionalPolicy}),
    withActivator()
)

Mapping.propTypes = {
    recipeId: PropTypes.string
}
