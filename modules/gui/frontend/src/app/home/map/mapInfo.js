import {Button} from 'widget/button'
import {ButtonGroup} from 'widget/buttonGroup'
import {ElementResizeDetector} from 'widget/elementResizeDetector'
import {Layout} from 'widget/layout'
import {Widget} from 'widget/widget'
import {compose} from 'compose'
import {formatCoordinates} from 'coords'
import {msg} from 'translate'
import {withMap} from './mapContext'
import Notifications from 'widget/notifications'
import React from 'react'
import Tooltip from 'widget/tooltip'
import clipboard from 'clipboard'
import format from 'format'
import styles from './mapInfo.module.css'
import withSubscriptions from 'subscription'

class _MapInfo extends React.Component {
    state = {
        view: {},
        width: null
    }

    componentDidMount() {
        const {map, addSubscription} = this.props
        addSubscription(
            map.view$.subscribe(
                view => view && this.setState({view})
            )
        )
    }

    render() {
        const {view: {scale}, width} = this.state
        return scale
            ? (
                <div className={styles.container}>
                    <Tooltip
                        msg={this.renderTooltip()}
                        placement='bottomLeft'
                        clickTrigger={true}>
                        <Button
                            look='default'
                            shape='rectangle'
                            size='x-small'
                            additionalClassName={styles.button}
                            air='less'>
                            <ElementResizeDetector onResize={({width}) => this.setState({width})}>
                                <div className={styles.content}>
                                    <div>{format.number({value: scale, unit: 'm/px'})}</div>
                                    <div className={styles.scale}></div>
                                    <div>{format.number({value: width * scale, unit: 'm'})}</div>
                                </div>
                            </ElementResizeDetector>
                        </Button>
                    </Tooltip>
                </div>
            )
            : null
    }

    renderTooltip() {
        const {view: {center, bounds}} = this.state
        return (
            <Layout type='vertical'>
                {center && this.renderCenter(center)}
                {bounds && this.renderBounds(bounds)}
            </Layout>
        )
    }

    renderCenter(center) {
        return (
            <Widget label={msg('map.info.center')} spacing='compact'>
                <div>{formatCoordinates(center, 5)}</div>
                <ButtonGroup>
                    <Button
                        shape='pill'
                        icon='copy'
                        label='coords'
                        onClick={() => this.copyPlainCenterCoordinates(center)}
                    />
                    <Button
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
                <div>
                    <div>{formatCoordinates(sw, 5)}</div>
                    <div>{formatCoordinates(ne, 5)}</div>
                </div>
                <ButtonGroup>
                    <Button
                        shape='pill'
                        icon='copy'
                        label='coords'
                        onClick={() => this.copyPlainBoundsCoordinates(bounds)}
                    />
                    <Button
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
            message: msg('map.info.coordinatesCopied')
        })
    }
}

export const MapInfo = compose(
    _MapInfo,
    withMap(),
    withSubscriptions()
)

MapInfo.propTypes = {}
