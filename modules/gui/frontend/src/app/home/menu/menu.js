import {Button} from 'widget/button'
import {compose} from 'compose'
import {connect, select} from 'store'
import {currentUser} from 'widget/user'
import {isFloating} from './menuMode'
import {isPathInLocation} from 'route'
import {msg} from 'translate'
import MenuMode from './menuMode'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './menu.module.css'

const mapStateToProps = (state = {}) => ({
    floating: isFloating(),
    hasActiveTasks: !!(state.tasks && state.tasks.find(task => ['PENDING', 'ACTIVE'].includes(task.status))),
    budgetExceeded: select('user.budgetExceeded'),
    user: currentUser()
})

class Menu extends React.Component {
    render() {
        const {className, floating, user, hasActiveTasks, budgetExceeded} = this.props
        return (
            <div className={className}>
                <div className={[styles.menu, floating && styles.floating].join(' ')}>
                    <div className={styles.section}>
                        <SectionLink name='process' icon='globe' disabled={budgetExceeded}/>
                        <SectionLink name='browse' icon='folder-open'/>
                        <SectionLink name='terminal' icon='terminal' disabled={budgetExceeded}/>
                        <SectionLink name='app-launch-pad' icon='wrench' disabled={budgetExceeded}/>
                    </div>
                    <div className={styles.section}>
                        <SectionLink name='tasks' icon={hasActiveTasks ? 'spinner' : 'tasks'} disabled={budgetExceeded}/>
                        {user.admin ? <SectionLink name='users' icon='users'/> : null}
                        <MenuMode className={styles.mode}/>
                    </div>
                </div>
            </div>
        )
    }
}

Menu.propTypes = {
    floating: PropTypes.bool.isRequired,
    className: PropTypes.string,
    user: PropTypes.object
}

export default compose(
    Menu,
    connect(mapStateToProps)
)

const _SectionLink = ({active, name, icon, disabled}) => {
    const link = '/' + name
    const activeClass = active ? styles.active : null
    return (
        <Button
            className={[styles[name], activeClass].join(' ')}
            icon={icon}
            link={link}
            tooltip={msg(`home.sections.${name}`)}
            tooltipPlacement='right'
            disabled={disabled}
        />
    )
}

const SectionLink = compose(
    _SectionLink,
    connect(
        (state, {name}) => ({
            active: isPathInLocation('/' + name)
        })
    )
)

SectionLink.propTypes = {
    disabled: PropTypes.any,
    icon: PropTypes.string,
    name: PropTypes.string
}
