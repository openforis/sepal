import React from 'react'
import Login from 'app/login/login'
import Home from 'app/home/home'
import 'bootstrap/dist/css/bootstrap-reboot.css'

export default class App extends React.Component {
  constructor(props) {
    super(props)
    this.state = {
      user: Math.random() > 0.5
        ? {username: 'foo' + Math.random()}
        : null
    }
  }

  render() {
    // if (this.state.user)
    //   return <Home user={this.state.user}/>
    // else
      return <Login/>
  }
}

App.propTypes = {}