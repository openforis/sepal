import {Button} from '~/widget/button'
import {actionBuilder} from '~/action-builder'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {msg} from '~/translate'
import {select} from '~/store'
import PropTypes from 'prop-types'
import React from 'react'

export function isFloating() {
    return select('menu.floating') === null ? false : !!select('menu.floating')
}

const mapStateToProps = () => ({
    floating: isFloating()
})

class _MenuMode extends React.Component {
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
                iconAttributes={{
                    flip: 'horizontal'
                }}
                tooltip={msg(floating ? 'home.sections.expand' : 'home.sections.collapse')}
                tooltipPlacement='right'
                onClick={() => this.toggle(floating)}
            />
        )
    }
}

export const MenuMode = compose(
    _MenuMode,
    connect(mapStateToProps)
)

MenuMode.propTypes = {
    className: PropTypes.string,
    floating: PropTypes.bool
}
