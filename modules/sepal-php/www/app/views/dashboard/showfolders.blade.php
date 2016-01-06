{{ HTML::script('js/jquery.argonbox.js'); }}
<script type="text/javascript">
    $(document).ready(function() {

$('.tooltip-hide').tooltip('hide');
});

</script>

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
                    {{-- */$currentFilePath =$folderwithpath;/* --}}
                    {{-- */$imageRepoPath =$currentFilePath;/* --}}

                    
              
                    {{-- */$currentImageType = pathinfo($imageRepoPath, PATHINFO_EXTENSION);/* --}}
                    {{-- */$imageData = file_get_contents($imageRepoPath);/* --}}
                    {{-- */$srcDataBase64 = 'data:image/' . $currentImageType . ';base64,' . base64_encode($imageData);/* --}}
                    
                    <a download="{{ $folderValue }}" style="text-align: center; display: inline-block; width: 100%;" href="{{$srcDataBase64}}" title="{{ $folderValue }}">
                    <img src="{{$srcDataBase64}}" alt="{{ $folderValue }}" style="max-height: 68px;" />
                    </a>
   

                    <pre class="folder-name"> {{ $folderValue }}</pre>
                </div>
            @else
            <li>
            <div  style="background-image: url('images/icons/ico-global.png');cursor:inherit;background-repeat: no-repeat;height:20px;min-width:20px;text-align:center;padding-top:66px;background-position: center 14px;">
                <span class="file-size">{{ $userFolderSize[$folderValue] }} KB</span>
                                <span class="download_icon tooltip-hide" data-toggle="tooltip" data-placement="top" title="Click to download">
                    <a class="downloadData" href="downloadfile/{{ base64_encode($folderwithpath) }}" border="0">
                        <img src="images/download-icon.png">
                    </a>
                </span>
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
        </li>@endforeach
        @endif	
    </ul>
</div>