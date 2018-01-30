import React from 'react'
import PropTypes from 'prop-types'

export default class Button extends React.Component {
  render() {
    const styles = {
      button: {
        borderColor: '#c5b397',
        backgroundColor: '#c5b397',
        color: '#fff',
        borderTopLeftRadius: '1rem',
        borderTopRightRadius: '1rem',
        borderBottomLeftRadius: '1rem',
        borderBottomRightRadius: '1rem',
        padding: '0.375rem 0.75rem'
      }
    }

    return (
      <button
        style={Object.assign(styles.button, this.props.style)}
        onClick={this.props.onClick}
      >
        {this.props.children}
      </button>
    )
  }
}

Button.propTypes = {
  style: PropTypes.object,
  onClick: PropTypes.func.isRequired
}