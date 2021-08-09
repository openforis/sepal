import {Button} from 'widget/button'
import {ButtonGroup} from 'widget/buttonGroup'
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
        view: {}
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
        const {view: {scale}} = this.state
        return scale
            ? (
                <div className={styles.container}>
                    <Tooltip
                        msg={this.tooltip()}
                        placement='bottomLeft'
                        clickTrigger={true}>
                        <Button
                            look='transparent'
                            shape='pill'
                            size='small'>
                            {format.number({value: scale, unit: 'm/px'})}
                        </Button>
                    </Tooltip>
                </div>
            )
            : null
    }

    tooltip() {
        const {view: {center, bounds: [sw, ne]}} = this.state
        return (
            <Layout type='vertical'>
                <Widget label={msg('map.info.center')} spacing='compact'>
                    <div>{formatCoordinates(center, 5)}</div>
                    <ButtonGroup>
                        <Button
                            shape='pill'
                            icon='copy'
                            label='coords'
                            onClick={() => this.copyPlainCenterCoordinates()}
                        />
                        <Button
                            shape='pill'
                            icon='copy'
                            label='EE'
                            onClick={() => this.copyEECenterCoordinates()}
                        />
                    </ButtonGroup>
                </Widget>
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
                            onClick={() => this.copyPlainBoundsCoordinates()}
                        />
                        <Button
                            shape='pill'
                            icon='copy'
                            label='EE'
                            onClick={() => this.copyEEBoundsCoordinates()}
                        />
                    </ButtonGroup>
                </Widget>
            </Layout>
        )
    }

    getCenter() {
        const {view: {center: {lat, lng}}} = this.state
        return `[${lng}, ${lat}]`
    }

    getBounds() {
        const {view: {bounds: [[w, s], [e, n]]}} = this.state
        return `[[${w}, ${s}], [${e}, ${n}]]`
    }

    copyPlainCenterCoordinates() {
        clipboard.copy(this.getCenter())
        this.notify()
    }

    copyEECenterCoordinates() {
        clipboard.copy(`ee.Geometry.Point(${this.getCenter()})`)
        this.notify()
    }

    copyPlainBoundsCoordinates() {
        clipboard.copy(this.getBounds())
        this.notify()
    }

    copyEEBoundsCoordinates() {
        clipboard.copy(`ee.Geometry.Rectangle(${this.getBounds()})`)
        this.notify()
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
