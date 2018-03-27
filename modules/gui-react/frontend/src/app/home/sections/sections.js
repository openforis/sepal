import React from 'react'
import {connect, select} from 'store'
import styles from './sections.module.css'
import Tooltip from 'widget/tooltip'
import {Link} from 'route'
import {runningApps} from 'app/home/body/apps/apps'
import Icon from 'widget/icon'
import actionBuilder from 'action-builder'
import Switch from 'widget/switch'
import PropTypes from 'prop-types'


export function isMenuLocked() {
    return select('menu.locked') == null ? true : !!select('menu.locked')
}

const mapStateToProps = () => ({
    runningApps: runningApps(),
    locked: isMenuLocked()
})

class Sections extends React.Component {
    appSection(app) {
        return <App key={app.path} app={app}/>
    }

    setUnlocked(unlocked) {
        actionBuilder('TOGGLE_MENU')
            .set('menu.locked', !unlocked)
            .dispatch()
    }

    render() {
        return (
            <div className={styles.sectionsContainer}>
                <div className={[styles.sections, this.props.locked ? styles.locked : styles.unlocked].join(' ')}>
                    <LockSwitch locked={this.props.locked} onChange={this.setUnlocked.bind(this)}/>
                    <Section name='process' icon='globe'/>
                    <Section name='browse' icon='folder-open'/>
                    <Section name='terminal' icon='terminal'/>
                    <Section name='apps' icon='wrench'/>
                    {this.props.runningApps.map(this.appSection)}
                </div>
            </div>
        )
    }
}

Sections.propTypes = {
    locked: PropTypes.bool.isRequired,
    runningApps: PropTypes.arrayOf(PropTypes.object).isRequired
}

const Section = ({name, icon}) =>
    <Link to={'/' + name} onMouseDown={(e) => e.preventDefault()}>
        <Tooltip msg={'home.sections.' + name} right>
            <button className={`${styles[name]}`}>
                <Icon name={icon}/>
            </button>
        </Tooltip>
    </Link>

Section.propTypes = {
    name: PropTypes.string,
    icon: PropTypes.string
}

const App = ({app: {path, label, alt}}) =>
    <Link to={'/app' + path} onMouseDown={(e) => e.preventDefault()}>
        <Tooltip rawMsg={label || alt} right>
            <button className={styles.app}>
                <Icon name={'cubes'}/>
            </button>
        </Tooltip>
    </Link>

App.propTypes = {
    app: PropTypes.object,
    path: PropTypes.string,
    label: PropTypes.string
}

const LockSwitch = ({locked, onChange}) =>
    <Tooltip msg={locked ? 'home.sections.locked' : 'home.sections.unlocked'} right>
        <div className={styles.lockSwitch}>
            <Switch
                on={!locked}
                offIcon='lock'
                onIcon='unlock'
                onChange={onChange}/>
        </div>
    </Tooltip>

export default Sections = connect(mapStateToProps)(Sections)
