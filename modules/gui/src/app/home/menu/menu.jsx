import PropTypes from 'prop-types'
import React from 'react'
import {useLocation} from 'react-router'

import {isChatOpen, toggleChat} from '~/app/home/body/chat/chatPanel'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {isPathInLocation} from '~/route'
import {select} from '~/store'
import {msg} from '~/translate'
import {currentUser} from '~/user'
import {Button} from '~/widget/button'

import {usageHint} from '../user/usage'
import styles from './menu.module.css'

const mapStateToProps = (state = {}) => ({
    hasActiveTasks: !!(state.tasks && state.tasks.find(task => ['PENDING', 'ACTIVE'].includes(task.status))),
    budgetExceeded: select('user.budgetExceeded'),
    chatOpen: isChatOpen(),
    user: currentUser()
})

class _Menu extends React.Component {
    render() {
        const {className, user, hasActiveTasks, budgetExceeded, chatOpen} = this.props
        return (
            <div className={className}>
                <div className={styles.menu}>
                    <div className={styles.section}>
                        <SectionLink name='process' path='/' icon='globe'/>
                        <SectionLink name='browse' path='/-/browse' icon='folder-open'/>
                        <SectionLink name='terminal' path='/-/terminal' icon='terminal' disabled={budgetExceeded}/>
                        <SectionLink name='app-launch-pad' path='/-/app-launch-pad' icon='wrench' disabled={budgetExceeded}/>
                    </div>
                    <div className={styles.section}>
                        <SectionLink name='tasks' path='/-/tasks' icon={hasActiveTasks ? 'spinner' : 'tasks'} disabled={budgetExceeded}/>
                        {user.admin ? <SectionLink name='users' path='/-/users' icon='users'/> : null}
                        <Link name='help' icon='question-circle' href='https://docs.sepal.io/'/>
                        <ToggleLink name='chat' icon='comments' active={chatOpen} onClick={toggleChat}/>
                    </div>
                </div>
            </div>
        )
    }
}

export const Menu = compose(
    _Menu,
    connect(mapStateToProps)
)

Menu.propTypes = {
    chatOpen: PropTypes.bool,
    className: PropTypes.string
}

const Link = ({name, icon, href}) =>
    <Button
        className={styles[name]}
        icon={icon}
        tooltip={msg(`home.sections.${name}`)}
        tooltipPlacement='right'
        linkUrl={href}
        linkTarget='_blank'
    />

const ToggleLink = ({name, icon, active, onClick}) =>
    <Button
        className={[styles[name], active ? styles.active : null].join(' ')}
        icon={icon}
        tooltip={msg(`home.sections.${name}`)}
        tooltipPlacement='right'
        onClick={onClick}
    />

const SectionLink = ({path, name, icon, disabled}) => {
    const location = useLocation()
    const active = isPathInLocation(path, location.pathname)
    const activeClass = active ? styles.active : null

    return (
        <Button
            className={[styles[name], activeClass].join(' ')}
            icon={icon}
            route={path}
            tooltip={[
                msg(`home.sections.${name}`),
                (disabled ? msg('user.quotaUpdate.info') : null)
            ]}
            tooltipPlacement='right'
            tooltipAllowedWhenDisabled
            tooltipOnVisible={enabled => disabled && usageHint(enabled)}
            disabled={disabled}
        />
    )
}
