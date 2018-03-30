import React from 'react'
import {connect, select} from 'store'
import styles from './navBar.module.css'
import Tooltip from 'widget/tooltip'
import {Link, isPathInLocation} from 'route'
import {requestedApps, quitApp} from 'apps'
import Icon from 'widget/icon'
import actionBuilder from 'action-builder'
import FlipSwitch from 'widget/flipSwitch'
import PropTypes from 'prop-types'

export function isNavBarLocked() {
    return select('menu.locked') == null ? true : !!select('menu.locked')
}

const mapStateToProps = () => ({
    requestedApps: requestedApps(),
    locked: isNavBarLocked()
})

class NavBar extends React.Component {
    appSection(app) {
        return <AppLink key={app.path} app={app}/>
    }

    setUnlocked(unlocked) {
        actionBuilder('TOGGLE_MENU')
            .set('menu.locked', !unlocked)
            .dispatch()
    }

    render() {
        const {className, requestedApps} = this.props
        return (
            <div className={[styles.navbarContainer, className].join(' ')}>
                <div className={[styles.navbar, this.props.locked ? styles.locked : styles.unlocked].join(' ')}>
                    <LockSwitch locked={this.props.locked} onChange={this.setUnlocked.bind(this)}/>
                    <SectionLink name='process' icon='globe'/>
                    <SectionLink name='browse' icon='folder-open'/>
                    <SectionLink name='terminal' icon='terminal'/>
                    <SectionLink name='app-launch-pad' icon='wrench'/>
                    {requestedApps.map(this.appSection)}
                </div>
            </div>
        )
    }
}

NavBar.propTypes = {
    className: PropTypes.string,
    locked: PropTypes.bool.isRequired,
    requestedApps: PropTypes.arrayOf(PropTypes.object).isRequired
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

const LockSwitch = ({locked, onChange}) =>
    <Tooltip msg={locked ? 'home.sections.locked' : 'home.sections.unlocked'} right>
        <div className={styles.lockSwitch}>
            <FlipSwitch
                on={!locked}
                offIcon='unlock'
                onIcon='lock'
                onChange={onChange}/>
        </div>
    </Tooltip>

LockSwitch.propTypes = {
    locked: PropTypes.bool,
    onChange: PropTypes.func
}

export default NavBar = connect(mapStateToProps)(NavBar)
