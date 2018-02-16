import React from 'react'
import PropTypes from 'prop-types'
import {Link} from "react-router-dom";

export default class Home extends React.Component {
    render() {
        return (
            <div>
                {this.props.user.username}
                <Link to={'/login/qwert'}>Link to login</Link>
            </div>
        )
    }
}

Home.propTypes = {
    user: PropTypes.object.isRequired
}