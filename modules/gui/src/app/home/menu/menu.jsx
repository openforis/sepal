import PropTypes from 'prop-types'
import React from 'react'

import {compose} from '~/compose'
import {connect} from '~/connect'
import {isPathInLocation} from '~/route'
import {select} from '~/store'
import {msg} from '~/translate'
import {currentUser} from '~/user'
import {Button} from '~/widget/button'

import {usageHint} from '../user/usage'
import styles from './menu.module.css'
import {isFloating, MenuMode} from './menuMode'

const mapStateToProps = (state = {}) => ({
    floating: isFloating(),
    hasActiveTasks: !!(state.tasks && state.tasks.find(task => ['PENDING', 'ACTIVE'].includes(task.status))),
    budgetExceeded: select('user.budgetExceeded'),
    user: currentUser()
})

class _Menu extends React.Component {
    render() {
        const {className, floating, user, hasActiveTasks, budgetExceeded} = this.props
        return (
            <div className={className}>
                <div className={[styles.menu, floating && styles.floating].join(' ')}>
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
                        <MenuMode className={styles.mode}/>
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

const _SectionLink = ({active, name, icon, disabled}) => {
    const link = `/-/${name}`
    const activeClass = active ? styles.active : null
    return (
        <Button
            className={[styles[name], activeClass].join(' ')}
            icon={icon}
            route={link}
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

const SectionLink = compose(
    _SectionLink,
    connect(
        (state, {path}) => ({
            active: isPathInLocation(path)
        })
    )
)

SectionLink.propTypes = {
    disabled: PropTypes.any,
    icon: PropTypes.string,
    name: PropTypes.string
}
