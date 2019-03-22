import {appList, loadApps$} from 'apps'
import {connect} from 'store'
import {msg} from 'translate'
import AppLauncher from './appLauncher'
import Notifications from 'widget/notifications'
import React from 'react'
import Tabs from 'widget/tabs'

const mapStateToProps = () => ({
    apps: appList()
})

class _Apps extends React.Component {
    constructor(props) {
        super(props)
        this.props.stream('LOAD_APPS',
            loadApps$(),
            null,
            () => Notifications.error({message: msg('apps.loading.error')})
        )
    }

    renderApps(apps) {
        return (
            <Tabs
                label={msg('home.sections.app-launch-pad')}
                statePath='apps'>
                {({id}) => <AppLauncher id={id} apps={apps}/>}
            </Tabs>
        )
    }

    renderLoading() {
        return null
    }

    render() {
        const {apps} = this.props
        return apps
            ? this.renderApps(apps)
            : this.renderLoading()
    }
}

export default connect(mapStateToProps)(_Apps)
