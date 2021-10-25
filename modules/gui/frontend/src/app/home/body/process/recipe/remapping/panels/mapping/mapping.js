import {Form} from 'widget/form/form'
import {ImageConstraints} from 'widget/imageConstraints/imageConstraints'
import {NoData} from 'widget/noData'
import {Panel} from 'widget/panel/panel'
import {RecipeFormPanel, recipeFormPanel} from 'app/home/body/process/recipeFormPanel'
import {SuperButton} from 'widget/superButton'
import {activator} from 'widget/activation/activator'
import {compose} from 'compose'
import {connect} from '../../../../../../../../store'
import {msg} from 'translate'
import {selectFrom} from 'stateUtils'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
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
                placement='bottom-right'
                className={styles.panel}>
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
            <div>
                {legendEntries.map(entry => this.renderEntryMapping(entry))}
            </div>
        )
    }

    renderEntryMapping(entry) {
        const {activator: {activatables}} = this.props
        const title = (
            <div key={entry.id} className={styles.entry}>
                <div className={styles.color} style={{'--color': entry.color}}/>
                <div className={styles.value}>{entry.value}</div>
                <div className={styles.label}>{entry.label}</div>
            </div>
        )
        return <SuperButton
            key={entry.id}
            title={title}
            onClick={() => activatables[`entryMapping-${entry.id}}`].activate()}
        >
            {this.renderMappingOverview(entry)}
        </SuperButton>
    }

    renderMappingOverview({id, color, value, label, constraints = [], booleanOperator}) {
        const {recipeNameById, inputImagery} = this.props
        const images = inputImagery.map(inputImage => {
            const id = inputImage.id
            const description = inputImage.type === 'RECIPE_REF'
                ? recipeNameById[inputImage.id]
                : inputImage.id
            const bands = inputImage.includedBands.map(({band, type, legendEntries}) => ({name: band, type, legendEntries}))
            return {id, description, bands}
        })
        const title = (
            <div className={styles.constraintTitle}>
                <div className={styles.color} style={{'--color': color}}/>
                <div className={styles.value}>{value}</div>
                <div className={styles.label}>{label}</div>
            </div>
        )
        return (
            <React.Fragment>
                <ImageConstraints
                    id={`entryMapping-${id}}`}
                    title={title}
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
    connect(mapStateToProps),
    recipeFormPanel({id: 'mapping', mapRecipeToProps, additionalPolicy}),
    activator()
)

Mapping.propTypes = {
    recipeId: PropTypes.string
}
