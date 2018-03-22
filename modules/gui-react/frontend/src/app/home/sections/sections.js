import React from 'react'
import styles from './sections.module.css'
import {IconButton} from 'widget/button'
import Tooltip from 'widget/tooltip'
import {Link} from 'route'
import {connect} from 'store'
import {runningApps} from 'app/home/body/apps/apps'

const mapStateToProps = () => ({
    runningApps: runningApps()
})

let Sections = ({runningApps}) => {
    const appSections = runningApps.map((app) => <App key={app.path} app={app}/>)

    return <div className={styles.sectionsContainer}>
        <div className={styles.sections}>
            {/*<Section name='dashboard' icon='home'/>*/}
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
            <IconButton
                icon={icon}
                className={`${styles.section} ${styles[name + 'Icon']}`}/>
        </Tooltip>
    </Link>

const App = ({app: {path, label}}) =>
    <Link to={'/app' + path} onMouseDown={(e) => e.preventDefault()}>
        {/*<Tooltip rawMsg={label} right>*/}
            <IconButton
                icon='wrench'
                className={`${styles.section}`}/>
        {/*</Tooltip>*/}
    </Link>