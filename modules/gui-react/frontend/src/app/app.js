import React from 'react'
import {currentUser$, loadCurrentUser$} from 'user'
import subscriber from 'subscriber'
import Landing from 'app/landing/landing'
import Home from 'app/home/home'
import 'bootstrap/dist/css/bootstrap-reboot.css'
import './app.css'
import Rx from 'rxjs'


const events$ = new Rx.Subject()

function componentWillMount() {

    // this.subscribe('Set current user', currentUser$,
    //     (user) => ({user})
    // )
    this.subscribe('Loaded current user', loadCurrentUser$(),
        (user) => {
            // currentUser$.next(user)
            events$.next({
                currentUser: user
            })
            return ({loadedUser: true})
        }
    )
}

let App = ({user, loadedUser}) => {
    if (!loadedUser)
        return <Loader/>
    else if (user)
        return <Home user={user}/>
    else
        return <Landing/>
}
export default App = subscriber({componentWillMount})(App)

const Loader = () =>
    <div className="app-loader">
        <span/>
        <p>S E P A L</p>
    </div>
