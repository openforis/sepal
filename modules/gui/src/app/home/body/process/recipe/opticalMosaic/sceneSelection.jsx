import React from 'react'

import api from '~/apiRegistry'
import {RecipeActions} from '~/app/home/body/process/recipe/opticalMosaic/opticalMosaicRecipe'
import {withRecipe} from '~/app/home/body/process/recipeContext'
import {compose} from '~/compose'
import {isPartiallyEqual} from '~/hash'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {withActivatable} from '~/widget/activation/activatable'
import {Form} from '~/widget/form'
import {withForm} from '~/widget/form/form'
import {Label} from '~/widget/label'
import {Layout} from '~/widget/layout'
import {Padding} from '~/widget/padding'
import {Panel} from '~/widget/panel/panel'
import {CenteredProgress} from '~/widget/progress'
import {Scrollable} from '~/widget/scrollable'

import {Scene} from './scene'
import styles from './sceneSelection.module.css'

const fields = {
    selectedScenes: new Form.Field()
}

const mapRecipeToProps = recipe => {
    const sceneAreaId = selectFrom(recipe, 'ui.sceneSelection')
    const selectedScenes = selectFrom(recipe, ['model.scenes', sceneAreaId]) || []
    return {
        recipeId: recipe.id,
        sceneAreaId,
        sources: selectFrom(recipe, 'model.sources'),
        dates: selectFrom(recipe, 'model.dates'),
        sceneSelectionOptions: selectFrom(recipe, 'model.sceneSelectionOptions'),
        values: {selectedScenes}
    }
}

class _SceneSelection extends React.Component {
    constructor(props) {
        super(props)
        const {recipeId} = props
        this.recipeActions = RecipeActions(recipeId)
    }

    state = {
        scenes: []
    }

    getAvailableScenes() {
        const {inputs: {selectedScenes}} = this.props
        const {scenes} = this.state
        return scenes
            .filter(scene => !selectedScenes.value.find(selectedScene => selectedScene.id === scene.id))
    }

    getSelectedScenes() {
        const {inputs: {selectedScenes}} = this.props
        const {scenesById = {}} = this.state
        return selectedScenes.value
            .map(scene => scenesById[scene.id])
            .filter(scene => scene)
    }

    isSceneSelected(scene) {
        const {inputs: {selectedScenes}} = this.props
        return !!selectedScenes.value.find(selectedScene => selectedScene.id === scene.id)
    }

    render() {
        const {form, activatable: {deactivate}, stream} = this.props
        const loading = stream('LOAD_SCENES').active
        return (
            <Form.Panel
                className={styles.panel}
                placement='modal'
                form={form}
                policy={policy}
                onApply={({selectedScenes}) => this.onApply(selectedScenes)}
                onCancel={() => this.deselectSceneArea()}
                onClose={deactivate}>
                <Panel.Header
                    icon='images'
                    title={msg('process.mosaic.panel.autoSelectScenes.form.selectScenes')}/>

                <Panel.Content className={loading ? styles.loading : null}
                    scrollable={false}
                    noVerticalPadding
                >
                    {loading
                        ? this.renderProgress()
                        : this.renderScenes()}
                </Panel.Content>

                <Form.PanelButtons/>
            </Form.Panel>
        )
    }

    renderProgress() {
        return (
            <CenteredProgress title={msg('process.mosaic.panel.sceneSelection.loadingScenes')}/>
        )
    }

    renderScenes() {
        const availableScenes = this.getAvailableScenes()
        const selectedScenes = this.getSelectedScenes()
        return availableScenes.length || selectedScenes.length ? (
            <div className={styles.scenes}>
                <div className={styles.availableScenes}>
                    {this.renderScenesSection({
                        scenes: availableScenes,
                        title: msg('process.mosaic.panel.sceneSelection.availableScenes'),
                        selected: false
                    })}
                </div>
                <div className={styles.selectedScenes}>
                    {this.renderScenesSection({
                        scenes: selectedScenes,
                        title: msg('process.mosaic.panel.sceneSelection.selectedScenes'),
                        selected: true
                    })}
                </div>
            </div>
        ) : (
            <div className={styles.noScenes}>
                {msg('process.mosaic.panel.sceneSelection.noScenes')}
            </div>
        )
    }

    renderScenesSection({scenes, title, selected}) {
        return (
            <Layout type='vertical' spacing='none'>
                <Label className={styles.title} msg={title}/>
                <Scrollable direction='y'>
                    <Padding noHorizontal className={styles.grid}>
                        {scenes.map(scene => this.renderScene(scene, selected))}
                    </Padding>
                </Scrollable>
            </Layout>
        )
    }

    renderScene(scene, selected) {
        const {dates: {targetDate}} = this.props
        return (
            <Scene
                key={scene.id}
                targetDate={targetDate}
                scene={scene}
                selected={selected}
                onAdd={() => this.addScene(scene)}
                onRemove={() => this.removeScene(scene)}
            />
        )
    }

    componentDidMount() {
        this.loadScenes()
    }

    componentDidUpdate(prevProps) {
        if (!isPartiallyEqual(this.props, prevProps, ['sceneAreaId', 'dates', 'sources', 'sceneSelectionOptions']))
            this.loadScenes()
    }

    loadScenes() {
        const {sceneAreaId, dates, sources, sceneSelectionOptions, stream} = this.props
        stream('LOAD_SCENES',
            api.gee.scenesInSceneArea$({sceneAreaId, dates, sources, sceneSelectionOptions}),
            scenes => this.setScenes(scenes)
        )
    }

    onApply(selectedScenes) {
        const {sceneAreaId} = this.props
        this.recipeActions.setSelectedScenesInSceneArea(sceneAreaId, selectedScenes).dispatch()
        this.deselectSceneArea()
    }

    deselectSceneArea() {
        this.recipeActions.setSceneSelection(null).dispatch()
    }

    addScene(scene) {
        const {inputs: {selectedScenes}} = this.props
        selectedScenes.set([
            ...selectedScenes.value,
            {
                id: scene.id,
                date: scene.date,
                dataSet: scene.dataSet
            }
        ])
    }

    removeScene(sceneToRemove) {
        const {inputs: {selectedScenes}} = this.props
        selectedScenes.set(selectedScenes.value.filter(scene => scene.id !== sceneToRemove.id))
    }

    setScenes(scenes) {
        this.setState(prevState => {
            const scenesById = {}
            scenes.forEach(scene => scenesById[scene.id] = scene)
            return {...prevState, scenes, scenesById}
        })
    }

}

const policy = () => ({
    _: 'disallow',
    dates: 'allow',
    sources: 'allow',
    sceneSelectionOptions: 'allow',
    compositeOptions: 'allow'
})

export const SceneSelection = compose(
    _SceneSelection,
    withForm({fields}),
    withRecipe(mapRecipeToProps),
    withActivatable({id: 'sceneSelection', policy})
)

SceneSelection.propTypes = {}
