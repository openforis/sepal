import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'

import {RecipeFormPanel, recipeFormPanel} from '~/app/home/body/process/recipeFormPanel'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {withActivators} from '~/widget/activation/activator'
import {CrudItem} from '~/widget/crudItem'
import {Form} from '~/widget/form'
import {ImageConstraints} from '~/widget/imageConstraints/imageConstraints'
import {Layout} from '~/widget/layout'
import {LegendItem} from '~/widget/legend/legendItem'
import {ListItem} from '~/widget/listItem'
import {NoData} from '~/widget/noData'
import {Panel} from '~/widget/panel/panel'

import styles from './mapping.module.css'

const mapRecipeToProps = recipe => ({
    inputImagery: selectFrom(recipe, 'model.inputImagery.images') || [],
    legendEntries: selectFrom(recipe, 'model.legend.entries') || []
})

const mapStateToProps = (state, ownProps) => {
    const {inputImagery} = ownProps
    const recipeNameById = {}
    inputImagery
        .filter(image => image.type === 'RECIPE_REF')
        .map(image => selectFrom(state, ['process.recipes', {id: image.id}]))
        .filter(recipe => recipe)
        .forEach(recipe => recipeNameById[recipe.id] = recipe.name)
    return {recipeNameById}
}

class _Mapping extends React.Component {
    state = {colorMode: 'palette'}

    render() {
        return (
            <RecipeFormPanel
                className={styles.panel}
                placement='bottom-right'>
                <Panel.Header
                    icon='list'
                    title={msg('process.remapping.panel.mapping.title')}
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
            <Layout type='vertical' spacing='tight'>
                {legendEntries.map(entry => this.renderEntryMapping(entry))}
            </Layout>
        )
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
                    }
                />
            </ListItem>
        )
    }

    renderMappingOverview({id, color, value, label, constraints = [], booleanOperator}) {
        const {recipeNameById, inputImagery} = this.props
        const images = inputImagery.map(inputImage => {
            const id = inputImage.imageId
            const description = inputImage.type === 'RECIPE_REF'
                ? recipeNameById[inputImage.id]
                : inputImage.id
            const bands = inputImage.includedBands.map(({band, type, legendEntries}) => ({name: band, type, legendEntries}))
            return {id, description, bands}
        })
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
                    booleanOperator={booleanOperator}
                    constraints={constraints}
                    applyOn={'bands'}
                    onChange={({constraints, booleanOperator}) => this.updateConstraints(id, constraints, booleanOperator)}
                />
                {constraints.length
                    ? this.renderConstraintsDescription(constraints, booleanOperator)
                    // TODO: implement message
                    : <NoData message={'No mapping created for this change category'}/>}

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
    connect(mapStateToProps),
    recipeFormPanel({id: 'mapping', mapRecipeToProps, additionalPolicy}),
    withActivators()
)

Mapping.propTypes = {
    recipeId: PropTypes.string
}
