/**
 * @author Mino Togna
 */

var animateIn = function ( element, callback ) {
    element.find( '[data-animation-in]' ).css( 'opacity', '0' )

    element.find( '[data-animation-in]' ).andSelf().each( function () {
        var $this            = $( this )
        var animationIn      = 'fadeIn'
        var animationOut     = 'fadeOut'
        var animationInDelay = 100

        if ( $this.data( 'animation-in' ) ) {
            animationIn = $this.data( 'animation-in' )
        }

        if ( $this.data( 'animation-in-delay' ) ) {
            animationInDelay = $this.data( 'animation-in-delay' )
        }

        if ( $this.data( 'animation-out' ) ) {
            animationOut = $this.data( 'animation-out' )
        }

        $this.removeClass( animationOut ).css( 'animation-delay', animationInDelay + 'ms' ).addClass( 'animated' ).addClass( animationIn )
    } )
    element.addClass( 'is-active' )

    setTimeout( function () {
        element.find( '[data-animation-in]' ).andSelf().css( 'opacity', '1' )

        if ( callback ) {
            callback()
        }
    }, 1250 )
}

var animateOut = function ( element, callback ) {
    element.find( '[data-animation-out]' ).andSelf().each( function () {
        var $this             = $( this )
        var animationIn       = 'fadeIn'
        var animationOut      = 'fadeOut'
        var animationOutDelay = 1

        if ( $this.data( 'animation-in' ) ) {
            animationIn = $this.data( 'animation-in' )
        }

        if ( $this.data( 'animation-out' ) ) {
            animationOut = $this.data( 'animation-out' )
        }

        if ( $this.data( 'animation-out-delay' ) ) {
            animationOutDelay = $this.data( 'animation-out-delay' )
        }

        $this.removeClass( animationIn ).addClass( 'animated' ).addClass( animationOut )

        if ( $this.data( 'animation-out-delay' ) ) {
            $this.css( 'animation-delay', animationOutDelay + 'ms' )
        } else {
            $this.css( 'animation-delay', '1ms' )
        }
    } )


    setTimeout( function () {
        element.find( '[data-animation-out]' ).andSelf().css( 'opacity', '0' )
        element.removeClass( 'is-active' )
        if ( callback ) {
            callback()
        }
    }, 1250 )

}

var removeAnimation = function ( element ) {

    element.find( '.animation-item' ).andSelf().each( function () {
        var $this        = $( this )
        var animationIn  = 'fadeIn'
        var animationOut = 'fadeOut'

        if ( $this.data( 'animation-in' ) ) {
            animationIn = $this.data( 'animation-in' )
        }

        if ( $this.data( 'animation-out' ) ) {
            animationOut = $this.data( 'animation-out' )
        }

        $this.removeClass( animationIn ).removeClass( animationOut ).removeClass( 'is-active' ).removeClass( 'animated' )
    } )

}

module.exports = {
    animateIn: animateIn
    , animateOut: animateOut
    , removeAnimation: removeAnimation
}
