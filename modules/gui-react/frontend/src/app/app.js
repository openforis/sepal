import React from 'react'
import {currentUser$, loadCurrentUser} from 'user'
import Landing from 'app/landing/landing'
import Home from 'app/home/home'
import 'bootstrap/dist/css/bootstrap-reboot.css'
import './app.css'
import {observer, Reducer} from 'observer'

let App = ({user, loadedUser}) => {
    if (!loadedUser)
        return <Loader/>
    else if (user)
        return <Home user={user}/>
    else
        return <Landing/>
}

export default App = observer(App, {
    reducers:
        [
            new Reducer(currentUser$, (user) => ({
                loadedUser: user || user === null,
                user: user
            }))
        ],

    componentWillMount:
        () => loadCurrentUser()
})

const Loader = () =>
    <div className="app-loader">
        <span/>
        <p>S E P A L</p>
    </div>
