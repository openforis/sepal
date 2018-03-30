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

export function isNavBarFloating() {
    console.log('next state', !!select('menu.floating'))
    // return select('menu.floating') == null ? false : !!select('menu.floating')
    return !!select('menu.floating')
}

const mapStateToProps = () => ({
    requestedApps: requestedApps(),
    floating: isNavBarFloating()
})

class NavBar extends React.Component {
    appSection(app) {
        return <AppLink key={app.path} app={app}/>
    }

    toggle(state) {
        console.log('current state', state)
        actionBuilder('TOGGLE_MENU')
            .set('menu.floating', !state)
            .dispatch()
    }

    render() {
        const {className, requestedApps} = this.props
        return (
            <div className={[styles.navbarContainer, className].join(' ')}>
                <div className={[styles.navbar, this.props.floating && styles.floating].join(' ')}>
                    <ModeSwitch floating={this.props.floating} onChange={this.toggle.bind(this)}/>
                    <SectionLink name='process' icon='globe'/>
                    <SectionLink name='browse' icon='folder-open'/>
                    {/* <SectionLink name='terminal' icon='terminal'/> */}
                    <SectionLink name='app-launch-pad' icon='wrench'/>
                    {requestedApps.map(this.appSection)}
                </div>
            </div>
        )
    }
}

NavBar.propTypes = {
    className: PropTypes.string,
    floating: PropTypes.bool.isRequired,
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

const ModeSwitch = ({floating, onChange}) => {
    console.log('ModeSwitch', floating)
    return (
        <Tooltip msg={floating ? 'home.sections.floating' : 'home.sections.fixed'} right>
            <div className={styles.lockSwitch}>
                <FlipSwitch
                    on={floating}
                    offIcon='unlock'
                    onIcon='lock'
                    onChange={onChange}/>
            </div>
        </Tooltip>
    )
}

ModeSwitch.propTypes = {
    floating: PropTypes.bool,
    onChange: PropTypes.func
}

export default NavBar = connect(mapStateToProps)(NavBar)
