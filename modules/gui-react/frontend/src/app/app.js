import React from 'react'
import {connect, createAction} from 'store'
import {currentUser, loadCurrentUser$, loadedCurrentUser} from 'user'
import Home from 'app/home/home'
import Landing from 'app/landing/landing'
import 'bootstrap/dist/css/bootstrap-reboot.css'
import './app.css'

function componentWillMount() {
    this.action(loadCurrentUser$(), 'Load current user')
        .onComplete((action) => createAction(
            (state) => state.set('stateFromComplete', true)
        ))
        .onError((error) => createAction(
            (state) => state.set('stateFromError', true)
        ))
        .cancelOnNext()
        .dispatch()
}

const props = () => ({
    currentUser: currentUser(),
    loadedCurrentUser: loadedCurrentUser()
})

let App = ({currentUser, loadedCurrentUser}) => {
    if (!loadedCurrentUser)
        return <Loader/>
    else if (currentUser)
        return <Home user={currentUser}/>
    else
        return <Landing/>
}
export default App = connect({props, componentWillMount})(App)

const Loader = () =>
    <div className="app-loader">
        <span/>
        <p>S E P A L</p>
    </div>
