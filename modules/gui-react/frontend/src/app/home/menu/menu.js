import React from 'react'
import {connect} from 'store'
import styles from './menu.module.css'
import Tooltip from 'widget/tooltip'
import {Link, isPathInLocation} from 'route'
import {requestedApps, quitApp} from 'apps'
import Icon from 'widget/icon'
import PropTypes from 'prop-types'
import {isFloating} from './menuMode'
import MenuMode from '../menu/menuMode'

const mapStateToProps = () => ({
    requestedApps: requestedApps(),
    floating: isFloating()
})

class Menu extends React.Component {
    appSection(app) {
        return <AppLink key={app.path} app={app}/>
    }
    render() {
        const {className, floating, requestedApps, user} = this.props
        return (
            <div className={className}>
                <div className={[styles.menu, floating && styles.floating].join(' ')}>
                    <div className={styles.section}>
                        <SectionLink name='process' icon='globe'/>
                        <SectionLink name='browse' icon='folder-open'/>
                        <SectionLink name='terminal' icon='terminal'/>
                        <SectionLink name='app-launch-pad' icon='wrench'/>
                        {requestedApps.map(this.appSection)}
                        <SectionLink name='tasks' icon='tasks'/>
                    </div>
                    <div className={styles.section}>
                        <SectionLink name='account' icon='user'/>
                        {/* {user.admin ? <SectionLink name='users' icon='users'/> : null} */}
                        <SectionLink name='users' icon='users'/>
                        <MenuMode className={styles.menuMode}/>
                    </div>
                </div>
            </div>
        )
    }
}

Menu.propTypes = {
    className: PropTypes.string,
    floating: PropTypes.bool.isRequired,
    requestedApps: PropTypes.arrayOf(PropTypes.object).isRequired,
    user: PropTypes.object
}

const SectionLink = ({name, icon}) => {
    const linkPath = '/' + name
    const activeClass = isPathInLocation(linkPath) ? styles.active : null
    return (
        <Link to={linkPath} onMouseDown={(e) => e.preventDefault()}>
            <Tooltip msg={'home.sections.' + name} right>
                <button className={[`${styles[name]}`, activeClass].join(' ')}>
                    <Icon name={icon}/>
                </button>
            </Tooltip>
        </Link>
    )
}

SectionLink.propTypes = {
    name: PropTypes.string,
    icon: PropTypes.string
}

const AppLink = ({app: {path, label, alt}}) => {
    const linkPath = '/app' + path
    const activeClass = isPathInLocation(linkPath) ? styles.active : null
    return (
        <div className={styles.app}>
            <div className={styles.stop} onClick={() => quitApp(path)}>
                <Icon name='times'/>
            </div>
            <Link to={linkPath} onMouseDown={(e) => e.preventDefault()}>
                <Tooltip rawMsg={label || alt} right>
                    <button className={activeClass}>
                        <Icon name='cubes'/>
                    </button>
                </Tooltip>
            </Link>
        </div>
    )
}

AppLink.propTypes = {
    app: PropTypes.object,
    path: PropTypes.string,
    label: PropTypes.string,
    alt: PropTypes.string,
    onRemove: PropTypes.func
}

export default connect(mapStateToProps)(Menu)
