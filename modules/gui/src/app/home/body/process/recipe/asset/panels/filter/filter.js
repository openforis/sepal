import {CrudItem} from 'widget/crudItem'
import {Form} from 'widget/form/form'
import {ImageConstraints} from 'widget/imageConstraints/imageConstraints'
import {Layout} from 'widget/layout'
import {LegendItem} from 'widget/legend/legendItem'
import {ListItem} from 'widget/listItem'
import {NoData} from 'widget/noData'
import {Panel} from 'widget/panel/panel'
import {RecipeFormPanel, recipeFormPanel} from 'app/home/body/process/recipeFormPanel'
import {compose} from 'compose'
import {msg} from 'translate'
import {selectFrom} from 'stateUtils'
import {withActivators} from 'widget/activation/activator'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import styles from './filter.module.css'

const mapRecipeToProps = recipe => ({
    assetDetails: selectFrom(recipe, 'model.assetDetails') || [],
})

class _Filter extends React.Component {
    render() {
        return (
            <RecipeFormPanel
                placement='bottom-right'
                className={styles.panel}>
                <Panel.Header
                    icon='list'
                    title={msg('process.asset.panel.filter.title')}
                />
                <Panel.Content>
                    {this.renderContent()}
                </Panel.Content>
                <Form.PanelButtons/>
            </RecipeFormPanel>
        )
    }

    renderContent() {
        const {filters} = this.props
        return (
            <Layout type='vertical' spacing='tight'>
                {filters.map(filter => this.renderFilter(filter))}
            </Layout>
        )
    }

    renderFilter(filter) {
        const {activator: {activatables}} = this.props
        const onClick = () => activatables[`filter-${filter.id}}`].activate()
        return (
            <ListItem
                key={filter.id}
                onClick={onClick}
                expansion={this.renderFilterOverview(filter)}
                expansionClickable
                expanded>
                <CrudItem
                    content={
                        <LegendItem
                            color={filter.color}
                            value={filter.value}
                            label={filter.label}
                            onClick={onClick}
                        />
                    }
                />
            </ListItem>
        )
    }

    renderFilterOverview({id, constraints = [], booleanOperator}) {
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
                    id={`filter-${id}}`}
                    title={'Test'} // TODO: Drop the title
                    images={images}
                    booleanOperator={booleanOperator}
                    constraints={constraints}
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
        recipeActionBuilder('UPDATE_FILTER_CONSTRAINTS', {constraints, booleanOperator})
            .assign(['model.legend.entries', {id}], {constraints, booleanOperator})
            .dispatch()
    }

}

const additionalPolicy = () => ({
    _: 'disallow'
})

export const Filter = compose(
    _Filter,
    recipeFormPanel({id: 'filter', mapRecipeToProps, additionalPolicy}),
    withActivators()
)

Filter.propTypes = {
    recipeId: PropTypes.string
}
