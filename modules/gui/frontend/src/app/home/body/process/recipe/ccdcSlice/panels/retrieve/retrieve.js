import {Form} from 'widget/form/form'
import {Layout} from 'widget/layout'
import {Panel} from 'widget/panel/panel'
import {RecipeActions} from '../../ccdcSliceRecipe'
import {RecipeFormPanel, recipeFormPanel} from 'app/home/body/process/recipeFormPanel'
import {compose} from 'compose'
import {currentUser} from 'widget/user'
import {msg} from 'translate'
import {selectFrom} from 'stateUtils'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './retrieve.module.css'

const fields = {
    baseBands: new Form.Field()
        .predicate(selection => selection && selection.length, 'process.ccdcSlice.panel.retrieve.form.baseBands.atLeastOne'),
    bandTypes: new Form.Field()
        .predicate(selection => selection && selection.length, 'process.ccdcSlice.panel.retrieve.form.bandTypes.atLeastOne'),
    scale: new Form.Field(),
    destination: new Form.Field()
        .notEmpty('process.ccdcSlice.panel.retrieve.form.destination.required')
}

const mapRecipeToProps = recipe => ({
    assetBands: selectFrom(recipe, 'model.source.bands'),
    user: currentUser()
})

class Retrieve extends React.Component {
    constructor(props) {
        super(props)
        const {recipeId, inputs: {scale}} = this.props
        this.recipeActions = RecipeActions(recipeId)
        if (!scale.value)
            scale.set(30)
    }

    render() {
        return (
            <RecipeFormPanel
                className={styles.panel}
                isActionForm
                placement='top-right'
                onApply={values => this.recipeActions.retrieve(values).dispatch()}>
                <Panel.Header
                    icon='cloud-download-alt'
                    title={msg('process.ccdcSlice.panel.retrieve.title')}/>
                <Panel.Content>
                    {this.renderContent()}
                </Panel.Content>
                <Form.PanelButtons
                    applyLabel={msg('process.ccdcSlice.panel.retrieve.apply')}/>
            </RecipeFormPanel>
        )
    }

    renderContent() {
        return (
            <Layout>
                {this.renderBaseBands()}
                {this.renderBandTypes()}
                {this.renderScale()}
                {this.renderDestination()}
            </Layout>
        )
    }

    renderBaseBands() {
        const {assetBands, inputs: {baseBands}} = this.props
        const bandOptions = assetBands.map(band => ({value: band, label: band}))

        return (
            <Form.Buttons
                label={msg('process.ccdcSlice.panel.retrieve.form.baseBands.label')}
                input={baseBands}
                multiple
                options={bandOptions}/>
        )
    }

    renderBandTypes() {
        const {inputs: {bandTypes}} = this.props
        const bandTypeOptions = [
            {
                value: 'VALUE',
                label: msg('process.ccdcSlice.panel.retrieve.form.bandTypes.value.label'),
                tooltip: msg('process.ccdcSlice.panel.retrieve.form.bandTypes.value.tooltip')
            },
            {
                value: 'RMSE',
                label: msg('process.ccdcSlice.panel.retrieve.form.bandTypes.rmse.label'),
                tooltip: msg('process.ccdcSlice.panel.retrieve.form.bandTypes.rmse.tooltip')
            },
            {
                value: 'INTERCEPT',
                label: msg('process.ccdcSlice.panel.retrieve.form.bandTypes.intercept.label'),
                tooltip: msg('process.ccdcSlice.panel.retrieve.form.bandTypes.intercept.tooltip')
            },
            {
                value: 'SLOPE',
                label: msg('process.ccdcSlice.panel.retrieve.form.bandTypes.slope.label'),
                tooltip: msg('process.ccdcSlice.panel.retrieve.form.bandTypes.slope.tooltip')
            },
            {
                value: 'PHASE1',
                label: msg('process.ccdcSlice.panel.retrieve.form.bandTypes.phase1.label'),
                tooltip: msg('process.ccdcSlice.panel.retrieve.form.bandTypes.phase1.tooltip')
            },
            {
                value: 'PHASE2',
                label: msg('process.ccdcSlice.panel.retrieve.form.bandTypes.phase2.label'),
                tooltip: msg('process.ccdcSlice.panel.retrieve.form.bandTypes.phase2.tooltip')
            },
            {
                value: 'PHASE3',
                label: msg('process.ccdcSlice.panel.retrieve.form.bandTypes.phase3.label'),
                tooltip: msg('process.ccdcSlice.panel.retrieve.form.bandTypes.phase3.tooltip')
            },
            {
                value: 'AMPLITUDE1',
                label: msg('process.ccdcSlice.panel.retrieve.form.bandTypes.amplitude1.label'),
                tooltip: msg('process.ccdcSlice.panel.retrieve.form.bandTypes.amplitude1.tooltip')
            },
            {
                value: 'AMPLITUDE2',
                label: msg('process.ccdcSlice.panel.retrieve.form.bandTypes.amplitude2.label'),
                tooltip: msg('process.ccdcSlice.panel.retrieve.form.bandTypes.amplitude2.tooltip')
            },
            {
                value: 'AMPLITUDE3',
                label: msg('process.ccdcSlice.panel.retrieve.form.bandTypes.amplitude3.label'),
                tooltip: msg('process.ccdcSlice.panel.retrieve.form.bandTypes.amplitude3.tooltip')
            }
        ]
        return (
            <Form.Buttons
                label={msg('process.ccdcSlice.panel.retrieve.form.bandTypes.label')}
                input={bandTypes}
                multiple
                options={bandTypeOptions}/>
        )
    }

    renderScale() {
        const {inputs: {scale}} = this.props
        return (
            <Form.Slider
                label={msg('process.ccdcSlice.panel.retrieve.form.scale.label')}
                info={scale => msg('process.ccdcSlice.panel.retrieve.form.scale.info', {scale})}
                input={scale}
                minValue={10}
                maxValue={100}
                scale={'log'}
                ticks={[10, 15, 20, 30, 60, 100]}
                snap
                range='none'
            />
        )
    }

    renderDestination() {
        const {user, inputs: {destination}} = this.props
        const destinationOptions = [
            {
                value: 'SEPAL',
                label: msg('process.ccdcSlice.panel.retrieve.form.destination.SEPAL'),
                disabled: !user.googleTokens
            },
            {
                value: 'GEE',
                label: msg('process.ccdcSlice.panel.retrieve.form.destination.GEE')
            }
        ].filter(({value}) => user.googleTokens || value !== 'GEE')
        return (
            <Form.Buttons
                label={msg('process.ccdcSlice.panel.retrieve.form.destination.label')}
                input={destination}
                multiple={false}
                options={destinationOptions}/>
        )
    }
}

Retrieve.propTypes = {
    recipeId: PropTypes.string
}

export default compose(
    Retrieve,
    recipeFormPanel({id: 'retrieve', fields, mapRecipeToProps})
)
