import {msg} from '~/translate'
import {Button} from '~/widget/button'

import {CHECKING_SOURCE} from './selectedSourceStatus'

// What the input a source is selected in says of it, from its section's status (selectedSourceStatus.js), as feedback
// for that input (inputFeedback.js): what holds the section back is its error, with every problem behind it; a check
// still running is its busy indicator, with the check as its explanation; what other sections and optional requirements
// need is its warning; and Refresh, where reading the source again may help, is beside its label.
export const sourceInputFeedback = (status, refresh) => {
    if (!status) {
        return null
    }
    const checking = status.state === CHECKING_SOURCE
    const advisories = status.advisories.map(({message}) => message)
    return {
        error: status.state && !checking ? withDetails(status) : null,
        busy: checking ? status.message : null,
        warning: advisories.length ? advisories : null,
        buttons: status.refresh
            ? [
                <Button
                    key='refresh'
                    look='transparent'
                    shape='pill'
                    air='less'
                    size='x-small'
                    icon='rotate'
                    label={msg('process.source.status.refresh')}
                    onClick={refresh}
                />
            ]
            : []
    }
}

const withDetails = ({message, details}) =>
    details.length ? [message, ...details] : message
