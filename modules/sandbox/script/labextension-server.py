from starlette.applications import Starlette
from starlette.responses import (
    JSONResponse,
    RedirectResponse,
    StreamingResponse,
)
from starlette.staticfiles import StaticFiles
from starlette.routing import Route
import os
import zipfile
import io


def get_labextensions_dir(app_name):
    home_dir = os.path.expanduser("~")
    return os.path.join(
        home_dir,
        ".sepal-data",
        "sepal",
        "jupyter",
        "current-kernels",
        app_name,
        "venv",
        "share",
        "jupyter",
        "labextensions",
    )


class DynamicStaticFiles:
    def __init__(self):
        pass

    async def __call__(self, scope, receive, send):
        request = scope["path_params"]
        app_name = request["app_name"]
        labextensions_dir = get_labextensions_dir(app_name)

        original_path = scope["path"]
        relative_path = original_path.split(f"/app/{app_name}/labextensions")[-1] or "/"

        scope = dict(scope)
        scope["path"] = relative_path

        static_app = StaticFiles(directory=labextensions_dir)
        await static_app(scope, receive, send)


async def generate_manifest(request):
    app_name = request.path_params["app_name"]
    labextensions_dir = get_labextensions_dir(app_name)
    extensions = []
    for root, dirs, files in os.walk(labextensions_dir):
        if "package.json" in files:
            rel_dir = os.path.relpath(root, labextensions_dir)
            extensions.append(rel_dir)
    return JSONResponse(extensions)


async def download_all_extensions(request):
    app_name = request.path_params["app_name"]
    labextensions_dir = get_labextensions_dir(app_name)
    zip_stream = io.BytesIO()
    with zipfile.ZipFile(zip_stream, "w", zipfile.ZIP_DEFLATED) as zip_file:
        for root, dirs, files in os.walk(labextensions_dir):
            for file in files:
                file_path = os.path.join(root, file)
                arcname = os.path.relpath(file_path, labextensions_dir)
                zip_file.write(file_path, arcname)
    zip_stream.seek(0)
    return StreamingResponse(
        zip_stream,
        media_type="application/zip",
        headers={"Content-Disposition": "attachment; filename=labextensions.zip"},
    )


# Homepage redirection
async def homepage(request):
    app_name = request.path_params["app_name"]
    return RedirectResponse(url=f"/app/{app_name}/labextensions/")


# Define the routes
routes = [
    Route(
        "/app/{app_name}/labextensions/download_all_extensions", download_all_extensions
    ),
    Route("/app/{app_name}/manifest.json", generate_manifest),
    Route("/app/{app_name}/labextensions/{path:path}", DynamicStaticFiles()),
    Route("/app/{app_name}/", homepage),
]

app = Starlette(debug=True, routes=routes)

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
