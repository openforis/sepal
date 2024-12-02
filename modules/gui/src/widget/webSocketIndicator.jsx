import {CONNECTION_STATUS} from '~/api/ws'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {select} from '~/store'
import {msg} from '~/translate'

import {Button} from './button'

const ICON_VARIANT = {
    [CONNECTION_STATUS.NONE]: 'error',
    [CONNECTION_STATUS.PARTIAL]: 'warning',
    [CONNECTION_STATUS.FULL]: 'success'
}

const TOOLTIP_KEY = {
    [CONNECTION_STATUS.NONE]: 'connectionStatus.disconnected',
    [CONNECTION_STATUS.PARTIAL]: 'connectionStatus.partiallyConnected',
    [CONNECTION_STATUS.FULL]: 'connectionStatus.connected'
}

const _WebSocketConnectionIndicator = ({connectionStatus = CONNECTION_STATUS.NONE}) => (
    <Button
        chromeless
        look='transparent'
        size='large'
        air='less'
        icon='wifi'
        iconVariant={ICON_VARIANT[connectionStatus]}
        iconAttributes={{
            flip: connectionStatus !== CONNECTION_STATUS.FULL
        }}
        tooltip={msg(TOOLTIP_KEY[connectionStatus])}
    />
)

export const WebSocketConnectionIndicator = compose(
    _WebSocketConnectionIndicator,
    connect(() => ({
        connectionStatus: select('connectionStatus')
    }))
)
