import {Button} from 'widget/button'
import {connect} from 'store'
import {isFloating} from './menuMode'
import {isPathInLocation} from 'route'
import {msg} from 'translate'
import {quitApp, requestedApps} from 'apps'
import Icon from 'widget/icon'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './menu.module.css'

const mapStateToProps = (state = {}) => ({
    requestedApps: requestedApps(),
    floating: isFloating(),
    hasActiveTasks: !!(state.tasks && state.tasks.find(task => ['PENDING', 'ACTIVE'].includes(task.status)))
})

class Menu extends React.Component {
    appSection(app) {
        return <AppLink key={app.path} app={app}/>
    }

    render() {
        const {className, floating, requestedApps, user, hasActiveTasks} = this.props
        return (
            <div className={className}>
                <div className={[styles.menu, floating && styles.floating].join(' ')}>
                    <div className={styles.section}>
                        <SectionLink name='process' icon='globe'/>
                        <SectionLink name='browse' icon='folder-open'/>
                        <SectionLink name='terminal' icon='terminal'/>
                        <SectionLink name='app-launch-pad' icon='wrench'/>
                        {requestedApps.map(this.appSection)}
                    </div>
                    <div className={styles.section}>
                        <SectionLink name='tasks' icon={hasActiveTasks ? 'spinner' : 'tasks'}/>
                        {user.admin ? <SectionLink name='users' icon='users'/> : null}
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

let SectionLink = ({active, name, icon}) => {
    const link = '/' + name
    const activeClass = active ? styles.active : null
    return (
        <Button
            className={[styles[name], activeClass].join(' ')}
            icon={icon}
            link={link}
            tooltip={msg(`home.sections.${name}.tooltip`)}
            tooltipPlacement='right'
            stopPropagation={false}
        />
    )
}

SectionLink.propTypes = {
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
