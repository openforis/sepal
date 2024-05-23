import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'

import {actionBuilder} from '~/action-builder'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {selectFrom} from '~/stateUtils'
import {closeTab} from '~/widget/tabs/tabActions'

import {AppInstance} from './appInstance'
import {AppList} from './appList/appList'

const mapStateToProps = state => ({
    runningApps: selectFrom(state, 'apps.tabs')
})

class _App extends React.Component {
    state = {
        app: null
    }

    constructor() {
        super()
        this.runApp = this.runApp.bind(this)
    }

    render() {
        const {app} = this.state
        return app
            ? <AppInstance app={app}/>
            : <AppList onSelect={this.runApp}/>
    }

    runApp(app) {
        const {id, runningApps} = this.props
        const runningApp = _.find(runningApps, runningApp => runningApp.path === app.path)
        if (app.single && runningApp) {
            closeTab(id, 'apps', runningApp.id)
        } else {
            this.setState({app})
            actionBuilder('SET_TAB_PLACEHOLDER', {id, app})
                .assign(['apps.tabs', {id}], {
                    placeholder: app.label,
                    title: app.label,
                    path: app.path
                })
                .dispatch()
        }
    }
}

export const App = compose(
    _App,
    connect(mapStateToProps)
)

App.propTypes = {
    id: PropTypes.string.isRequired,
}
