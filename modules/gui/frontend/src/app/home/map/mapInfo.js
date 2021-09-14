import {Activator} from 'widget/activation/activator'
import {Button} from 'widget/button'
import {ButtonGroup} from 'widget/buttonGroup'
import {ElementResizeDetector} from 'widget/elementResizeDetector'
import {Layout} from 'widget/layout'
import {Panel} from 'widget/panel/panel'
import {Widget} from 'widget/widget'
import {activatable} from 'widget/activation/activatable'
import {compose} from 'compose'
import {formatCoordinates} from 'coords'
import {msg} from 'translate'
import {throttleTime} from 'rxjs'
import {withMap} from './mapContext'
import Notifications from 'widget/notifications'
import React from 'react'
import clipboard from 'clipboard'
import format from 'format'
import styles from './mapInfo.module.css'
import withSubscriptions from 'subscription'

const THROTTLE_TIME_MS = 100

class _MapInfoPanel extends React.Component {
    state = {
        view: {}
    }

    componentDidMount() {
        const {map: {view$}, addSubscription} = this.props
        addSubscription(
            view$.pipe(
                throttleTime(THROTTLE_TIME_MS)
            ).subscribe(
                view => view && this.setState({view})
            )
        )
    }

    render() {
        const {activatable: {deactivate}} = this.props
        const {view: {center, bounds}} = this.state
        return (
            <Panel className={styles.panel} type='top-right'>
                <Panel.Content>
                    <Layout type='vertical'>
                        {center && this.renderCenter(center)}
                        {bounds && this.renderBounds(bounds)}
                    </Layout>
                </Panel.Content>
                <Panel.Buttons onEnter={deactivate} onEscape={deactivate}>
                    <Panel.Buttons.Main>
                        <Panel.Buttons.Close onClick={deactivate}/>
                    </Panel.Buttons.Main>
                </Panel.Buttons>
            </Panel>
        )
    }

    renderCenter(center) {
        return (
            <Widget label={msg('map.info.center')} spacing='compact'>
                <div className={styles.coordinates}>
                    {formatCoordinates(center, 5)}
                </div>
                <ButtonGroup>
                    <Button
                        look='highlight'
                        shape='pill'
                        icon='copy'
                        label='coords'
                        onClick={() => this.copyPlainCenterCoordinates(center)}
                    />
                    <Button
                        look='highlight'
                        shape='pill'
                        icon='copy'
                        label='EE'
                        onClick={() => this.copyEECenterCoordinates(center)}
                    />
                </ButtonGroup>
            </Widget>
        )
    }

    renderBounds(bounds) {
        const [sw, ne] = bounds
        return (
            <Widget label={msg('map.info.bounds')} spacing='compact'>
                <div className={styles.coordinates}>
                    <div>{formatCoordinates(sw, 5)}</div>
                    <div>{formatCoordinates(ne, 5)}</div>
                </div>
                <ButtonGroup>
                    <Button
                        look='highlight'
                        shape='pill'
                        icon='copy'
                        label='coords'
                        onClick={() => this.copyPlainBoundsCoordinates(bounds)}
                    />
                    <Button
                        look='highlight'
                        shape='pill'
                        icon='copy'
                        label='EE'
                        onClick={() => this.copyEEBoundsCoordinates(bounds)}
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

    copyPlainBoundsCoordinates(bounds) {
        clipboard.copy(this.formatBounds(bounds))
        this.notify()
    }

    copyEEBoundsCoordinates(bounds) {
        clipboard.copy(`ee.Geometry.Rectangle(${this.formatBounds(bounds)})`)
        this.notify()
    }

    formatCenter({lat, lng}) {
        return `[${lng}, ${lat}]`
    }

    formatBounds([[w, s], [e, n]]) {
        return `[[${w}, ${s}], [${e}, ${n}]]`
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

export const MapInfoPanel = compose(
    _MapInfoPanel,
    withMap(),
    withSubscriptions(),
    activatable({
        id: 'mapInfo',
        policy,
        alwaysAllow: true
    })
)

class _MapInfo extends React.Component {
    state = {
        view: {},
        width: null
    }

    componentDidMount() {
        const {map: {view$}, addSubscription} = this.props
        addSubscription(
            view$.pipe(
                throttleTime(THROTTLE_TIME_MS)
            ).subscribe(
                view => view && this.setState({view})
            )
        )
    }

    render() {
        const {view: {scale}, width} = this.state
        return scale
            ? (
                <div className={styles.container}>
                    <MapInfoPanel/>
                    <Activator id={'mapInfo'}>
                        {({activate, deactivate, active, canActivate}) => (
                            <Button
                                look='default'
                                shape='rectangle'
                                size='x-small'
                                additionalClassName={styles.button}
                                onClick={() => active ? deactivate() : activate()}
                                // disabled={!canActivate}
                                air='less'>
                                <ElementResizeDetector onResize={({width}) => this.setState({width})}>
                                    <div className={styles.content}>
                                        <div>{format.number({value: scale, unit: 'm/px'})}</div>
                                        <div className={styles.scale}></div>
                                        <div>{format.number({value: width * scale, unit: 'm'})}</div>
                                    </div>
                                </ElementResizeDetector>
                            </Button>
                        )}
                    </Activator>
                </div>
            )
            : null
    }

}

export const MapInfo = compose(
    _MapInfo,
    withMap(),
    withSubscriptions()
)

MapInfo.propTypes = {}
