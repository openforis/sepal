import {Button} from 'widget/button'
import {ButtonGroup} from 'widget/buttonGroup'
import {ElementResizeDetector} from 'widget/elementResizeDetector'
import {Layout} from 'widget/layout'
import {Panel} from 'widget/panel/panel'
import {Widget} from 'widget/widget'
import {activatable} from 'widget/activation/activatable'
import {compose} from 'compose'
import {debounceTime, throttleTime} from 'rxjs'
import {formatCoordinates} from 'coords'
import {msg} from 'translate'
import {withActivator} from 'widget/activation/activator'
import {withMap} from './mapContext'
import {withSubscriptions} from 'subscription'
import Keybinding from 'widget/keybinding'
import Notifications from 'widget/notifications'
import React from 'react'
import clipboard from 'clipboard'
import format from 'format'
import styles from './mapInfo.module.css'

const THROTTLE_TIME_MS = 100

class _MapInfoPanel extends React.Component {
    state = {
        view: {}
    }

    componentDidMount() {
        const {map: {view$}, addSubscription} = this.props
        addSubscription(
            view$.pipe(
                throttleTime(THROTTLE_TIME_MS, null, {leading: true, trailing: true})
            ).subscribe(
                view => {
                    this.setState({view})
                    this.updateMarker()
                }
            ),
            view$.pipe(
                debounceTime(100)
            ).subscribe(
                ({center}) => this.updateMarker(center)
            )
        )
    }

    componentWillUnmount() {
        this.updateMarker()
    }

    updateMarker(center) {
        const {map} = this.props
        const {removeMarker} = this
        removeMarker && removeMarker()
        if (center) {
            this.removeMarker = map.setLocationMarker({
                position: center,
                label: null,
                icon: {
                    path: 'M 1 -1 H 21 V 1 H 1 V 21 H -1 V 1 H -21 V -1 H -1 V -21 H 1 Z',
                    fillColor: 'white',
                    fillOpacity: .75,
                    strokeColor: 'black',
                    strokeOpacity: .75,
                    scale: 1
                }
            })
        }
    }

    render() {
        const {activatable: {deactivate}} = this.props
        const {view: {center, zoom}} = this.state
        return (
            <Panel className={styles.panel} type='top-right'>
                <Panel.Content>
                    <Layout type='vertical'>
                        {center && zoom && this.renderCenter(center, zoom)}
                    </Layout>
                </Panel.Content>
                <Keybinding keymap={{'Escape': deactivate}}/>
            </Panel>
        )
    }

    renderCenter(center, zoom) {
        return (
            <Widget label={msg('map.info.center')} spacing='compact'>
                <div className={styles.coordinates}>
                    {formatCoordinates(center, 5)}
                </div>
                <ButtonGroup layout='vertical' alignment='fill'>
                    <Button
                        shape='pill'
                        icon='copy'
                        label='[longitude, latitude]'
                        alignment='left'
                        tooltip={msg('map.info.copy')}
                        tooltipPlacement='left'
                        onClick={() => this.copyPlainCenterCoordinates(center)}
                    />
                    <Button
                        shape='pill'
                        icon='copy'
                        label='ee.Geometry.Point()'
                        alignment='left'
                        tooltip={msg('map.info.copy')}
                        tooltipPlacement='left'
                        onClick={() => this.copyEECenterCoordinates(center)}
                    />
                    <Button
                        shape='pill'
                        icon='copy'
                        label='Map.setCenter()'
                        alignment='left'
                        tooltip={msg('map.info.copy')}
                        tooltipPlacement='left'
                        onClick={() => this.copyEESetCenter(center, zoom)}
                    />
                </ButtonGroup>
            </Widget>
        )
    }

    copyPlainCenterCoordinates(center) {
        clipboard.copy(this.formatCenter(center))
        this.notify()
    }

    copyEECenterCoordinates(center) {
        clipboard.copy(`ee.Geometry.Point(${this.formatCenter(center)})`)
        this.notify()
    }

    copyEESetCenter({lat, lng}, zoom) {
        clipboard.copy(`Map.setCenter(${lng}, ${lat}, ${zoom})`)
        this.notify()
    }

    formatCenter({lat, lng}) {
        return `[${lng}, ${lat}]`
    }

    notify() {
        Notifications.info({
            message: msg('map.info.coordinatesCopied'),
            timeout: 2
        })
    }
}

const policy = () => ({
    _: 'allow'
})

const MapInfoPanel = compose(
    _MapInfoPanel,
    withMap(),
    withSubscriptions(),
    activatable({
        id: 'mapInfo',
        policy,
        alwaysAllow: true
    })
)

class _MapInfo extends React.PureComponent {
    state = {
        view: {},
        width: null
    }

    componentDidMount() {
        const {map: {view$}, addSubscription} = this.props
        addSubscription(
            view$.pipe(
                throttleTime(THROTTLE_TIME_MS, null, {leading: true, trailing: true})
            ).subscribe(
                view => view && this.setState({view})
            )
        )
    }

    render() {
        const {view: {scale}} = this.state
        return scale
            ? (
                <div className={styles.container}>
                    <MapInfoPanel/>
                    {this.renderButton()}
                </div>
            )
            : null
    }

    renderButton() {
        const {activator: {activatables: {mapInfo: {active, toggle}}}} = this.props
        const {view: {scale}, width} = this.state
        return (
            <Button
                look='default'
                shape='rectangle'
                size='x-small'
                additionalClassName={styles.button}
                air='less'
                tooltip={active ? null : msg('map.info.tooltip')}
                tooltipPlacement='bottomLeft'
                onClick={toggle}>
                <ElementResizeDetector onResize={({width}) => this.setState({width})}>
                    <div className={styles.content}>
                        <div>{format.number({value: scale, unit: 'm/px'})}</div>
                        <div className={styles.scale}></div>
                        <div>{format.number({value: width * scale, unit: 'm'})}</div>
                    </div>
                </ElementResizeDetector>
            </Button>
        )
    }
}

export const MapInfo = compose(
    _MapInfo,
    withMap(),
    withSubscriptions(),
    withActivator('mapInfo')
)

MapInfo.propTypes = {}
