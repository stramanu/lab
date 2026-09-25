"""Copies the Go1 scene used by MuJoCo Playground (flat and rough terrain) into the site, with flat,
browser-friendly paths, and writes the licence notice of every third-party file.

Usage: .venv/bin/python export_web_assets.py [--out ../../web/public/applied/assets/go1]
"""
import argparse
import re
import shutil
from pathlib import Path

import mujoco
import mujoco_playground
from mujoco_playground import registry

PLAYGROUND = Path(mujoco_playground.__file__).parent
XMLS = PLAYGROUND / "_src" / "locomotion" / "go1" / "xmls"
MENAGERIE = PLAYGROUND / "external_deps" / "mujoco_menagerie" / "unitree_go1"

NOTICE = """# Go1 scene: third-party files

These files are copies of third-party models and assets, with file paths rewritten for the browser
(`export_web_assets.py`). Nothing else is changed.

- `go1_mjx_feetonly.xml`, `scene_*.xml`, `sensor_feet.xml`: MuJoCo Playground
  (https://github.com/google-deepmind/mujoco_playground), Apache License 2.0, © Google DeepMind.
- `meshes/*.stl`: MuJoCo Menagerie, `unitree_go1`
  (https://github.com/google-deepmind/mujoco_menagerie), BSD 3-Clause License, © 2016–2022 HangZhou YuShu
  Technology Co., Ltd. ("Unitree Robotics"). The full licence is in `LICENSE-unitree-go1`.
- `assets/rocky_texture.png`: Poly Haven, "rock_face" (https://polyhaven.com/a/rock_face), CC0, as
  credited in MuJoCo Playground. `assets/hfield.png`: MuJoCo Playground, Apache License 2.0.
"""


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default=str(Path(__file__).parent / ".." / ".." / "web" / "public" / "applied" / "assets" / "go1"))
    out = Path(parser.parse_args().out).resolve()
    (out / "meshes").mkdir(parents=True, exist_ok=True)
    (out / "assets").mkdir(parents=True, exist_ok=True)

    robot = (XMLS / "go1_mjx_feetonly.xml").read_text()
    # No meshdir (it would also apply to the terrain's heightfield): meshes are addressed by path.
    robot = re.sub(r'\s+meshdir="[^"]*"', '', robot)
    robot = re.sub(r'file="[^"]*/unitree_go1/assets/([^"/]+\.stl)"', r'file="meshes/\1"', robot)
    (out / "go1_mjx_feetonly.xml").write_text(robot)
    for name in ["scene_mjx_feetonly_flat_terrain.xml", "scene_mjx_feetonly_rough_terrain.xml", "sensor_feet.xml"]:
        shutil.copyfile(XMLS / name, out / name)
    for f in (XMLS / "assets").iterdir():
        shutil.copyfile(f, out / "assets" / f.name)
    for f in (MENAGERIE / "assets").glob("*.stl"):
        shutil.copyfile(f, out / "meshes" / f.name)
    shutil.copyfile(MENAGERIE / "LICENSE", out / "LICENSE-unitree-go1")
    (out / "NOTICE.md").write_text(NOTICE)

    # The rewritten scenes must compile exactly like Playground's (same model sizes).
    for scene, env_name in [("scene_mjx_feetonly_flat_terrain.xml", "Go1JoystickFlatTerrain"), ("scene_mjx_feetonly_rough_terrain.xml", "Go1JoystickRoughTerrain")]:
        ours = mujoco.MjModel.from_xml_path(str(out / scene))
        theirs = registry.load(env_name).mj_model
        same = (ours.nbody, ours.njnt, ours.nu, ours.ngeom, ours.nmesh, ours.nhfield) == (theirs.nbody, theirs.njnt, theirs.nu, theirs.ngeom, theirs.nmesh, theirs.nhfield)
        print(f"{scene}: {ours.nbody} bodies, {ours.nu} actuators, {ours.ngeom} geoms, timestep {ours.opt.timestep} s (Playground trains at {theirs.opt.timestep} s); identical sizes: {same}")
        assert same
    size = sum(f.stat().st_size for f in out.rglob("*") if f.is_file())
    print(f"→ {out} ({size / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
