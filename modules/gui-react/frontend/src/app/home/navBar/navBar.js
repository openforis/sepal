import React from 'react'
import {connect, select} from 'store'
import styles from './navBar.module.css'
import Tooltip from 'widget/tooltip'
import {Link} from 'route'
import {runningApps, stopApp} from 'app/home/body/apps/apps'
import Icon from 'widget/icon'
import actionBuilder from 'action-builder'
import ToggleSwitch from 'widget/toggleSwitch'
import PropTypes from 'prop-types'


export function isNavBarLocked() {
    return select('menu.locked') == null ? true : !!select('menu.locked')
}

const mapStateToProps = () => ({
    runningApps: runningApps(),
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
        return (
            <div className={styles.navbarContainer}>
                <div className={[styles.navbar, this.props.locked ? styles.locked : styles.unlocked].join(' ')}>
                    <LockSwitch locked={this.props.locked} onChange={this.setUnlocked.bind(this)}/>
                    <SectionLink name='process' icon='globe'/>
                    <SectionLink name='browse' icon='folder-open'/>
                    <SectionLink name='terminal' icon='terminal'/>
                    <SectionLink name='apps' icon='wrench'/>
                    {this.props.runningApps.map(this.appSection)}
                </div>
            </div>
        )
    }
}

NavBar.propTypes = {
    locked: PropTypes.bool.isRequired,
    runningApps: PropTypes.arrayOf(PropTypes.object).isRequired
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

const AppLink = ({app: {path, label, alt}, onRemove}) =>
    <div className={styles.app}>
        <div className={styles.stop} onClick={onRemove}>
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
    label: PropTypes.string
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

export default NavBar = connect(mapStateToProps)(NavBar)
