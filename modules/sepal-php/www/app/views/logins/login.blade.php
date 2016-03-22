@section('content')
<div id="wrap" class="main-wrap login-wrap">
    <article class="login-div">
        <img src="images/sepal-logo.jpeg" alt="SEPAL"/>
        <br/><br/>
        {{ Form::open(array('url' => 'login', 'method' => 'post')) }}
        <ul class="login-form">

            @if (isset($message))
            <li class="msg-box"><p class="error" style="visibility:visible">{{ $message }}</p></li>
            @endif

            @if ($errors->has('userName'))
            <li class="msg-box"><p class="error" style="visibility:visible">{{ $errors->first('userName') }}</p></li>
            @endif
            <li>

                <span class="sprite icon-user"></span>
                {{Form::text('userName','',$attributes = array('autocomplete' => 'off', 'autofocus' => 'autofocus')) }}
            </li>

            @if ($errors->has('password'))
            <li class="msg-box"><p class="error" style="visibility:visible">{{ $errors->first('password') }}</p></li>
            @endif

            <li>
                <span class="sprite icon-pass"></span>
                {{Form::password('password') }}
                <span class="sprite login-btn">
                    {{Form::submit(' ')}}
            </li>
        </ul>

        {{Form::close()}}
    </article>
</div>
@stop 
