import {Button} from 'widget/button'
import {MenuMode, isFloating} from './menuMode'
import {compose} from 'compose'
import {connect} from 'connect'
import {currentUser} from 'user'
import {isPathInLocation} from 'route'
import {msg} from 'translate'
import {select} from 'store'
import {usageHint} from '../user/usage'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './menu.module.css'

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
                        <SectionLink name='process' icon='globe'/>
                        <SectionLink name='browse' icon='folder-open'/>
                        <SectionLink name='terminal' icon='terminal' disabled={budgetExceeded}/>
                        <SectionLink name='app-launch-pad' icon='wrench' disabled={budgetExceeded}/>
                    </div>
                    <div className={styles.section}>
                        <SectionLink name='tasks' icon={hasActiveTasks ? 'spinner' : 'tasks'} disabled={budgetExceeded}/>
                        {user.admin ? <SectionLink name='users' icon='users'/> : null}
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
    const link = `/${name}`
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
        (state, {name}) => ({
            active: isPathInLocation(`/${name}`)
        })
    )
)

SectionLink.propTypes = {
    disabled: PropTypes.any,
    icon: PropTypes.string,
    name: PropTypes.string
}
