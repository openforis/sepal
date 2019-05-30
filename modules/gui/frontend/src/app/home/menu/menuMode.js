import {Button} from 'widget/button'
import {compose} from 'compose'
import {connect, select} from 'store'
import {msg} from 'translate'
import PropTypes from 'prop-types'
import React from 'react'
import actionBuilder from 'action-builder'

export function isFloating() {
    return select('menu.floating') == null ? false : !!select('menu.floating')
}

const mapStateToProps = () => ({
    floating: isFloating()
})

class MenuMode extends React.Component {
    toggle(state) {
        actionBuilder('TOGGLE_MENU')
            .set('menu.floating', !state)
            .dispatch()
    }
    
    render () {
        const {className, floating} = this.props
        return (
            <Button
                look='transparent'
                size='small'
                additionalClassName={className}
                icon={floating ? 'lock-open' : 'lock'}
                iconFlipHorizontal={floating}
                onClick={() => this.toggle(floating)}
                tooltip={msg(floating ? 'home.sections.expand' : 'home.sections.collapse')}
                tooltipPlacement='right'/>
        )
    }
}

MenuMode.propTypes = {
    className: PropTypes.string,
    floating: PropTypes.bool
}

export default compose(
    MenuMode,
    connect(mapStateToProps)
)
