import {CenteredProgress} from 'widget/progress'
import {Form, withForm} from 'widget/form/form'
import {Padding} from 'widget/padding'
import {Panel} from 'widget/panel/panel'
import {RecipeActions} from 'app/home/body/process/recipe/opticalMosaic/opticalMosaicRecipe'
import {Scene} from './scene'
import {Scrollable, ScrollableContainer, Unscrollable} from 'widget/scrollable'
import {compose} from 'compose'
import {msg} from 'translate'
import {objectEquals} from 'collections'
import {selectFrom} from 'stateUtils'
import {withActivatable} from 'widget/activation/activatable'
import {withRecipe} from 'app/home/body/process/recipeContext'
import Label from 'widget/label'
import React from 'react'
import ScenePreview from 'app/home/body/process/recipe/opticalMosaic/scenePreview'
import api from 'api'
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

class SceneSelection extends React.Component {
    constructor(props) {
        super(props)
        const {recipeId} = props
        this.state = {
            scenes: []
        }
        this.recipeActions = RecipeActions(recipeId)
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

    render() {
        const {recipeId, dates: {targetDate}, form, activatable: {deactivate}, stream} = this.props
        const loading = stream('LOAD_SCENES').dispatching
        return (
            <React.Fragment>
                <ScenePreview recipeId={recipeId} targetDate={targetDate}/>
                <Form.Panel
                    policy={policy}
                    className={styles.panel}
                    form={form}
                    type='center'
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
            </React.Fragment>
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
        const haveScenes = availableScenes.length || selectedScenes.length
        return haveScenes ? (
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
            <ScrollableContainer>
                <Unscrollable className={styles.title}>
                    <Label msg={title}/>
                </Unscrollable>
                <Scrollable>
                    <Padding noHorizontal className={styles.grid}>
                        {scenes.map(scene => this.renderScene(scene, selected))}
                    </Padding>
                </Scrollable>
            </ScrollableContainer>
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
                onPreview={(() => this.previewScene(scene))}
            />
        )
    }

    componentDidMount() {
        this.loadScenes()
    }

    componentDidUpdate(prevProps) {
        if (!objectEquals(this.props, prevProps, ['sceneAreaId', 'dates', 'sources', 'sceneSelectionOptions']))
            this.loadScenes()
    }

    loadScenes() {
        const {sceneAreaId, dates, sources, sceneSelectionOptions, stream} = this.props
        this.setScenes([])
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

    previewScene(scene) {
        this.recipeActions.setSceneToPreview(scene).dispatch()
    }

    setScenes(scenes) {
        this.setState(prevState => {
            const scenesById = {}
            scenes.forEach(scene => scenesById[scene.id] = scene)
            return {...prevState, scenes, scenesById}
        }, () => console.log(scenes))
    }

}

SceneSelection.propTypes = {}

const policy = () => ({
    _: 'disallow',
    dates: 'allow',
    sources: 'allow',
    sceneSelectionOptions: 'allow',
    compositeOptions: 'allow'
})

export default compose(
    SceneSelection,
    withForm({fields}),
    withRecipe(mapRecipeToProps),
    withActivatable({id: 'sceneSelection', policy})
)
