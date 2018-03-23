import React from 'react'
import styles from './sections.module.css'
// import {IconButton} from 'widget/button'
import Tooltip from 'widget/tooltip'
import {Link} from 'route'
import {connect} from 'store'
import {runningApps} from 'app/home/body/apps/apps'
import Icon from 'widget/icon'

const mapStateToProps = () => ({
    runningApps: runningApps()
})

let Sections = ({runningApps}) => {
    const appSections = runningApps.map((app) => <App key={app.path} app={app}/>)

    return <div className={styles.sectionsContainer}>
        <div className={styles.sections}>
            {/*<Section name='dashboard' icon='dashboard'/>*/}
            <Section name='process' icon='globe'/>
            <Section name='browse' icon='folder-open'/>
            <Section name='apps' icon='wrench'/>
            <Section name='terminal' icon='terminal'/>
            {appSections}
        </div>
        {/*<div className={styles.sections}>*/}
            {/*{appSections}*/}
        {/*</div>*/}
    </div>
}
export default Sections = connect(mapStateToProps)(Sections)

const Section = ({name, icon}) =>
    <Link to={'/' + name} onMouseDown={(e) => e.preventDefault()}>
        <Tooltip msg={'home.sections.' + name} right>
            <button className={`${styles[name]}`}>
                <Icon name={icon}/>
            </button>
        </Tooltip>
    </Link>

const App = ({app: {path, label}}) =>
    <Link to={'/app' + path} onMouseDown={(e) => e.preventDefault()}>
        {/*<Tooltip rawMsg={label} right>*/}
        <button className={styles.app}>
            <Icon name={'wrench'}/>
        </button>
        {/*</Tooltip>*/}
    </Link>