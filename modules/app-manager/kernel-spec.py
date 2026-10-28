#!/usr/bin/env python3
"""Print the kernel.json spec for one app venv.

Called by update-app.sh, which built this JSON by hand until the display name — which comes
from the external app catalog — turned out to need every control character below 0x20 escaped.
The fields arrive as SPEC_* environment variables rather than arguments so the call site names
each one and a new field needs no argument order. Key order in the output is part of the
contract; test/kernel-json.golden records it.
"""
import json
import os

v = os.environ
venv = v["SPEC_VENV"]
env = {}
spec = {}
if v["SPEC_USE_LAUNCHER"] == "true":
    # The launcher resolves the prefix at run time and owns the whole interpreter environment,
    # so nothing prefix-dependent may be baked in here.
    spec["argv"] = ["/bin/bash", v["SPEC_LAUNCHER"], v["SPEC_APP"], "-f", "{connection_file}"]
else:
    spec["argv"] = [venv + "/bin/python3", "-m", "ipykernel_launcher", "-f", "{connection_file}"]
    env["PYTHONNOUSERSITE"] = "1"
    if v["SPEC_CONDA"] == "true":
        env["PROJ_LIB"] = venv + "/share/proj"
        env["PROJ_DATA"] = venv + "/share/proj"
        env["GDAL_DATA"] = venv + "/share/gdal"
spec["display_name"] = v["SPEC_LABEL"]
spec["language"] = "python"
spec["env"] = env
print(json.dumps(spec, indent=2, ensure_ascii=False))
