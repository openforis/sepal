import React from 'react'
import {connect, select} from 'store'
import styles from './navBar.module.css'
import Tooltip from 'widget/tooltip'
import {Link} from 'route'
import {requestedApps, quitApp} from 'apps'
import Icon from 'widget/icon'
import actionBuilder from 'action-builder'
import ToggleSwitch from 'widget/toggleSwitch'
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
        const {requestedApps} = this.props
        return (
            <div className={styles.navbarContainer}>
                <div className={[styles.navbar, this.props.locked ? styles.locked : styles.unlocked].join(' ')}>
                    {/*<LockSwitch locked={this.props.locked} onChange={this.setUnlocked.bind(this)}/>*/}
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
    locked: PropTypes.bool.isRequired,
    requestedApps: PropTypes.arrayOf(PropTypes.object).isRequired
}

const SectionLink = ({name, icon}) =>
    <Link to={'/' + name} onMouseDown={(e) => e.preventDefault()}>
        <Tooltip msg={'home.sections.' + name} right>
            <button className={`${styles[name]}`}>
                <Icon name={icon}/>
            </button>
        </Tooltip>
    </Link>

SectionLink.propTypes = {
    name: PropTypes.string,
    icon: PropTypes.string
}

const AppLink = ({app: {path, label, alt}}) =>
    <div className={styles.app}>
        <div className={styles.stop} onClick={() => quitApp(path)}>
            <Icon name='times'/>
        </div>
        <Link to={'/app' + path} onMouseDown={(e) => e.preventDefault()}>
            <Tooltip rawMsg={label || alt} right>
                <button>
                    <Icon name='cubes'/>
                </button>
            </Tooltip>
        </Link>
    </div>

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
            <ToggleSwitch
                on={!locked}
                offIcon='lock'
                onIcon='unlock'
                onChange={onChange}/>
        </div>
    </Tooltip>

LockSwitch.propTypes = {
    locked: PropTypes.bool,
    onChange: PropTypes.func
}

export default NavBar = connect(mapStateToProps)(NavBar)
