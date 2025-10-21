import React from 'react'

import {msg} from '~/translate'
import {Button} from '~/widget/button'
import {Icon} from '~/widget/icon'
import {Panel} from '~/widget/panel/panel'

import daysBetween from './daysBetween'
import styles from './scenePreview.module.css'
import {getScenePreviewUrl} from './scenePreviewUrl'
import {getDataSet} from './sources'

export class ScenePreview extends React.Component {
    constructor(props) {
        super(props)
        this.close = this.close.bind(this)
    }

    render() {
        const {targetDate, scene} = this.props
        if (scene) {
            const {id, dataSet, date, cloudCover} = scene
            const browseUrl = getScenePreviewUrl(scene)
            const daysFromTarget = daysBetween(targetDate, date)
            const daysFromTargetString = daysFromTarget === 0
                ? msg('process.mosaic.panel.sceneSelection.preview.onTarget')
                : daysFromTarget < 0
                    ? msg('process.mosaic.panel.sceneSelection.preview.beforeTarget', {daysFromTarget: -daysFromTarget})
                    : msg('process.mosaic.panel.sceneSelection.preview.afterTarget', {daysFromTarget})
            return (
                <Panel
                    className={styles.panel}
                    type='modal'>
                    <Panel.Header
                        icon='image'
                        title={'Scene preview'}
                        label={id}/>
                    <Panel.Content>
                        <div onClick={this.close}
                            className={styles.thumbnail}
                            style={{'backgroundImage': `url(${browseUrl})`}}>
                            <img src={browseUrl} alt={id}/>
                        </div>
                        <div className={styles.details}>
                            <LabelValue name='dataSet' value={getDataSet(dataSet).name} icon='satellite-dish'/>
                            <LabelValue name='date' value={date} icon='calendar'/>
                            <LabelValue name='daysFromTarget' value={daysFromTargetString} icon='calendar-check'/>
                            <LabelValue name='cloudCover' value={`${cloudCover}%`} icon='cloud'/>
                        </div>
                    </Panel.Content>
                    <Panel.Buttons>
                        <Panel.Buttons.Main>
                            <Panel.Buttons.Close
                                keybinding={['Enter', 'Escape']}
                                onClick={this.close}
                            />
                        </Panel.Buttons.Main>
                        <Panel.Buttons.Extra>
                            {this.renderAddButton()}
                            {this.renderRemoveButton()}
                        </Panel.Buttons.Extra>
                    </Panel.Buttons>
                </Panel>
            )
        } else
            return null
    }

    renderAddButton() {
        const {scene, selected, onAdd} = this.props
        return onAdd && !selected ? (
            <Button
                look='add'
                icon='plus'
                label={msg('process.mosaic.preview.addScene')}
                onClick={() => onAdd(scene)}/>
        ) : null
    }

    renderRemoveButton() {
        const {scene, selected, onRemove} = this.props
        return onRemove && selected ? (
            <Button
                look='cancel'
                icon='minus'
                label={msg('process.mosaic.preview.removeScene')}
                onClick={() => onRemove(scene)}/>
        ) : null
    }

    close() {
        const {onClose} = this.props
        onClose && onClose()
    }
}

const LabelValue = ({name, value, icon}) =>
    <div className={styles[name]}>
        <label className={styles.label}>
            <Icon name={icon}/>
            {msg(['process.mosaic.panel.sceneSelection.preview', name])}
        </label>
        <div className={styles.value}>{value}</div>
    </div>
