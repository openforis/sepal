import React from 'react'
import Button from 'widget/button/button'
import SlideShow from 'app/login/slideshow/slideshow'

export default class Login extends React.Component {
  login() {
    alert('Logging in')
  }

  render() {
    return (
      <div>
        <SlideShow/>
        <LoginButton onClick={this.login}/>
      </div>
    )
  }
}

const LoginButton = props =>
  <Button
    style={{
      color: 'green'
    }}
    onClick={props.onClick}
  >
    Login
  </Button>

Login.propTypes = {}