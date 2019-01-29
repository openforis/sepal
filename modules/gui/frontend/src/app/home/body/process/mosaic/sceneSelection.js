import {Button, ButtonGroup} from 'widget/button'
import {CenteredProgress} from 'widget/progress'
import {Field, form} from 'widget/form'
import {HoverConsumer, HoverProvider} from 'widget/hover'
import {RecipeActions, RecipeState} from 'app/home/body/process/mosaic/mosaicRecipe'
import {Scrollable, ScrollableContainer, Unscrollable} from 'widget/scrollable'
import {dataSetById} from 'sources'
import {map} from 'rxjs/operators'
import {msg} from 'translate'
import {objectEquals} from 'collections'
import {withRecipePath} from 'app/home/body/process/recipe'
import Icon from 'widget/icon'
import Label from 'widget/label'
import Panel, {PanelContent, PanelHeader} from 'widget/panel'
import PanelButtons from 'widget/panelButtons'
import PropTypes from 'prop-types'
import React from 'react'
import ScenePreview from 'app/home/body/process/mosaic/scenePreview'
import api from 'api'
import daysBetween from './daysBetween'
import format from 'format'
import styles from './sceneSelection.module.css'

const fields = {
    selectedScenes: new Field()
}

const mapStateToProps = (state, ownProps) => {
    const {recipeId, sceneAreaId} = ownProps
    const recipeState = RecipeState(recipeId)
    const selectedScenes = recipeState(['model.scenes', sceneAreaId]) || []
    return {
        sources: recipeState('model.sources'),
        dates: recipeState('model.dates'),
        sceneSelectionOptions: recipeState('model.sceneSelectionOptions'),
        values: {selectedScenes}
    }
}

class SceneSelection extends React.Component {
    constructor(props) {
        super(props)
        this.state = {
            scenes: []
        }
        this.recipeActions = RecipeActions(props.recipeId)
    }

    render() {
        const {action, recipeId, recipePath, dates: {targetDate}, form} = this.props
        const loading = !action('LOAD_SCENES').dispatched
        return (
            <React.Fragment>
                <ScenePreview recipeId={recipeId} targetDate={targetDate}/>
                <Panel
                    className={styles.panel}
                    form={form}
                    statePath={recipePath + '.ui'}
                    modalOnDirty={false}
                    center
                    onApply={({selectedScenes}) => this.onApply(selectedScenes)}
                    onCancel={() => this.deselectSceneArea()}>
                    <PanelHeader
                        icon='images'
                        title={msg('process.mosaic.panel.auto.form.selectScenes')}/>

                    <PanelContent className={loading ? styles.loading : null}>
                        {loading
                            ? <CenteredProgress title={msg('process.mosaic.panel.sceneSelection.loadingScenes')}/>
                            : this.renderScenes()}
                    </PanelContent>

                    <PanelButtons/>
                </Panel>
            </React.Fragment>
        )
    }

    renderScenes() {
        const {dates: {targetDate}, inputs: {selectedScenes}} = this.props
        const {scenes, scenesById = {}} = this.state
        const availableSceneComponents = scenes
            .filter(scene => !selectedScenes.value.find(selectedScene => selectedScene.id === scene.id))
            .map(scene =>
                <Scene
                    key={scene.id}
                    targetDate={targetDate}
                    scene={scene}
                    selected={false}
                    onAdd={() => this.addScene(scene)}
                    recipeActions={this.recipeActions}/>
            )
        const selectedSceneComponents = selectedScenes.value
            .map(scene => scenesById[scene.id])
            .filter(scene => scene)
            .map(scene =>
                <Scene
                    key={scene.id}
                    targetDate={targetDate}
                    scene={scene}
                    selected={true}
                    onRemove={() => this.removeScene(scene)}
                    recipeActions={this.recipeActions}/>
            )
        return (
            <div className={styles.scenes}>
                <div className={styles.availableScenes}>
                    <ScrollableContainer>
                        <Unscrollable className={styles.title}>
                            <Label msg={msg('process.mosaic.panel.sceneSelection.availableScenes')}/>
                        </Unscrollable>
                        <Scrollable className={styles.grid}>
                            {availableSceneComponents}
                        </Scrollable>
                    </ScrollableContainer>
                </div>
                <div className={styles.selectedScenes}>
                    <ScrollableContainer>
                        <Unscrollable className={styles.title}>
                            <Label msg={msg('process.mosaic.panel.sceneSelection.selectedScenes')}/>
                        </Unscrollable>
                        <Scrollable className={styles.grid}>
                            {selectedSceneComponents}
                        </Scrollable>
                    </ScrollableContainer>
                </div>
            </div>
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
        const {sceneAreaId, dates, sources, sceneSelectionOptions, asyncActionBuilder} = this.props
        this.setScenes([])
        asyncActionBuilder('LOAD_SCENES',
            api.gee.scenesInSceneArea$({sceneAreaId, dates, sources, sceneSelectionOptions}).pipe(
                map(scenes => this.setScenes(scenes))
            )
        ).dispatch()
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
                // cloudCover: scene.cloudCover,
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

const imageThumbnail = url =>
    url.replace('https://earthexplorer.usgs.gov/browse/', 'https://earthexplorer.usgs.gov/browse/thumbnails/')

const Scene = ({selected, scene, targetDate, onAdd, onRemove, className, recipeActions}) => {
    const {dataSet, date, cloudCover, browseUrl} = scene
    const daysFromTarget = daysBetween(targetDate, date)
    const thumbnailUrl = imageThumbnail(browseUrl)
    return (
        <HoverProvider className={[styles.scene, className].join(' ')}>
            <div className={styles.thumbnail} style={{'backgroundImage': `url("${thumbnailUrl}")`}}>
                {thumbnailUrl !== browseUrl ? <img src={browseUrl} alt=''/> : null}
            </div>
            <div
                className={styles.details}
                style={{
                    '--percent-from-target': `${daysFromTarget / 3.65}`,
                    '--percent-cloud-cover': `${cloudCover}`
                }}>
                <div className={styles.date}>
                    <div className={styles.dataSet}>
                        <Icon name='satellite-dish'/>
                        {dataSetById[dataSet].shortName}
                    </div>
                    <div>
                        {date}
                    </div>
                </div>
                <div className={styles.cloudCover}>
                    <div className={styles.value}>
                        <Icon name='cloud'/>
                        {format.integer(cloudCover)}%
                    </div>
                    <div className={styles.bar}/>
                </div>
                <div className={[
                    styles.daysFromTarget,
                    daysFromTarget > 0 && styles.positive,
                    daysFromTarget < 0 && styles.negative
                ].join(' ')}>
                    <div className={styles.value}>
                        <Icon name='calendar-check'/>
                        {daysFromTarget > 0 ? '+' : '-'}{Math.abs(daysFromTarget)}d
                    </div>
                    <div className={styles.bar}/>
                </div>
            </div>
            <div className={styles.overlay}>
                <HoverConsumer>
                    {hover => hover
                        ? selected
                            ? <SelectedSceneOverlay scene={scene} onRemove={onRemove} recipeActions={recipeActions}/>
                            : <AvailableSceneOverlay scene={scene} onAdd={onAdd} recipeActions={recipeActions}/>
                        : null
                    }
                </HoverConsumer>
            </div>
        </HoverProvider>
    )
}

const AvailableSceneOverlay = ({scene, onAdd, recipeActions}) =>
    <div className={styles.overlayControls}>
        <ButtonGroup>
            <Button
                look='add'
                icon='plus'
                label={msg('button.add')}
                onClick={() => onAdd(scene)}/>
            <Button
                look='default'
                icon='eye'
                label={msg('process.mosaic.panel.sceneSelection.preview.label')}
                onClick={() => recipeActions.setSceneToPreview(scene).dispatch()}/>
        </ButtonGroup>
    </div>

const SelectedSceneOverlay = ({scene, onRemove, recipeActions}) =>
    <div className={styles.overlayControls }>
        <ButtonGroup>
            <Button
                look='cancel'
                icon='minus'
                label={msg('button.remove')}
                onClick={() => onRemove(scene)}/>
            <Button
                look='default'
                icon='eye'
                label={msg('process.mosaic.panel.sceneSelection.preview.label')}
                onClick={() => recipeActions.setSceneToPreview(scene).dispatch()}/>
        </ButtonGroup>
    </div>

SceneSelection.propTypes = {
    recipeId: PropTypes.string.isRequired,
    sceneAreaId: PropTypes.string.isRequired
}

export default withRecipePath()(
    form({fields, mapStateToProps})(SceneSelection)
)
