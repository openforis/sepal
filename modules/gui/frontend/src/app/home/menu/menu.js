import {Button} from 'widget/button'
import {connect, select} from 'store'
import {currentUser} from 'widget/user'
import {isFloating} from './menuMode'
import {isPathInLocation} from 'route'
import {msg} from 'translate'
import {quitApp, requestedApps} from 'apps'
import Icon from 'widget/icon'
import MenuMode from './menuMode'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './menu.module.css'

const mapStateToProps = (state = {}) => ({
    requestedApps: requestedApps(),
    floating: isFloating(),
    hasActiveTasks: !!(state.tasks && state.tasks.find(task => ['PENDING', 'ACTIVE'].includes(task.status))),
    budgetExceeded: select('user.budgetExceeded'),
    user: currentUser()
})

class Menu extends React.Component {
    appSection(app) {
        return <AppLink key={app.path} app={app}/>
    }

    render() {
        const {className, floating, requestedApps, user, hasActiveTasks, budgetExceeded} = this.props
        return (
            <div className={className}>
                <div className={[styles.menu, floating && styles.floating].join(' ')}>
                    <div className={styles.section}>
                        <SectionLink name='process' icon='globe' disabled={budgetExceeded}/>
                        <SectionLink name='browse' icon='folder-open'/>
                        <SectionLink name='terminal' icon='terminal' disabled={budgetExceeded}/>
                        <SectionLink name='app-launch-pad' icon='wrench' disabled={budgetExceeded}/>
                        {requestedApps.map(this.appSection)}
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
    requestedApps: PropTypes.arrayOf(PropTypes.object).isRequired,
    className: PropTypes.string,
    user: PropTypes.object
}

export default connect(mapStateToProps)(Menu)

let SectionLink = ({active, name, icon, disabled}) => {
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

SectionLink.propTypes = {
    disabled: PropTypes.any,
    icon: PropTypes.string,
    name: PropTypes.string
}
SectionLink = connect(
    (state, {name}) => ({
        active: isPathInLocation('/' + name)
    })
)(SectionLink)

let AppLink = ({active, app: {path, label, alt}}) => {
    const activeClass = active ? styles.active : null
    return (
        <div className={styles.app}>
            <div className={styles.stop} onClick={() => quitApp(path)}>
                <Icon name='times'/>
            </div>
            <Button
                className={activeClass}
                icon='cube'
                link={'/app' + path}
                tooltip={label || alt}
                tooltipPlacement='right'/>
        </div>
    )
}

AppLink.propTypes = {
    alt: PropTypes.string,
    app: PropTypes.object,
    label: PropTypes.string,
    path: PropTypes.string,
    onRemove: PropTypes.func
}
AppLink = connect(
    (state, {app: {path}}) => ({
        active: isPathInLocation('/app' + path)
    })
)(AppLink)
