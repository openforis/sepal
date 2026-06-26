import PropTypes from 'prop-types'
import React from 'react'
import {catchError, first, of, Subject, switchMap} from 'rxjs'

import api from '~/apiRegistry'
import {compose} from '~/compose'
import format from '~/format'
import {withSubscriptions} from '~/subscription'
import {Button} from '~/widget/button'
import {Icon} from '~/widget/icon'

import daysBetween from './daysBetween'
import styles from './scene.module.css'
import {ScenePreview} from './scenePreview'
import {getScenePreviewUrl, toGEEImageId, usgsLandsatPreview} from './scenePreviewUrl'
import {getDataSet} from './sources'

class _Scene extends React.Component {
    image$ = new Subject()

    state = {
        loaded: false,
        failed: false,
        url: null,
        preview: false
    }

    render() {
        const {className, selected} = this.props
        return (
            <div
                className={[
                    styles.scene,
                    selected ? styles.selected : '',
                    className
                ].join(' ')}
                style={{cursor: 'pointer'}}
                onClick={() => this.setState({preview: true})}>
                {this.renderThumbnail()}
                {this.renderDetails()}
                {this.renderSceneOverlay()}
                {this.renderPreview()}
            </div>
        )
    }

    renderThumbnail() {
        const {scene} = this.props
        const imageUrl = getScenePreviewUrl(scene)
        return (
            <div className={styles.thumbnail}>
                {this.renderLoading()}
                {this.renderResult(imageUrl)}
            </div>
        )
    }

    renderLoading() {
        const {loaded, failed} = this.state
        return loaded || failed
            ? null
            : <Icon className={styles.icon} name='spinner'/>
    }

    renderResult(imageUrl) {
        const {failed} = this.state
        return failed
            ? this.renderFailed()
            : this.renderImage(imageUrl)
    }

    renderImage() {
        const {url} = this.state
        return (
            <img
                className={styles.image}
                src={url}
                onLoad={() => this.image$.next(true)}
                onError={() => this.image$.next(false)}
            />
        )
    }

    renderFailed() {
        return (
            <Icon className={styles.icon} name='times'/>
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

    renderPreview() {
        const {scene, selected, targetDate, onAdd, onRemove} = this.props
        const {url, preview} = this.state
        return preview ? (
            <ScenePreview
                scene={scene}
                selected={selected}
                imageUrl={url}
                targetDate={targetDate}
                onAdd={() => onAdd(scene)}
                onRemove={() => onRemove(scene)}
                onClose={() => this.setState({preview: false})}
            />
        ) : null
    }

    setImage$(url) {
        this.setState({url})
        return this.image$.pipe(first())
    }

    componentDidMount() {
        const {scene, addSubscription} = this.props

        addSubscription(
            this.setImage$(getScenePreviewUrl(scene)).pipe(
                switchMap(success => success
                    ? of(true)
                    : api.gee.landsatProductId$({sceneId: toGEEImageId(scene.id)}).pipe(
                        switchMap(({landsatProductId}) =>
                            this.setImage$(usgsLandsatPreview(landsatProductId))
                        ),
                        catchError(() => of(false))
                    )
                )
            ).subscribe({
                next: success => this.setState({loaded: success, failed: !success})
            })
        )
    }
}

export const Scene = compose(
    _Scene,
    withSubscriptions()
)

Scene.propTypes = {
    scene: PropTypes.object,
    selected: PropTypes.bool,
    targetDate: PropTypes.string,
    onAdd: PropTypes.func,
    onRemove: PropTypes.func
}
