/**
 * @author Mino Togna
 */
require( './date-picker.css' )

var template = require( './date-picker.html' )
var html     = $( template( {} ) )

var DatePicker = function ( parentContainer, disableYear ) {
    this.parentContainer = parentContainer
    this.disableYear     = disableYear

    this.year  = ''
    this.month = ''
    this.day   = ''

    this.opened = false

    this.onChange = function ( datePicked ) {

    }

    this.init()
}

DatePicker.prototype.init = function () {
    this.html = html.clone()
    if ( this.disableYear === true ) {
        this.html.find( '.year' ).hide()
        this.html.find( '.year-separatpr' ).hide()
        this.html.find( '.year-label-separatpr' ).hide()
    }
    this.parentContainer.append( this.html )

    this._bindEvents( 'year' )
    this._bindEvents( 'month' )
    this._bindEvents( 'day' )

    this.opened = true
}

DatePicker.prototype._bindEvents = function ( property ) {
    var $this     = this;
    var container = this.html.find( '.' + property )

    var aGroups = container.find( '.buttons a.group' )
    $.each( aGroups, function ( i, aGroup ) {
        aGroup = $( aGroup )
        aGroup.click( function ( e ) {
            e.preventDefault()

            var value = $( this ).attr( 'value' )

            if ( value == $this[ property ] ) {
                // var opened = container.find('.inner.opened')
                // opened.find('a').css({opacity: 0})
                // opened.fadeOut()
                //
                // container.velocity({height: "*=0.5"}, {duration: 1000})
            } else {
                // hide ohter
                var opened = container.find( '.inner.opened' )
                if ( opened.length == 0 ) {
                    container.velocity( { height: "*=2" }, { duration: 1000 } )
                } else {
                    opened.find( 'a' ).css( { opacity: 0 } )
                    opened.hide()
                    opened.removeClass( 'opened' )
                }

                var inner = aGroup.siblings( '.inner' )
                inner.fadeIn( 700 )
                inner.addClass( 'opened' )

                var delay = 60
                $.each( inner.find( 'a' ), function ( i, a ) {
                    delay += 60
                    a = $( a )
                    a.velocity( { opacity: 1 }, {
                        duration: 500
                        , delay: delay
                    } )
                } )

            }

        } )
    } )

    container.find( 'a' ).click( function ( e ) {
        e.preventDefault()

        var value = $( this ).attr( 'value' )
        if ( $this[ property ] != value ) {
            container.find( 'a' ).removeClass( 'active' )
            $this[ property ] = value
            $this.html.find( '.' + property + '-label' ).html( value )
            $( this ).addClass( 'active' )

            $this.onChange( $this )
        }
    } )
}

DatePicker.prototype.hide = function () {
    if ( this.opened ) {
        this.opened = false
        this.html.find( '.date-picker-selector' ).velocity( 'slideUp', { delay: 200, duration: 1000 } )
    }
}
DatePicker.prototype.show = function () {
    if ( !this.opened ) {
        this.opened = true
        this.html.find( '.date-picker-selector' ).velocity( 'slideDown', { delay: 200, duration: 1000 } )
    }
}

DatePicker.prototype.getYear  = function () {
    return this.year
}

DatePicker.prototype.getMonth = function () {
    return this.month
}

DatePicker.prototype.getDay   = function () {
    return this.day
}

var newInstance = function ( parentContainer, disableYear ) {
    return new DatePicker( parentContainer, disableYear )
}
module.exports  = {
    newInstance: newInstance
}