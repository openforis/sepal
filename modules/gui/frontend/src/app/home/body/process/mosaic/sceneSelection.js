import {Button, ButtonGroup} from 'widget/button'
import {CenteredProgress} from 'widget/progress'
import {Field, form} from 'widget/form'
import {HoverDetector, HoverOverlay} from 'widget/hover'
import {PanelContent, PanelHeader} from 'widget/panel'
import {RecipeActions, RecipeState} from 'app/home/body/process/mosaic/mosaicRecipe'
import {Scrollable, ScrollableContainer, Unscrollable} from 'widget/scrollable'
import {dataSetById} from 'sources'
import {map} from 'rxjs/operators'
import {msg} from 'translate'
import {objectEquals} from 'collections'
import {withRecipePath} from 'app/home/body/process/recipe'
import FormPanel, {FormPanelButtons} from 'widget/formPanel'
import Icon from 'widget/icon'
import Label from 'widget/label'
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
        const {action, recipeId, recipePath, dates: {targetDate}, form} = this.props
        const loading = !action('LOAD_SCENES').dispatched
        return (
            <React.Fragment>
                <ScenePreview recipeId={recipeId} targetDate={targetDate}/>
                <FormPanel
                    className={styles.panel}
                    form={form}
                    statePath={recipePath + '.ui'}
                    modalOnDirty={false}
                    type='center'
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

                    <FormPanelButtons/>
                </FormPanel>
            </React.Fragment>
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
                recipeActions={this.recipeActions}/>
        )
    }

    renderAvailableScenes(scenes) {
        return (
            <ScrollableContainer>
                <Unscrollable className={styles.title}>
                    <Label msg={msg('process.mosaic.panel.sceneSelection.availableScenes')}/>
                </Unscrollable>
                <Scrollable className={styles.grid}>
                    {scenes.map(scene => this.renderScene(scene, false))}
                </Scrollable>
            </ScrollableContainer>
        )
    }

    renderSelectedScenes(scenes) {
        return (
            <ScrollableContainer>
                <Unscrollable className={styles.title}>
                    <Label msg={msg('process.mosaic.panel.sceneSelection.selectedScenes')}/>
                </Unscrollable>
                <Scrollable className={styles.grid}>
                    {scenes.map(scene => this.renderScene(scene, true))}
                </Scrollable>
            </ScrollableContainer>
        )
    }

    renderScenes() {
        const availableScenes = this.getAvailableScenes()
        const selectedScenes = this.getSelectedScenes()
        const haveScenes = availableScenes.length || selectedScenes.length
        return haveScenes ? (
            <div className={styles.scenes}>
                <div className={styles.availableScenes}>
                    {this.renderAvailableScenes(availableScenes)}
                </div>
                <div className={styles.selectedScenes}>
                    {this.renderSelectedScenes(selectedScenes)}
                </div>
            </div>
        ) : (
            <div className={styles.noScenes}>
                {msg('process.mosaic.panel.sceneSelection.noScenes')}
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

class Scene extends React.Component {
    imageThumbnail(url) {
        return url.replace('https://earthexplorer.usgs.gov/browse/', 'https://earthexplorer.usgs.gov/browse/thumbnails/')
    }

    renderSceneOverlay() {
        const {selected} = this.props
        return selected
            ? this.renderSelectedSceneOverlay()
            : this.renderAvailableSceneOverlay()
    }

    renderAvailableSceneOverlay() {
        const {scene, onAdd, recipeActions} = this.props
        return (
            <ButtonGroup className={styles.overlayControls}>
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
        )
    }

    renderSelectedSceneOverlay() {
        const {scene, onRemove, recipeActions} = this.props
        return (
            <ButtonGroup className={styles.overlayControls}>
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
        )
    }

    renderThumbnail() {
        const {scene: {browseUrl}} = this.props
        const thumbnailUrl = this.imageThumbnail(browseUrl)
        return (
            <div className={styles.thumbnail} style={{'backgroundImage': `url("${thumbnailUrl}")`}}>
                {thumbnailUrl !== browseUrl ? <img src={browseUrl} alt=''/> : null}
            </div>
        )
    }

    renderInfo(dataSet, date) {
        return (
            <div className={styles.date}>
                <div className={styles.dataSet}>
                    <Icon name='satellite-dish'/>
                    {dataSetById[dataSet].shortName}
                </div>
                <div>
                    {date}
                </div>
            </div>
        )
    }

    renderCloudCover(cloudCover) {
        return (
            <div className={styles.cloudCover}>
                <div className={styles.value}>
                    <Icon name='cloud'/>
                    {format.integer(cloudCover)}%
                </div>
                <div className={styles.bar}/>
            </div>
        )
    }

    renderDaysFromTarget(daysFromTarget) {
        return (
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
        )
    }

    renderDetails() {
        const {scene: {dataSet, date, cloudCover}, targetDate} = this.props
        const daysFromTarget = daysBetween(targetDate, date)
        return (
            <div
                className={styles.details}
                style={{
                    '--percent-from-target': `${daysFromTarget / 3.65}`,
                    '--percent-cloud-cover': `${cloudCover}`
                }}>
                {this.renderInfo(dataSet, date)}
                {this.renderCloudCover(cloudCover)}
                {this.renderDaysFromTarget(daysFromTarget)}
            </div>
        )
    }

    render() {
        const {className} = this.props
        return (
            <HoverDetector className={[styles.scene, className].join(' ')}>
                {this.renderThumbnail()}
                {this.renderDetails()}
                <HoverOverlay>
                    {this.renderSceneOverlay()}
                </HoverOverlay>
            </HoverDetector>
        )
    }
}

SceneSelection.propTypes = {
    recipeId: PropTypes.string.isRequired,
    sceneAreaId: PropTypes.string.isRequired
}

export default withRecipePath()(
    form({fields, mapStateToProps})(SceneSelection)
)
