/**
 * @author Mino Togna
 */
require( './date-picker.css' )

var moment = require( 'moment' )

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
    
    //add years to the dom
    var yearsContainer = this.html.find( '.year' ).find( '.buttons' )
    var year           = moment().year()
    var container      = null
    for ( var i = 1970; i <= year; i++ ) {
        
        var btn = $( '<a class="btn btn-base"/>' )
        btn.attr( 'value', i )
        btn.html( String( i ).substr( -2 ) )
        
        var lastDigit = String( i ).substr( -1 )
        if ( lastDigit == "0" ) {
            container = $( '<div class="outher"/>' )
            yearsContainer.append( container )
            btn.addClass( 'group' )
        } else if ( lastDigit == "1" ) {
            var innerContainer = $( '<div class="inner"/>' )
            container.append( innerContainer )
            container = innerContainer
        }
        
        container.append( btn )
    }
    
    if ( this.disableYear === true ) {
        this.html.find( '.year' ).hide()
        this.html.find( '.year-separator' ).hide()
        this.html.find( '.year-label-separator' ).hide()
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
                
                $this.expandGroup( property, aGroup )
                
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

DatePicker.prototype.asMoment = function () {
    return moment( this.year + '' + this.month + '' + this.day, "YYYYMMDD" )
}

DatePicker.prototype.select = function ( property, value ) {
    var container = this.html.find( '.' + property )
    var a         = container.find( "a[value='" + value + "']" )
    a.click()
    
    var parent = a.parent()
    if ( parent.hasClass( 'inner' ) ) {
        var aGroup = parent.parent().find( 'a.group' )
        // console.log( aGroup.length )
        this.expandGroup( property, aGroup )
    }
}

DatePicker.prototype.expandGroup = function ( property, aGroup ) {
    var container = this.html.find( '.' + property )
    // hide ohter
    var opened    = container.find( '.inner.opened' )
    if ( opened.length == 0 ) {
        container.velocity( { height: "*=1.55" }, { duration: 1000 } )
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
            , delay : delay
        } )
    } )
}

var newInstance = function ( parentContainer, disableYear ) {
    return new DatePicker( parentContainer, disableYear )
}
module.exports  = {
    newInstance: newInstance
}