import {Button} from '~/widget/button'
import {ButtonGroup} from '~/widget/buttonGroup'
import {HoverDetector, HoverOverlay} from '~/widget/hover'
import {Icon} from '~/widget/icon'
import {getDataSet} from './sources'
import {msg} from '~/translate'
import PropTypes from 'prop-types'
import React from 'react'
import daysBetween from './daysBetween'
import format from '~/format'
import styles from './sceneSelection.module.css'

export class Scene extends React.Component {
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

    renderThumbnail() {
        const {scene: {browseUrl: imageUrl}} = this.props
        const thumbnailUrl = this.imageThumbnail(imageUrl)
        return (
            <div className={styles.thumbnail}>
                {this.renderImage(thumbnailUrl)}
                {this.renderImage(imageUrl)}
            </div>
        )
    }

    imageThumbnail(url) {
        return url.replace('https://earthexplorer.usgs.gov/browse/', 'https://earthexplorer.usgs.gov/browse/thumbnails/')
    }

    renderImage(url) {
        return (
            <div className={styles.image} style={{'--image': `url("${url}")`}}/>
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
    renderInfo(dataSet, date) {
        return (
            <div className={styles.date}>
                <div className={[styles.info, styles.dataSet].join(' ')}>
                    <Icon name='satellite-dish'/>
                    {getDataSet(dataSet).shortName}
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
                <div className={[styles.info, styles.value].join(' ')}>
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
                <div className={[styles.info, styles.value].join(' ')}>
                    <Icon name='calendar-check'/>
                    {daysFromTarget > 0 ? '+' : '-'}{Math.abs(daysFromTarget)}d
                </div>
                <div className={styles.bar}/>
            </div>
        )
    }

    renderSceneOverlay() {
        const {selected} = this.props
        return selected
            ? this.renderSelectedSceneOverlay()
            : this.renderAvailableSceneOverlay()
    }

    renderAvailableSceneOverlay() {
        const {scene, onAdd, onPreview} = this.props
        return (
            <ButtonGroup
                className={styles.overlayControls}
                layout='vertical'
                alignment='fill'>
                <Button
                    look='add'
                    icon='plus'
                    label={msg('button.add')}
                    onClick={() => onAdd(scene)}/>
                <Button
                    look='default'
                    icon='eye'
                    label={msg('process.mosaic.panel.sceneSelection.preview.label')}
                    onClick={() => onPreview(scene)}/>
            </ButtonGroup>
        )
    }

    renderSelectedSceneOverlay() {
        const {scene, onRemove, onPreview} = this.props
        return (
            <ButtonGroup
                className={styles.overlayControls}
                layout='horizontal'
                alignment='fill'>
                <Button
                    look='cancel'
                    icon='minus'
                    label={msg('button.remove')}
                    onClick={() => onRemove(scene)}/>
                <Button
                    look='default'
                    icon='eye'
                    label={msg('process.mosaic.panel.sceneSelection.preview.label')}
                    onClick={() => onPreview(scene)}/>
            </ButtonGroup>
        )
    }
}

Scene.propTypes = {
    scene: PropTypes.object,
    selected: PropTypes.bool,
    targetDate: PropTypes.string,
    onAdd: PropTypes.func,
    onPreview: PropTypes.func,
    onRemove: PropTypes.func
}
