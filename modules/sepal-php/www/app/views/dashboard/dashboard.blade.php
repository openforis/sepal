

@section('content')
<!--header wrap start-->
@include('includes.menu',array('current_page'=>'dashboard'))
<!--header wrap end-->


{{ HTML::script('js/tooltip.js'); }}
{{ HTML::script('js/jquery.argonbox.js'); }}
<script type="text/javascript">
    $(document).ready(function() {

        $('.tooltip-hide').tooltip('hide');
    });

</script>

<section class="breadcrumb">
    <div class="container">
        <ul class="bread-crumb left">
            <li>{{ HTML::link('dashboard', 'Dashboard') }}</li>
        </ul>                
        <div class="help-div right">
            <a href="javascript:void(0)" id="help-button" class="sprite help-icon"></a>
        </div>
        <ul class="bread-crumb right" style="padding-right: 10px">
            <li><a href="javascript:void(0)" onclick="openMigrationStatus();">Downloads</a></li>
            </ul>
    </div>
</section>
<!--popup loading div start here -->
<div class="popup-wrap" id="help-popup-wrap" style="display: none;">
    <div class="popup-container">
        <a class="close close-btn" id="help-close-button" href="#">x</a>
         <div class="popup-heading"><h5 class="text-left">Dashboard</h5></div>
        <p class="text-left marg-no">Welcome to SEPAL. SEPAL is a pilot program to assess the ability of a cloud based system to provide the necessary infrastructure to allow countries without reliable internet access to remotely store and process satellite data and thereby significantly reduce the required volume of data that must be downloaded by the user.</p>
        <p class="text-left marg-no">Below is a navigation panel which displays the content of your working directory. Navigation is possible through all folders inside your working directory but only non-tiff image files will be viewable within the interface. To view an image at full resolution, click on the desired image. To download the image, click on the down arrow icon in the upper right hand corner. The file size is shown in the upper left hand corner of the icon.</p>
    </div>
</div>
<!--popup loading div end here -->
<!--content wrap start-->
<section class="content-wrap">
    <div class="container">
        <div class="folder-wrap">
            <header>
                <div class="btn-wrap">
                    <span class="sprite arrow-back"></span>
                </div>
                <div class="location-wrap">
                    <div class="location">
                        <span class="sprite folder-sml pull-left"></span>
                        <ul class="folderbreadcrumb">

                        </ul>
                    </div>
                </div>                    	
            </header>
            <div class="clearfix"></div>

            <div class="folder-main-wrap">
                <div class="left-side-folder">
                    <div class="location-wrap">
                        <div class="location"> 
                            @if (isset($userFolder) && count($userFolder)>0)


                            <ul>
                                {{-- */$i=0;/* --}}
                                @foreach ($userFolder as $folderKey=>$folderValue)

                                {{-- */$folderwithpath =$folderPath.'/'.$folderValue;/* --}}
                                {{-- */$validextensions = array("jpeg", "jpg", "png","gif","tif");/* --}}
                                {{-- */$file_ext =pathinfo($folderValue,PATHINFO_EXTENSION);/* --}}
                                {{-- */$isdirectory = exec("sudo file -L ".$folderwithpath);/* --}}
                                {{-- */$isdir = substr_compare($isdirectory, "directory", strlen($isdirectory)-strlen("directory"), strlen("directory")) === 0;/* --}}
                                @if(!$isdir)

                                @else
                                <li class="folderclose">
                                    <article style="cursor: pointer;" @if ($i == 0)      @endif>
                                             <span class="pull-left sprite right-arrow subarrow"></span>
                                        <span class="sprite folder-sml pull-left"></span>
                                        <div  class="folderPath" path="{{ $folderwithpath }}"> {{ $folderValue }}</div>
                                    </article>
                                    <div class="subfolder" ></div>
                                </li>@endif


                                {{-- */$i++;/* --}}
                                @endforeach

                            </ul>
                            @endif	
                        </div>
                    </div>
                </div>
                <div class="folder-content" >
                    <div class="folder-view" id="fileFolder">

                        <div class="argonbox">




                            <ul class="row">

                                @if (isset($userFolder) && count($userFolder)>0)


                                @foreach ($userFolder as $folderKey=>$folderValue)
                                {{-- */$folderwithpath =$folderPath.'/'.$folderValue;/* --}}
                                {{-- */$file_ext =pathinfo($folderwithpath,PATHINFO_EXTENSION)/* --}}
                                {{-- */$isdirectory = exec("sudo file -L ".$folderwithpath);/* --}}
                                {{-- */$isdir = substr_compare($isdirectory, "directory", strlen($isdirectory)-strlen("directory"), strlen("directory")) === 0;/* --}}
                                {{-- */$validextensionstif = array("TIF","tif");/* --}}
                                {{-- */$validextensionstxt = array("txt","TXT");/* --}}
                                {{-- */$validextensionsgtf = array("GTF","gtf");/* --}}
                                {{-- */$validextensionspng = array("png","PNG");/* --}}
                                {{-- */$validextensionsgif = array("gif","GIF");/* --}}
                                {{-- */$validextensionsjpg = array("jpg","JPG");/* --}}
                                {{-- */$validextensionsjpeg = array("jpeg","JPEG");/* --}}
                                {{-- */$validextensions = array("jpeg", "jpg", "png","gif");/* --}}

                                @if(!$isdir)
                                @if(in_array($file_ext,$validextensionstif))
                                <li>
                                    <div  style="background-image: url('images/icons/ico-tiff.png');cursor:inherit;background-repeat: no-repeat;height:20px;min-width:20px;text-align:center;padding-top:66px;background-position: center 14px;">
                                        <span class="file-size">{{ $userFolderSize[$folderValue] }} KB</span>
                                        <span class="download_icon tooltip-hide" data-toggle="tooltip" data-placement="top" title="Click to download">
                                            <a class="downloadData" href="downloadfile/{{ base64_encode($folderwithpath) }}" border="0">
                                                <img src="images/download-icon.png">
                                            </a>
                                        </span>
                                        <pre class="folder-name">{{ $folderValue }}</pre>
                                    </div>
                                    @elseif(in_array($file_ext,$validextensionstxt))

                                <li>
                                    <div  style="background-image: url('images/icons/ico-txt.png');cursor:inherit;background-repeat: no-repeat;height:20px;min-width:20px;text-align:center;padding-top:66px;background-position: center 14px;">
                                        <span class="file-size">{{ $userFolderSize[$folderValue] }} KB</span>
                                        <span class="download_icon tooltip-hide" data-toggle="tooltip" data-placement="top" title="Click to download">
                                            <a class="downloadData" href="downloadfile/{{ base64_encode($folderwithpath) }}" border="0">
                                                <img src="images/download-icon.png">
                                            </a>
                                        </span>
                                        <pre class="folder-name">{{ $folderValue }}</pre>
                                    </div>
                                    @elseif(in_array($file_ext,$validextensionsgtf))

                                <li>
                                    <div  style="background-image: url('images/icons/ico-gtf.png');cursor:inherit;background-repeat: no-repeat;height:20px;min-width:20px;text-align:center;padding-top:66px;background-position: center 14px;">
                                        <span class="file-size">{{ $userFolderSize[$folderValue] }} KB</span>
                                        <span class="download_icon tooltip-hide" data-toggle="tooltip" data-placement="top" title="Click to download">
                                            <a class="downloadData" href="downloadfile/{{ base64_encode($folderwithpath) }}" border="0">
                                                <img src="images/download-icon.png">
                                            </a>
                                        </span>
                                        <pre class="folder-name">{{ $folderValue }}</pre>
                                    </div>
                                    @elseif(in_array($file_ext,$validextensionspng) || in_array($file_ext,$validextensionsgif) || in_array($file_ext,$validextensionsjpg) || in_array($file_ext,$validextensionsjpeg))
                                <li>

                                    <div>
                                        <span class="file-size">{{ $userFolderSize[$folderValue] }} KB</span>
                                        <span class="download_icon tooltip-hide" data-toggle="tooltip" data-placement="top" title="Click to download">
                                            <a class="downloadData" href="downloadfile/{{ base64_encode($folderwithpath) }}" border="0">
                                                <img src="images/download-icon.png">
                                            </a>
                                        </span>
                                        {{-- */$userName = Session::get('username');/* --}}
                                        {{-- */$currentFilePath =$folderPath.'/'.$folderValue;/* --}}
                                        {{-- */$imageRepoPath ='/data/home/' . $userName.$currentFilePath;/* --}}

                                        {{-- */$currentImageType = pathinfo($imageRepoPath, PATHINFO_EXTENSION);/* --}}
                                        {{-- */$imageData = file_get_contents($imageRepoPath);/* --}}
                                        {{-- */$srcDataBase64 = 'data:image/' . $currentImageType . ';base64,' . base64_encode($imageData);/* --}}

                                        <a  style="text-align: center; display: inline-block; width: 100%;" href="{{$srcDataBase64}}" title="{{ $folderValue }}">
                                            <img src="{{$srcDataBase64}}"  alt="{{ $folderValue }}" style="max-height: 68px;" />
                                        </a>

                                        <pre class="folder-name"> {{ $folderValue }}</pre>
                                    </div>
                                    @else
                                <li>
                                    <div  style="background-image: url('images/icons/ico-global.png');cursor:inherit;background-repeat: no-repeat;height:20px;min-width:20px;text-align:center;padding-top:66px;background-position: center 14px;">
                                        <span class="file-size">{{ $userFolderSize[$folderValue] }} KB</span>
                                        <pre class="folder-name">{{ $folderValue }}</pre>
                                    </div>
                                    @endif
                                    @else
                                <li class="folder-download"> 
                                    <span>    
                                        <span class="download_icon tooltip-hide" data-toggle="tooltip" data-placement="top" title="Click to download">
                                            <span class="downloadData zipFolder" link="{{ base64_encode($folderwithpath) }}" border="0">
                                                <img src="images/download-icon.png">
                                            </span>
                                        </span> 
                                    </span> 
                                    <div class="folderPath" path="{{ $folderPath.'/'.$folderValue }}">

                                        <span class="file-size">{{ $userFolderSize[$folderValue] }} KB</span>

                                        <span class="sprite folder-icon"></span>
                                        <pre style="cursor: pointer;" class="folder-name folderPath" path="{{ $folderPath.'/'.$folderValue }}">{{ $folderValue }}</pre>
                                    </div>
                                    @endif
                                </li>
                                @endforeach

                                @endif  
                            </ul>

                        </div>
                    </div>


                </div>
            </div>
        </div>

    </div>
</section>


<!--content wrap end-->


{{ HTML::style( asset('css/style.argonbox.css') ) }}  
{{ HTML::script('js/jquery.argonbox.js'); }} 


@stop 
