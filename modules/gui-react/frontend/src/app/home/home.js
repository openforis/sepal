import React from 'react'
import PropTypes from 'prop-types'

export default class Home extends React.Component {
  render() {
    return (
      <div>{this.props.user.username}</div>
    )
  }
}

Home.propTypes = {
  user: PropTypes.object.isRequired
}