"""
YUKEE 挂灯 3dm → GLB 转换（只做格式与单位转换，不改几何）。

- 读取 Rhino 文件自带的渲染网格（Brep 面 / Extrusion），不重新细分、不简化、不拉伸；
- 单位：毫米 → 米（×0.001）；坐标系保持 Rhino 原始 Z-up，在场景中绕 X 轴 -90° 转为 Y-up；
- 按图层分配材质（颜色取自文件内材质：殼=塑胶 #50C9FF、屏幕=玻璃(1)、攝像頭=发光、后蓋=玻璃、
  電路板=塑胶(1)、燈罩=塑胶(2)）；
- 文件内有 4 组空间分离的实体：A（早期外壳）、B（爆炸图，含电路板/LED/扩散板）、
  C（完整装配态）、C2（C 的平移副本）。演示使用 C；全部组都会导出以便核对。

依赖：pip install rhino3dm trimesh numpy
用法：python3 convert_3dm.py source/挂燈外殼.3dm out/
"""
import json, os, sys
import numpy as np, rhino3dm as r, trimesh

src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
m = r.File3dm.Read(src)
assert m.Settings.ModelUnitSystem == r.UnitSystem.Millimeters, m.Settings.ModelUnitSystem
EN = {"殼": "shell", "屏幕": "screen", "攝像頭": "camera", "后蓋": "backcover", "電路板": "pcb", "燈罩": "lampshade"}
MAT = {"殼": [80, 201, 255], "屏幕": [10, 10, 12], "攝像頭": [20, 20, 22], "后蓋": [205, 205, 201], "電路板": [139, 189, 149], "燈罩": [255, 162, 69]}


def meshes(g):
    ms = []
    if isinstance(g, r.Brep):
        ms = [f.GetMesh(r.MeshType.Any) for f in g.Faces]
    elif isinstance(g, r.Extrusion):
        ms = [g.GetMesh(r.MeshType.Any)]
    parts = []
    for mm in ms:
        if not mm:
            continue
        mm.Faces.ConvertQuadsToTriangles()
        V = np.array([[v.X, v.Y, v.Z] for v in mm.Vertices])
        F = np.array([list(mm.Faces[i])[:3] for i in range(len(mm.Faces))])
        parts.append(trimesh.Trimesh(V, F, process=False))
    return trimesh.util.concatenate(parts) if parts else None


def cluster(c):
    return "A" if c[0] < 300 else "B" if c[0] < 900 else ("C2" if c[1] > 200 else "C")


scenes, report, skipped = {}, [], []
for i, o in enumerate(m.Objects):
    layer = m.Layers[o.Attributes.LayerIndex].Name
    t = meshes(o.Geometry)
    if t is None:
        skipped.append({"obj": i, "type": type(o.Geometry).__name__, "layer": layer})
        continue
    V = t.vertices
    k = cluster(V.mean(0))
    tm = trimesh.Trimesh(V * 0.001, t.faces, process=False)
    tm.visual = trimesh.visual.TextureVisuals(material=trimesh.visual.material.PBRMaterial(
        name=EN[layer], baseColorFactor=MAT[layer] + [255], metallicFactor=0.0, roughnessFactor=0.35))
    scenes.setdefault(k, trimesh.Scene()).add_geometry(tm, node_name=f"{EN[layer]}_{i}", geom_name=f"{EN[layer]}_{i}")
    report.append({"obj": i, "layer": layer, "part": EN[layer], "group": k, "bbox_mm": np.r_[V.min(0), V.max(0)].round(2).tolist(), "triangles": int(len(t.faces))})
for k, s in scenes.items():
    s.export(os.path.join(out, f"yukee-lamp-{k}.glb"))
json.dump({"units": "mm (GLB: m)", "groups": {k: len(s.geometry) for k, s in scenes.items()}, "parts": report, "skipped_curves": skipped},
          open(os.path.join(out, "parts.json"), "w"), ensure_ascii=False, indent=1)
print({k: len(s.geometry) for k, s in scenes.items()}, "skipped curves:", len(skipped))
