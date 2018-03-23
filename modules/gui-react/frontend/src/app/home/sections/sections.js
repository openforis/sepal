import React from 'react'
import {connect, select} from 'store'
import PropTypes from 'prop-types'
import styles from './sections.module.css'
import Tooltip from 'widget/tooltip'
import {Link} from 'route'
import {runningApps} from 'app/home/body/apps/apps'
import Icon from 'widget/icon'
import actionBuilder from 'action-builder'

const mapStateToProps = () => ({
    runningApps: runningApps(),
    locked: select('menu.locked')
})

class Sections extends React.Component {
    appSection(app) {
        return <App key={app.path} app={app}/>
    }
    toggle() {
        actionBuilder('TOGGLE_MENU')
            .set('menu.locked', !this.props.locked)
            .dispatch()
    }
    render() {
        return (
            <div className={styles.sectionsContainer}>
                <div className={[styles.sections, this.props.locked && styles.locked].join(' ')}>
                    <button className={styles.lock} onClick={this.toggle.bind(this)}>
                        <Icon name={this.props.locked ? 'lock' : 'unlock'}/>
                    </button>
                    {/*<Section name='dashboard' icon='dashboard'/>*/}
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

const App = ({app: {path, label}}) =>
    <Link to={'/app' + path} onMouseDown={(e) => e.preventDefault()}>
        <Tooltip rawMsg={label} right>
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

export default Sections = connect(mapStateToProps)(Sections)
