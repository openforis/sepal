import React from 'react'
import {connect, select} from 'store'
import styles from './menuMode.module.css'
import Tooltip from 'widget/tooltip'
import actionBuilder from 'action-builder'
import FlipSwitch from 'widget/flipSwitch'
import PropTypes from 'prop-types'

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
                <Tooltip msg={floating ? 'home.sections.floating' : 'home.sections.fixed'} right>
                    <div className={styles.modeSwitch}>
                        <FlipSwitch
                            on={!floating}
                            offIcon='lock'
                            onIcon='unlock'
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
