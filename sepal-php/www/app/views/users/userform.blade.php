@section('content')
<!--header wrap start-->
@include('includes.menu',array('current_page'=>'group'))
<!--header wrap end-->

<section class="breadcrumb">
    <div class="container">
        <ul class="bread-crumb left">
            <li>{{ HTML::link('dashboard', 'Dashboard') }}/{{ HTML::link('adduser', 'Add Users') }}</li>
        </ul>                
 <div class="help-div right">
            <a href="javascript:void(0)" id="help-button" class="sprite help-icon"></a>
        </div>  
    </div>
</section>

  <!--popup loading div start here -->
        <div class="popup-wrap" id="help-popup-wrap" style="display: none;">
            <div class="popup-container">
                <a class="close close-btn" id="help-close-button" href="#">x</a>
                 @if (isset($userDetailDb->id))
                <div class="popup-heading"><h5 class="text-left">Edit user</h5></div>
                <p class="text-left marg-no">This interface provides the means to update a user's email address, assign a new role to the user, and reset the user's password.</p>
            
            @else
              <div class="popup-heading"><h5 class="text-left">Add user</h5></div>
                <p class="text-left marg-no">This interface provides administrators the ability to create a new user account and assign a role to the account. All of the information requested must be provided to create a new user account. </p>
             
            @endif 
                </div>
        </div>
        <!--popup loading div end here -->
       <!--content wrap start-->
        <section class="content-wrap">
            <div class="container">
            @if (isset($userDetailDb->id))
                {{ Form::open(array('url'=>'users/edit/'.$userDetailDb->id,'method'=>'post')) }}
                <h2>Edit user</h2>
            @else
                {{ Form::open(array('url'=>'createuser','method'=>'post')) }}
                <h2>Add user</h2>
            @endif 



                                     
                <div class="box-wrap" style="padding-top:15px;">
                    <ul class="row">                        
                        <li class="col-lg-6">
                            <ul class="contact-form">
                               <li>
                                   <span>Full Name</span>
                                   {{Form::text('firstName',$value = (Input::old('firstName')?Input::old('firstName'):(isset($userDetailDb->full_name)?$userDetailDb->full_name:''))
                        ,array('id'=>'firstName','autocomplete' => 'off'))}}
                               </li>
                               @if ($errors->has('firstName'))
                               <li class="msg-box"><p class="error" style="visibility:visible">{{ $errors->first('firstName') }}</p></li>
                               @endif
                               <li>
                                   <span>User Name</span>
                                  {{Form::text('userName',$value = (Input::old('userName')?Input::old('userName'):(isset($userDetailDb->username)?$userDetailDb->username:''))
                        ,array('id'=>'userName','autocomplete' => 'off'))}}
                                </li>
                               @if ($errors->has('userName')) 
                               <li class="msg-box"><p class="error" style="visibility:visible">{{ $errors->first('userName') }}</p></li>
                               @endif
                                <li>
                                    <span>Email</span>
                                    {{Form::text('email',$value = (Input::old('email')?Input::old('email'):(isset($userDetailDb->email)?$userDetailDb->email:''))
                        ,array('id'=>'email','autocomplete' => 'off'))}}
                                </li>
                                 @if ($errors->has('email')) 
                               <li class="msg-box"><p class="error" style="visibility:visible">{{ $errors->first('email') }}</p></li>
                               @endif
                                <li>
                                    <span>Password</span>
                                    {{Form::password('password',$value = '',array('id'=>'password'))}}
                                </li>
                                @if ($errors->has('password')) 
                                <li class="msg-box"><p class="error" style="visibility:visible">{{ $errors->first('password') }}</p></li>
                                @endif
                                <li>
                                    <span>Confirm Password</span>
                                    {{Form::password('confirmPassword',$value = '',array('id'=>'confirmPassword'))}}
                                </li>
                                @if ($errors->has('confirmPassword')) 
                                <li class="msg-box"><p class="error" style="visibility:visible">{{ $errors->first('confirmPassword') }}</p></li>
                                @endif

  @if(Session::get('is_admin')=='yes' )
                              <li>
                                    <span>Role</span>
                                    @if(isset($userDetailDb->roles) && count($userDetailDb->roles)>0)
                                    @foreach($userDetailDb->roles as $role){{--*/ $roleId = $role->id  /*--}}@endforeach   
                                    @endif
                                    @if(count($roleList)>0)
                                    {{ Form::select('role', $roleList,$value = (Input::old('role')?Input::old('role'):(isset($roleId)?$roleId:'')),array('id'=>'role')) }}
                                    @endif


                                    {{--*/ $roleId = $value /*--}}   
                                    
                                </li>
@endif
                                <li 
                                @if(isset($roleId) && (($roleId==1) || ($roleId==2)))
                                style="display:none"
                                @endif
                                >
                                    <span>Group</span>

                                    @if(isset($userGroupDetailDb) && count($userGroupDetailDb)>0)
                                    @foreach($userGroupDetailDb as $group)
                                    {{--*/ $groupId = $group->group_id  /*--}}
                                    @endforeach   
                                    @endif

                                    @if(count($groupList)>0)
                                    {{ Form::select('group', $groupList,$value = (Input::old('role')?Input::old('group'):(isset($groupId)?$groupId:'')),array('id'=>'group')) }}
                                    @endif 


                                </li>
                                @if ($errors->has('group')) 
                                <li class="msg-box"><p class="error" style="visibility:visible">{{ $errors->first('group') }}</p></li>
                                @endif                              
                                <li 
                                @if(isset($roleId) && (($roleId==1) || ($roleId==2)))
                                style="display:none"
                                @endif
                                >
                                    <span>Group Admin</span>


                                    @if(isset($userGroupDetailDb) && count($userGroupDetailDb)>0)
                                    @foreach($userGroupDetailDb as $groupInfo)
                                    {{--*/ $isAdmin = $groupInfo->is_group_admin  /*--}}
                                    @endforeach   
                                    @endif
                                    <div class="grp_admin_area">
                                    <span>
                                        @if(isset($isAdmin) && ($isAdmin==1))
                                        {{Form::radio('group_admin', 1,TRUE);}}
                                        @else
                                        {{Form::radio('group_admin', 1,false);}}
                                        @endif
                                        
                                        
                                        <label for="yes">Yes</label>
                                    </span>
                                    <span> 
                                       @if(isset($isAdmin) && ($isAdmin==1))
                                        {{Form::radio('group_admin', 0,FALSE);}}
                                        @else
                                        {{Form::radio('group_admin', 0,TRUE);}}
                                        @endif
                                        <label for="no">No</label>
                                    </span>
                                    </div> 
                                                             
                                </li>

                            </ul>
                            <div class="clearfix"></div>
                            {{Form::submit('Save',array('class'=>'smallbuttonblue button'))}}
                            <div class="clearfix"></div>
                            <div class="msg-box" style="display:none;"><p class="success" style="text-align:center; visibility:visible">The password field is required.</p></div>
                        </li>
                        
                    </ul>                   
                </div>
                {{Form::close()}} 

            </div>
        </section>
        <!--content wrap end-->


@stop 
