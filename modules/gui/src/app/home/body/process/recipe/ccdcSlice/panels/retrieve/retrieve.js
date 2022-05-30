import {Buttons} from 'widget/buttons'
import {Form} from 'widget/form/form'
import {Layout} from 'widget/layout'
import {Panel} from 'widget/panel/panel'
import {RecipeActions} from '../../ccdcSliceRecipe'
import {RecipeFormPanel, recipeFormPanel} from 'app/home/body/process/recipeFormPanel'
import {Widget} from 'widget/widget'
import {compose} from 'compose'
import {connect} from 'store'
import {currentUser} from 'user'
import {msg} from 'translate'
import {selectFrom} from 'stateUtils'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import styles from './retrieve.module.css'

const fields = {
    baseBands: new Form.Field()
        .predicate(selection => selection && selection.length, 'process.ccdcSlice.panel.retrieve.form.baseBands.atLeastOne'),
    bandTypes: new Form.Field()
        .predicate(selection => selection && selection.length, 'process.ccdcSlice.panel.retrieve.form.bandTypes.atLeastOne'),
    segmentBands: new Form.Field(),
    scale: new Form.Field()
        .notBlank()
        .number(),
    destination: new Form.Field()
        .notEmpty('process.ccdcSlice.panel.retrieve.form.destination.required'),
    workspacePath: new Form.Field()
        .skip((v, {destination}) => destination !== 'SEPAL')
        .notBlank(),
    assetId: new Form.Field()
        .skip((v, {destination}) => destination !== 'GEE')
        .notBlank(),
}

const mapStateToProps = state => ({
    projects: selectFrom(state, 'process.projects'),
    assetRoots: selectFrom(state, 'gee.assetRoots')
})

const mapRecipeToProps = recipe => ({
    baseBands: selectFrom(recipe, 'model.source.baseBands'),
    segmentBands: selectFrom(recipe, 'model.source.segmentBands'),
    user: currentUser()
})

class _Retrieve extends React.Component {
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
        const {inputs: {destination}} = this.props
        return (
            <Layout>
                {this.renderBaseBands()}
                {this.renderBandTypes()}
                {this.renderSegmentBands()}
                {this.renderScale()}
                {this.renderDestination()}
                {destination.value === 'SEPAL' ? this.renderWorkspacePath() : null}
                {destination.value === 'GEE' ? this.renderAssetId() : null}
            </Layout>
        )
    }

    renderBaseBands() {
        const {baseBands, inputs} = this.props
        const bandOptions = baseBands.map(({name}) => ({value: name, label: name}))

        return (
            <Form.Buttons
                label={msg('process.ccdcSlice.panel.retrieve.form.baseBands.label')}
                input={inputs.baseBands}
                multiple
                options={bandOptions}
                framed/>
        )
    }

    renderBandTypes() {
        const {baseBands, inputs} = this.props
        const bandTypes = _.uniq(baseBands.map(({bandTypes}) => bandTypes).flat())
        const bandTypeOptions = [
            {
                value: 'value',
                label: msg('process.ccdcSlice.panel.retrieve.form.bandTypes.value.label'),
                tooltip: msg('process.ccdcSlice.panel.retrieve.form.bandTypes.value.tooltip')
            },
            {
                value: 'rmse',
                label: msg('process.ccdcSlice.panel.retrieve.form.bandTypes.rmse.label'),
                tooltip: msg('process.ccdcSlice.panel.retrieve.form.bandTypes.rmse.tooltip')
            },
            {
                value: 'magnitude',
                label: msg('process.ccdcSlice.panel.retrieve.form.bandTypes.magnitude.label'),
                tooltip: msg('process.ccdcSlice.panel.retrieve.form.bandTypes.magnitude.tooltip')
            },
            {
                value: 'breakConfidence',
                label: msg('process.ccdcSlice.panel.retrieve.form.bandTypes.breakConfidence.label'),
                tooltip: msg('process.ccdcSlice.panel.retrieve.form.bandTypes.breakConfidence.tooltip')
            },
            {
                value: 'intercept',
                label: msg('process.ccdcSlice.panel.retrieve.form.bandTypes.intercept.label'),
                tooltip: msg('process.ccdcSlice.panel.retrieve.form.bandTypes.intercept.tooltip')
            },
            {
                value: 'slope',
                label: msg('process.ccdcSlice.panel.retrieve.form.bandTypes.slope.label'),
                tooltip: msg('process.ccdcSlice.panel.retrieve.form.bandTypes.slope.tooltip')
            },
            {
                value: 'phase_1',
                label: msg('process.ccdcSlice.panel.retrieve.form.bandTypes.phase1.label'),
                tooltip: msg('process.ccdcSlice.panel.retrieve.form.bandTypes.phase1.tooltip')
            },
            {
                value: 'phase_2',
                label: msg('process.ccdcSlice.panel.retrieve.form.bandTypes.phase2.label'),
                tooltip: msg('process.ccdcSlice.panel.retrieve.form.bandTypes.phase2.tooltip')
            },
            {
                value: 'phase_3',
                label: msg('process.ccdcSlice.panel.retrieve.form.bandTypes.phase3.label'),
                tooltip: msg('process.ccdcSlice.panel.retrieve.form.bandTypes.phase3.tooltip')
            },
            {
                value: 'amplitude_1',
                label: msg('process.ccdcSlice.panel.retrieve.form.bandTypes.amplitude1.label'),
                tooltip: msg('process.ccdcSlice.panel.retrieve.form.bandTypes.amplitude1.tooltip')
            },
            {
                value: 'amplitude_2',
                label: msg('process.ccdcSlice.panel.retrieve.form.bandTypes.amplitude2.label'),
                tooltip: msg('process.ccdcSlice.panel.retrieve.form.bandTypes.amplitude2.tooltip')
            },
            {
                value: 'amplitude_3',
                label: msg('process.ccdcSlice.panel.retrieve.form.bandTypes.amplitude3.label'),
                tooltip: msg('process.ccdcSlice.panel.retrieve.form.bandTypes.amplitude3.tooltip')
            }
        ].filter(({value}) =>
            bandTypes.includes(value) ||
            (value === 'breakConfidence' && bandTypes.includes('rmse') && bandTypes.includes('magnitude'))
        )
        return (
            <Form.Buttons
                label={msg('process.ccdcSlice.panel.retrieve.form.bandTypes.label')}
                input={inputs.bandTypes}
                multiple
                options={bandTypeOptions}
                framed/>
        )
    }

    renderSegmentBands() {
        const {segmentBands, inputs} = this.props
        const bands = segmentBands.map(({name}) => name)
        const options = [
            {
                value: 'tStart',
                label: msg('process.ccdcSlice.panel.retrieve.form.segmentBands.tStart.label'),
                tooltip: msg('process.ccdcSlice.panel.retrieve.form.segmentBands.tStart.tooltip')
            },
            {
                value: 'tEnd',
                label: msg('process.ccdcSlice.panel.retrieve.form.segmentBands.tEnd.label'),
                tooltip: msg('process.ccdcSlice.panel.retrieve.form.segmentBands.tEnd.tooltip')
            },
            {
                value: 'tBreak',
                label: msg('process.ccdcSlice.panel.retrieve.form.segmentBands.tBreak.label'),
                tooltip: msg('process.ccdcSlice.panel.retrieve.form.segmentBands.tBreak.tooltip')
            },
            {
                value: 'numObs',
                label: msg('process.ccdcSlice.panel.retrieve.form.segmentBands.numObs.label'),
                tooltip: msg('process.ccdcSlice.panel.retrieve.form.segmentBands.numObs.tooltip')
            },
            {
                value: 'changeProb',
                label: msg('process.ccdcSlice.panel.retrieve.form.segmentBands.changeProb.label'),
                tooltip: msg('process.ccdcSlice.panel.retrieve.form.segmentBands.changeProb.tooltip')
            }
        ].filter(({value}) => bands.includes(value))
        return options.length
            ? (
                <Form.Buttons
                    label={msg('process.ccdcSlice.panel.retrieve.form.segmentBands.label')}
                    tooltip={msg('process.ccdcSlice.panel.retrieve.form.segmentBands.tooltip')}
                    input={inputs.segmentBands}
                    multiple
                    options={options}
                    framed/>
            )
            : null
    }

    renderScale() {
        const {inputs: {scale}} = this.props
        return (
            <Widget
                layout='horizontal'
                spacing='compact'
                label={msg('process.retrieve.form.scale.label')}>
                <Buttons
                    options={[1, 5, 10, 15, 20, 30, 60, 100]}
                    spacing='none'
                    selected={Number(scale.value)}
                    onChange={value => scale.set(value)}
                />
                <Form.Input
                    input={scale}
                    type='number'
                    suffix='meters'
                    placeholder={msg('process.retrieve.form.customScale.label')}
                />
            </Widget>
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

    renderWorkspacePath() {
        const {inputs: {workspacePath}} = this.props
        return (
            <Form.Input
                label={msg('process.retrieve.form.workspacePath.label')}
                placeholder={msg('process.retrieve.form.workspacePath.tooltip')}
                tooltip={msg('process.retrieve.form.workspacePath.tooltip')}
                input={workspacePath}
            />
        )
    }

    renderAssetId() {
        const {assetRoots, inputs: {assetId}} = this.props
        return (
            <Form.Input
                label={msg('process.retrieve.form.assetId.label')}
                placeholder={msg('process.retrieve.form.assetId.tooltip')}
                tooltip={msg('process.retrieve.form.assetIt.tooltip')}
                input={assetId}
                busyMessage={!assetRoots}
                disabled={!assetRoots}
            />
        )
    }
    componentDidMount() {
        this.update()
    }

    componentDidUpdate() {
        this.update()
    }

    defaultPath() {
        const {projects, projectId, title, placeholder} = this.props
        const projectDir = projects
            .find(({id}) => id === projectId)
            ?.name
            ?.replace(/[^\w-.]/g, '_')
        const recipeName = title || placeholder
        return projectDir
            ? `${projectDir}/${recipeName}`
            : recipeName
    }
}

export const Retrieve = compose(
    _Retrieve,
    connect(mapStateToProps),
    recipeFormPanel({id: 'retrieve', fields, mapRecipeToProps})
)

Retrieve.propTypes = {
    recipeId: PropTypes.string
}
