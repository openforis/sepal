import {connect, select} from 'store'
import {msg} from 'translate'
import IconSwitch from 'widget/iconSwitch'
import PropTypes from 'prop-types'
import React from 'react'
import Tooltip from 'widget/tooltip'
import actionBuilder from 'action-builder'
import styles from './menuMode.module.css'

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
            <div className={className}>
                <Tooltip
                    msg={msg(floating ? 'home.sections.expand.tooltip' : 'home.sections.collapse.tooltip')}
                    placement='right'>
                    <div className={styles.menuMode}>
                        <IconSwitch
                            className={styles.switch}
                            on={!floating}
                            icon='angle-double-right'
                            onClassName={styles.switchOn}
                            onChange={() => this.toggle(floating)}/>
                    </div>
                </Tooltip>
            </div>
        )
    }
}

MenuMode.propTypes = {
    className: PropTypes.string,
    floating: PropTypes.bool
}

export default connect(mapStateToProps)(MenuMode)
