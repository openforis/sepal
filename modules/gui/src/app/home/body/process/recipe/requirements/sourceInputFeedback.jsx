import {msg} from '~/translate'
import {Button} from '~/widget/button'

import {feedbackContent} from './feedbackMessageContent'
import {CHECKING_SOURCE} from './selectedSourceStatus'

// What the input a source is selected in says of it, from its section's status (selectedSourceStatus.js), as feedback
// for that input (inputFeedback.js): what holds the section back is its error, in its short message alone - the problems
// behind it stay in the status; a check still running is its busy indicator, with the check as its explanation; what
// other sections and optional requirements need is its warning, only while nothing holds the section back, so the input
// shows one indicator; and Refresh, where reading the source again may help, is beside its label.
export const sourceInputFeedback = (status, refresh) => {
    if (!status) {
        return null
    }
    const checking = status.state === CHECKING_SOURCE
    const held = status.state && !checking
    const advisories = status.advisories.map(feedbackContent)
    return {
        error: held ? feedbackContent(status) : null,
        busy: checking ? status.message : null,
        warning: !held && advisories.length ? advisories : null,
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
