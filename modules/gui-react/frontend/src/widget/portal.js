import PropTypes from 'prop-types'
import ReactDOM from 'react-dom'

const Portal = ({container = document.body, children}) =>
    ReactDOM.createPortal(children, container)

Portal.propTypes = {
    container: PropTypes.object,
    content: PropTypes.any,
    children: PropTypes.any
}

export default Portal