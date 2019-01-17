import {Button} from 'widget/button'
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
                chromeless
                look='transparent'
                size='large'
                additionalClassName={className}
                icon={'angle-double-right'}
                iconFlipHorizontal={floating}
                onClick={() => this.toggle(floating)}
                tooltip={msg(floating ? 'home.sections.expand.tooltip' : 'home.sections.collapse.tooltip')}
                tooltipPlacement='top'/>
        )
    }
}

MenuMode.propTypes = {
    className: PropTypes.string,
    floating: PropTypes.bool
}

export default connect(mapStateToProps)(MenuMode)
