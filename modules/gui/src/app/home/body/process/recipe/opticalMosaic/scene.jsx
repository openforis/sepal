import PropTypes from 'prop-types'
import React from 'react'

import format from '~/format'
import {Button} from '~/widget/button'
import {Icon} from '~/widget/icon'

import daysBetween from './daysBetween'
import styles from './scene.module.css'
import {getScenePreviewUrl} from './scenePreviewUrl'
import {getDataSet} from './sources'

export class Scene extends React.Component {
    render() {
        const {className, scene, selected, onPreview} = this.props
        return (
            <div
                className={[
                    styles.scene,
                    selected ? styles.selected : '',
                    className
                ].join(' ')}
                style={{cursor: 'pointer'}}
                onClick={() => onPreview(scene)}>
                {this.renderThumbnail()}
                {this.renderDetails()}
                {this.renderSceneOverlay()}
            </div>
        )
    }

    renderThumbnail() {
        const {scene} = this.props
        const imageUrl = getScenePreviewUrl(scene)
        return (
            <div className={styles.thumbnail}>
                <Icon name='spinner'/>
                {this.renderImage(imageUrl)}
            </div>
        )
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
            <div>
                <div className={styles.info}>
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
        return (
            <div className={styles.overlay}>
                {selected
                    ? this.renderRemoveButton()
                    : this.renderAddButton()}
            </div>

        )
    }

    renderAddButton() {
        const {scene, onAdd} = this.props
        return (
            <Button
                look='add'
                icon='plus'
                air='less'
                onClick={() => onAdd(scene)}/>
        )
    }

    renderRemoveButton() {
        const {scene, onRemove} = this.props
        return (
            <Button
                look='cancel'
                icon='minus'
                air='less'
                onClick={() => onRemove(scene)}/>
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
