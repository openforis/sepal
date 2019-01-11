import {Button} from 'widget/button'
import {Content, SectionLayout} from 'widget/sectionLayout'
import {appList, requestedApps, runApp$} from 'apps'
import {connect, dispatch} from 'store'
import {history} from 'route'
import Icon from 'widget/icon'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './appLaunchPad.module.css'

const mapStateToProps = () => ({
    apps: appList(),
    requestedApps: requestedApps()
})

class AppLaunchPad extends React.Component {
    runApp(app) {
        dispatch(history().push('/app' + app.path))
        if (!this.props.requestedApps.includes(app))
            this.props.asyncActionBuilder('RUN_APP',
                runApp$(app.path))
                .dispatch()
    }

    render() {
        const {apps} = this.props
        return (
            <SectionLayout>
                <Content>
                    <div className={styles.apps}>
                        {apps.map(app => <App key={app.path} app={app} onClick={this.runApp.bind(this)}/>)}
                    </div>
                </Content>
            </SectionLayout>
        )
    }
}

AppLaunchPad.propTypes = {
    apps: PropTypes.arrayOf(PropTypes.object),
    requestedApps: PropTypes.arrayOf(PropTypes.object)
}

const App = ({app, onClick}) =>
    <Button
        look='transparent'
        additionalClassName={styles.app}
        onClick={() => onClick(app)}>
        <Image style={app.style} src={app.image}/>
        {app.icon && <Icon name={app.icon} alt={app.alt}/>}
        <div>
            <div className={styles.title}>{app.label}</div>
            <div className={styles.description}>{app.description}</div>
        </div>
    </Button>

App.propTypes = {
    app: PropTypes.object,
    onClick: PropTypes.func
}

const Image = ({style, src, alt}) => {
    return src
        ? <img src={src} alt={alt} style={style}/>
        : null
}

Image.propTypes = {
    alt: PropTypes.string,
    src: PropTypes.string
}

export default connect(mapStateToProps)(AppLaunchPad)
