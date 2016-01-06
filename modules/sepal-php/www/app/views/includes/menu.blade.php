<section class="header-wrap">
    <div class="container">
        <header>
            <div class="left logo">
<!--                <img src="{{URL::to('/');}}/images/sdms-logo.png" width="145" height="63" alt="logo">-->
            </div>
            <div class="right header-sec">
                <div class="user-sec right">
                    <article class="left user-icn"><span class="sprite"></span><span>{{Session::get('username')}}</span></article>
                    <div class="clearboth"></div>

                    <div class="clearboth"></div>
                    <article><a href="{{ url('/logout') }}" class="logout right"><span class="sprite"></span>Logout</a></article>
                </div>

            </div>
            <div class="clearboth"></div>

            <div class="menu-nav right">
                <!-- Static navbar -->
                <div class="navbar navbar-default" role="navigation">
                    <div class="navbar-header">
                        <button type="button" class="navbar-toggle" data-toggle="collapse" data-target=".navbar-collapse">
                            <span class="sr-only">Toggle navigation</span>
                            <span class="icon-bar"></span>
                            <span class="icon-bar"></span>
                            <span class="icon-bar"></span>
                        </button>
                    </div>
                    <div class="navbar-collapse collapse">
                        <ul class="nav navbar-nav">
                            <li @if(isset($current_page) && $current_page=='dashboard') class='active' @endif>{{ HTML::link('dashboard', 'Dashboard') }}</li>
                            @if(Session::get('is_admin')=='yes')
                            <li @if(isset($current_page) && $current_page=='users') class='active' @endif @if(isset($current_page) && $current_page=='group') class='active' @endif>  
                            
                            <a href="#">Manage</a>
                            <ul class="nav drop-menu">
                                <li><a href="#">User</a>
                                    <ul class="nav sub">
                                        <li>{{ HTML::link('adduser', 'Add User') }}</a></li>
                                        <li>{{ HTML::link('users', 'List Users') }}</a></li>
                                    </ul>
                                </li>
                                <li><a href="#">Group</a>
                                    <ul class="nav sub">
                                        <li>{{ HTML::link('groups', 'List Groups') }}</li>
                                    </ul>
                                </li>
                                <li><a href="#">System Utilities</a>
                                    <ul class="nav sub">
                                        <li>{{ HTML::link('cronsetupbydays', 'Age of System Data') }}</li>
                                    </ul>
                                </li>
                            </ul>
                        </li>
                            @elseif(Session::get('group_admin')=='yes' && (Session::get('group_id')>0))
                            <li @if(isset($current_page) && $current_page=='users') class='active' @endif>  
                            
                            <a href="#">Manage</a>
                            <ul class="nav drop-menu">
                                <li><a href="#">User</a>
                                    <ul class="nav sub">
                                        <li>{{ HTML::link('adduser', 'Add User') }}</a></li>
                                        <li>{{ HTML::link('users', 'List Users') }}</a></li>
                                    </ul>
                                </li>

                            </ul>
                        </li>
                          @endif

                            <li @if(isset($current_page)&& $current_page=='terminal') class='active' @endif>{{ HTML::link('terminal', 'Terminal', array("target" => "_self")) }}</li>
                            @if (Session::has('search_url'))
                            
                            <li @if(isset($current_page)&& $current_page=='search') class='active' @endif>{{ HTML::link(Session::get('search_url'), 'Search') }}</li>
                            
                            @else
                            <li @if(isset($current_page)&& $current_page=='search') class='active' @endif>{{ HTML::link('search', 'Search') }}</li>
                            @endif

                            <li  @if(isset($current_page)&& $current_page=='contact') class='active' @endif >{{ HTML::link('contact', 'Contact us') }}</li>
                        </ul>
                    </div><!--/.nav-collapse -->
                </div>
            </div>

        </header>
    </div> 
</section>
