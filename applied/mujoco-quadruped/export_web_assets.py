"""Copies the Go1 scene used by MuJoCo Playground (flat and rough terrain) into the site, with flat,
browser-friendly paths, and writes the licence notice of every third-party file.

Usage: .venv/bin/python export_web_assets.py [--out ../../web/public/applied/assets/go1]
"""
import argparse
import math
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

- `go1_mjx_*.xml`, `scene_*.xml`, `sensor_*.xml`: MuJoCo Playground
  (https://github.com/google-deepmind/mujoco_playground), Apache License 2.0, © Google DeepMind.
- `meshes/*.stl`: MuJoCo Menagerie, `unitree_go1`
  (https://github.com/google-deepmind/mujoco_menagerie), BSD 3-Clause License, © 2016–2022 HangZhou YuShu
  Technology Co., Ltd. ("Unitree Robotics"). The full licence is in `LICENSE-unitree-go1`.
- `assets/rocky_texture.png`: Poly Haven, "rock_face" (https://polyhaven.com/a/rock_face), CC0, as
  credited in MuJoCo Playground. `assets/hfield.png`: MuJoCo Playground, Apache License 2.0.
- `page_*.xml`: scenes for the lab's page, derived from the Playground scenes above: the full-collision robot
  on flat and rough ground, and an obstacle course of our own (MIT, like the rest of the lab).
"""


def course_xml() -> str:
    """Obstacle course for the page (ours, MIT), along +x from 1.5 m. The policy was trained on gently rough
    ground and cannot see: some of these it will manage, some it will not.
    Each ramp is a box of half-length a, half-thickness c, pitched by theta, placed so that its top surface
    goes exactly from the ground (z = 0) to the plateau's top (H = 2 a sin theta): no lip at either end."""
    geoms = []
    theta, a, c = 0.1, 0.8, 0.05  # 5.7 degrees, 1.6 m long: a 16 cm rise
    rise = 2 * a * math.sin(theta)
    run = a * math.cos(theta)  # half of the ramp's horizontal extent
    zc = a * math.sin(theta) - c * math.cos(theta)  # the top surface's midpoint sits at rise / 2
    x = 1.5
    geoms.append(("ramp_up", "box", f"{a} 0.8 {c}", f"{x + run:.4f} 0 {zc:.4f}", f"0 {-theta} 0", ".72 .66 .55 1"))
    x += 2 * run
    geoms.append(("plateau", "box", f"0.6 0.8 {rise / 2:.4f}", f"{x + 0.6:.4f} 0 {rise / 2:.4f}", "0 0 0", ".72 .66 .55 1"))
    x += 1.2
    geoms.append(("ramp_down", "box", f"{a} 0.8 {c}", f"{x + run:.4f} 0 {zc:.4f}", f"0 {theta} 0", ".72 .66 .55 1"))
    x += 2 * run + 1.0
    for k, h in enumerate([0.02, 0.04, 0.06], start=1):  # low steps, 50 cm deep
        geoms.append((f"step{k}", "box", f"0.25 0.8 {h / 2}", f"{x + 0.25:.4f} 0 {h / 2}", "0 0 0", ".62 .58 .5 1"))
        x += 0.5
    geoms.append(("step_top", "box", "0.5 0.8 0.03", f"{x + 0.5:.4f} 0 0.03", "0 0 0", ".62 .58 .5 1"))
    x += 2.0
    for k, r in enumerate([0.02, 0.03, 0.04], start=1):  # branch-like bumps across the path
        geoms.append((f"bump{k}", "cylinder", f"{r} 0.7", f"{x:.4f} 0 0", "1.5708 0 0", ".48 .35 .23 1"))
        x += 0.8
    x += 1.0
    for k, h in enumerate([0.08, 0.10, 0.12], start=1):  # the hard part: taller steps, each on the ground
        geoms.append((f"tall{k}", "box", f"0.4 0.8 {h / 2}", f"{x + 0.4:.4f} 0 {h / 2}", "0 0 0", ".52 .48 .42 1"))
        x += 1.6
    rows = "\n".join(f'      <geom name="{n}" type="{t}" size="{sz}" pos="{p}" euler="{e}" rgba="{rgba}"/>' for n, t, sz, p, e, rgba in geoms)
    return f'\n    <body name="course" pos="0 0 0">\n{rows}\n    </body>\n'


def write_page_scenes(out: Path) -> None:
    """Scenes for the page, with the full-collision robot: a fallen robot lies on the ground instead of
    sinking through it (the feet-only model used for training collides with the ground only by its feet)."""
    flat = (out / "scene_mjx_fullcollisions_flat_terrain.xml").read_text()
    (out / "page_flat.xml").write_text(flat)
    rough = (out / "scene_mjx_feetonly_rough_terrain.xml").read_text()
    rough = rough.replace('<include file="go1_mjx_feetonly.xml"/>', '<include file="go1_mjx_fullcollisions.xml"/>')
    rough = rough.replace('<include file="sensor_feet.xml"/>', '<include file="sensor_feet.xml"/>\n  <include file="sensor_fullcollision.xml"/>')
    (out / "page_rough.xml").write_text(rough)
    course = flat.replace("</worldbody>", course_xml() + "  </worldbody>", 1)
    (out / "page_course.xml").write_text(course)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default=str(Path(__file__).parent / ".." / ".." / "web" / "public" / "applied" / "assets" / "go1"))
    out = Path(parser.parse_args().out).resolve()
    (out / "meshes").mkdir(parents=True, exist_ok=True)
    (out / "assets").mkdir(parents=True, exist_ok=True)

    for robot_file in ["go1_mjx_feetonly.xml", "go1_mjx_fullcollisions.xml"]:
        robot = (XMLS / robot_file).read_text()
        # No meshdir (it would also apply to the terrain's heightfield): meshes are addressed by path.
        robot = re.sub(r'\s+meshdir="[^"]*"', '', robot)
        robot = re.sub(r'file="(?:[^"]*/)?([^"/]+\.stl)"', r'file="meshes/\1"', robot)
        (out / robot_file).write_text(robot)
    for name in ["scene_mjx_feetonly_flat_terrain.xml", "scene_mjx_feetonly_rough_terrain.xml", "scene_mjx_fullcollisions_flat_terrain.xml", "sensor_feet.xml", "sensor_fullcollision.xml"]:
        shutil.copyfile(XMLS / name, out / name)
    write_page_scenes(out)
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
    for scene in ["page_flat.xml", "page_rough.xml", "page_course.xml"]:
        m = mujoco.MjModel.from_xml_path(str(out / scene))
        print(f"{scene}: {m.nbody} bodies, {m.nu} actuators, {m.ngeom} geoms, keyframes {m.nkey}")
    size = sum(f.stat().st_size for f in out.rglob("*") if f.is_file())
    print(f"→ {out} ({size / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
