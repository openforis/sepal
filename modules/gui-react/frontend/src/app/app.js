import React from 'react'
import store from 'store'
import {connect} from 'react-redux'
import 'bootstrap/dist/css/bootstrap-reboot.css'
import './app.css'
import Http from 'http-client'

function loadCurrentUser() {
    dispatch((action$) => {
        return action$
            .mergeMap(() =>
                Http.get$('/user/current', {
                    validStatuses: [200, 401]
                })
            )
            .map((e) => updateState({
                'loadedCurrentUser': true,
                'currentUser': e.response
            }))
    })
}

function dispatch(epic) {
    store().dispatch({type: 'EPIC', epic})
}

function updateState(valueByPath) {
    return {
        type: 'some_type',
        reduce(state) {
            return ({...state, ...valueByPath})
        }
    }
}

function currentUser() {
    return (store().getState() || {}).currentUser
}

function loadedCurrentUser() {
    return (store().getState() || {}).loadedCurrentUser
}

const props = () => ({
    currentUser: currentUser(),
    loadedCurrentUser: loadedCurrentUser()
})

class App extends React.Component {
    componentWillMount() {
        loadCurrentUser()
    }

    render() {
        const {currentUser, loadedCurrentUser} = this.props
        if (!loadedCurrentUser)
            return <Loader/>
        else if (currentUser)
            return <div>home</div>
        // return <Home user={user}/>
        else
            return <div>landing</div>
        // return <Landing/>
    }
}

export default App = connect(props)(App)

const Loader = () =>
    <div className="app-loader">
        <span/>
        <p>S E P A L</p>
    </div>
