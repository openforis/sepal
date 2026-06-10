import {Transport} from '../transport.js'

const PortTransport = ({transportId, port, onChannel}) => {
    const transport = Transport({transportId, messageOut: message => port.postMessage(message), onChannel})
    port.on('message', message => {
        transport.messageIn(message)
    })
    return transport
}

export {
    PortTransport
}
