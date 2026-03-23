import PropTypes from 'prop-types'

import {msg} from '~/translate'
import {Button} from '~/widget/button'

export const ChatButton = ({isOpen, onClick}) => {
    return (
        <Button
            chromeless
            look='transparent'
            size='large'
            air='less'
            icon='comments'
            tooltip={msg('home.sections.chat')}
            tooltipPlacement='top'
            tooltipDisabled={isOpen}
            onClick={onClick}
        />
    )
}

ChatButton.propTypes = {
    isOpen: PropTypes.bool.isRequired,
    onClick: PropTypes.func.isRequired
}
