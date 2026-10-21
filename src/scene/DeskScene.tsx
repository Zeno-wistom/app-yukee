import { Suspense, useEffect, useMemo, useRef, type RefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  ContactShadows,
  Environment,
  Lightformer,
  RoundedBox,
} from "@react-three/drei";
import * as THREE from "three";
import gsap from "gsap";
import type { Phase } from "../state/machine";
import type { GameEventKind } from "../games/YukeeRun";
type Props = {
  entered: boolean;
  phase: Phase;
  onArrive: () => void;
  lampPortal: RefObject<HTMLDivElement | null>;
  monitorPortal: RefObject<HTMLDivElement | null>;
  direction: number;
  brightness: number;
  pulse: { kind: GameEventKind; at: number } | null;
};
const overview = {
  position: [7.0, 5.0, 9.5],
  target: [-0.8, 1.35, 0],
  fov: 37,
};
const seated = { position: [0, 1.95, 4.75], target: [0, 2.0, -0.8], fov: 42 };
function CameraRig({ entered, onArrive, lampPortal, monitorPortal }: Props) {
  const { camera, size } = useThree();
  const target = useRef(new THREE.Vector3(...overview.target));
  const lastPortalLayout = useRef<
    Record<"lamp" | "monitor", [number, number, number, number] | null>
  >({ lamp: null, monitor: null });
  useEffect(() => {
    const next = entered ? seated : overview;
    // 这是一次空间导航，而不是装饰动效：即使系统开启“减少动态”，
    // 也必须保留连续位移，否则 0.01s 会把必要的方位变化变成闪切。
    // 减少动态模式仅使用更平缓的 easing，避免加速感过强。
    const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const duration = entered ? 2.65 : 1.8;
    const timeline = gsap.timeline({
      onComplete: () => {
        if (entered) {
          // 先让 R3F 用最终相机位姿刷新一次门户几何，再挂载屏幕 UI。
          // 否则 container queries 可能在入场前坐标上完成首次布局并缓存旧原点。
          window.requestAnimationFrame(() =>
            window.requestAnimationFrame(() => onArrive()),
          );
        }
      },
    });
    timeline
      .to(
        camera.position,
        {
          x: next.position[0],
          y: next.position[1],
          z: next.position[2],
          duration,
          ease: reduceMotion ? "sine.inOut" : "power2.inOut",
        },
        0,
      )
      .to(
        target.current,
        {
          x: next.target[0],
          y: next.target[1],
          z: next.target[2],
          duration,
          ease: reduceMotion ? "sine.inOut" : "power2.inOut",
        },
        0,
      )
      .to(
        camera,
        {
          fov: next.fov,
          duration,
          ease: reduceMotion ? "sine.inOut" : "power2.inOut",
          onUpdate: () => camera.updateProjectionMatrix(),
        },
        0,
      );
    return () => {
      timeline.kill();
    };
  }, [entered, camera, onArrive]);
  const corners = useMemo(
    () => ({
      lamp: [
        new THREE.Vector3(-1.95, 3.585, -0.548),
        new THREE.Vector3(1.95, 3.165, -0.548),
      ],
      monitor: [
        new THREE.Vector3(-2.1, 2.98, -0.756),
        new THREE.Vector3(2.1, 0.62, -0.756),
      ],
    }),
    [],
  );
  useFrame(() => {
    camera.lookAt(target.current);
    for (const [name, ref] of [
      ["lamp", lampPortal],
      ["monitor", monitorPortal],
    ] as const) {
      if (!ref.current) continue;
      const [a, b] = corners[name].map((v) => v.clone().project(camera));
      const x = ((a.x + 1) * size.width) / 2,
        y = ((-a.y + 1) * size.height) / 2,
        width = ((b.x - a.x) * size.width) / 2,
        height = ((a.y - b.y) * size.height) / 2;
      const nextLayout: [number, number, number, number] = [
        x,
        y,
        width,
        height,
      ];
      const previousLayout = lastPortalLayout.current[name];
      if (
        previousLayout &&
        nextLayout.every(
          (value, index) => Math.abs(value - previousLayout[index]) < 0.25,
        )
      )
        continue;
      lastPortalLayout.current[name] = nextLayout;
      // 尺寸单位由 --portal-cqw 显式提供，因此这里不再依赖移动中的
      // CSS query container；用普通定位可确保门户与全部子层共享同一原点。
      ref.current.style.left = `${x}px`;
      ref.current.style.top = `${y}px`;
      ref.current.style.transform = "none";
      ref.current.style.width = `${width}px`;
      ref.current.style.height = `${height}px`;
      ref.current.style.setProperty("--portal-cqw", `${width / 100}px`);
    }
  });
  return null;
}
function woodTexture() {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 512;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#a88c69";
  ctx.fillRect(0, 0, 1024, 512);
  let seed = 41;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  for (let i = 0; i < 1600; i++) {
    const y = random() * 512;
    ctx.strokeStyle = `rgba(${random() > 0.5 ? "68,40,19" : "238,204,165"},${random() * 0.12})`;
    ctx.lineWidth = random() * 1.5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(
      320,
      y + random() * 12,
      600,
      y - random() * 8,
      1024,
      y + random() * 4,
    );
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 1);
  return texture;
}
function wallpaper() {
  const c = document.createElement("canvas");
  c.width = 1200;
  c.height = 700;
  const x = c.getContext("2d")!;
  const grad = x.createLinearGradient(0, 0, 1200, 700);
  grad.addColorStop(0, "#1e4941");
  grad.addColorStop(0.6, "#243c37");
  grad.addColorStop(1, "#122b27");
  x.fillStyle = grad;
  x.fillRect(0, 0, 1200, 700);
  for (let i = 0; i < 4; i++) {
    x.fillStyle = ["#5d8070", "#426859", "#35574a", "#213d34"][i];
    x.beginPath();
    x.moveTo(0, 430 + i * 50);
    for (let p = 0; p <= 1200; p += 20)
      x.lineTo(p, 400 + i * 62 + Math.sin(p / 220 + i * 1.4) * 90);
    x.lineTo(1200, 700);
    x.lineTo(0, 700);
    x.fill();
  }
  x.fillStyle = "#edf2df";
  x.beginPath();
  x.arc(850, 175, 45, 0, Math.PI * 2);
  x.fill();
  x.font = "24px Arial";
  x.fillStyle = "#ffffff99";
  x.fillText("Monday, a little slower.", 65, 75);
  x.font = "64px Georgia";
  x.fillStyle = "#ffffffdd";
  x.fillText("Make room", 65, 190);
  x.fillText("for yourself.", 65, 262);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function Box({
  position,
  scale,
  color = "#252b29",
  radius = 0.06,
  metalness = 0.1,
  roughness = 0.5,
}: {
  position: [number, number, number];
  scale: [number, number, number];
  color?: string;
  radius?: number;
  metalness?: number;
  roughness?: number;
}) {
  return (
    <RoundedBox
      position={position}
      args={scale}
      radius={Math.min(radius, Math.min(...scale) / 2 - 0.001)}
      smoothness={3}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial
        color={color}
        metalness={metalness}
        roughness={roughness}
      />
    </RoundedBox>
  );
}
function Lamp({
  phase,
  entered,
  direction,
  brightness,
  pulse,
}: Pick<Props, "phase" | "entered" | "direction" | "brightness" | "pulse">) {
  const faceShape = useMemo(() => {
    // Yukee 小屏高度收窄，让石墨灰边框在上下可见，挂灯轮廓更清晰
    const s = new THREE.Shape(),
      w = 3.94,
      h = 0.42,
      r = 0.12;
    s.moveTo(-w / 2 + r, -h / 2);
    s.lineTo(w / 2 - r, -h / 2);
    s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
    s.lineTo(w / 2, h / 2 - r);
    s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
    s.lineTo(-w / 2 + r, h / 2);
    s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
    s.lineTo(-w / 2, -h / 2 + r);
    s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
    return s;
  }, []);
  const bands = useRef<THREE.Mesh[]>([]);
  const eyes = useRef<THREE.Mesh[]>([]);
  const glow = useRef<THREE.PointLight>(null);
  const phaseStartedAt = useRef(performance.now());
  const lampTargetColor = useMemo(
    () =>
      new THREE.Color(
        phase === "weakReminder"
          ? "#8fe7c2"
          : phase === "secondaryReminder"
            ? "#efd09b"
            : phase === "strongReminder"
              ? "#f2aa7f"
              : "#e8f0ea",
      ),
    [phase],
  );
  useEffect(() => {
    phaseStartedAt.current = performance.now();
  }, [phase]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const phaseAge = (performance.now() - phaseStartedAt.current) / 1000;
    bands.current.forEach((mesh, i) => {
      if (!mesh) return;
      const p = i / 39;
      let intensity = 0.5;
      if (phase === "weakReminder") {
        const settle = Math.min(1, phaseAge / 0.62);
        const singleBreath =
          phaseAge < 1.9 ? Math.sin(Math.min(1, phaseAge / 1.9) * Math.PI) : 0;
        intensity = 0.52 + settle * 0.22 + singleBreath * 0.34;
      } else if (phase === "secondaryReminder")
        intensity = 0.3 + Math.max(0, Math.sin(p * 9 - t * 2)) * 0.8;
      else if (phase === "strongReminder") {
        const sweep = Math.pow(
          Math.max(0, Math.cos((p - 0.5) * Math.PI * 2 - t * 2.6)),
          4,
        );
        intensity = 0.42 + sweep * 1.35;
      } else if (phase === "yukeeRun")
        intensity =
          0.2 + (direction < 0 ? (p < 0.5 ? 1 : 0) : p > 0.5 ? 1 : 0) * 0.7;
      // 游戏事件脉冲：跳跃全灯亮一下，左右能量对应侧响应，完成柔和波浪
      if (pulse) {
        const age = (performance.now() - pulse.at) / 1000;
        if (age < 0.85) {
          const k = 1 - age / 0.85;
          if (pulse.kind === "jump") intensity += k * 1.3;
          else if (pulse.kind === "duck") intensity += k * 0.5;
          else if (pulse.kind === "left" && p < 0.5) intensity += k * 1.5;
          else if (pulse.kind === "right" && p > 0.5) intensity += k * 1.5;
          else if (pulse.kind === "stumble") intensity *= 1 - k * 0.45;
          else if (pulse.kind === "complete")
            intensity +=
              k * 1.6 * Math.max(0, Math.sin(p * Math.PI * 2 - age * 9));
        }
      }
      const material = mesh.material as THREE.MeshStandardMaterial;
      const colorEase = phase === "weakReminder" ? 0.055 : 0.075;
      material.color.lerp(lampTargetColor, colorEase);
      material.emissive.lerp(lampTargetColor, colorEase);
      material.emissiveIntensity = intensity * brightness;
    });
    eyes.current.forEach((eye, i) => {
      if (!eye) return;
      const blink = Math.sin(t * 1.5) > 0.994 ? 0.14 : 1;
      eye.scale.y = blink;
      eye.position.x = (i === 0 ? -0.22 : 0.22) + Math.sin(t * 0.6) * 0.04;
    });
    if (glow.current) {
      glow.current.color.lerp(
        lampTargetColor,
        phase === "weakReminder" ? 0.05 : 0.07,
      );
      const phaseBoost =
        phase === "strongReminder" ? 1.5 : phase === "weakReminder" ? 1.38 : 1;
      glow.current.intensity = 2.2 * brightness * phaseBoost;
    }
  });
  return (
    <group name="YukeeLamp" position={[0, 3.36, -0.77]}>
      <Box
        position={[0, -0.31, -0.13]}
        scale={[0.5, 0.28, 0.58]}
        color="#454d52"
        radius={0.04}
      />
      {/* 挂灯主体：石墨灰金属，与深黑显示器明确分层 */}
      <Box
        position={[0, 0, 0]}
        scale={[4.16, 0.69, 0.43]}
        color="#5d656b"
        radius={0.19}
        metalness={0.35}
        roughness={0.5}
      />
      {/* Yukee 小屏：深黑玻璃 */}
      <mesh position={[0, 0.015, 0.222]}>
        <shapeGeometry args={[faceShape]} />
        <meshStandardMaterial
          color="#04080a"
          metalness={0.4}
          roughness={0.15}
        />
      </mesh>
      {/* 待机轮廓眼：仅在未进入体验时展示；进入后由 portal 里的 Yukee 接管 */}
      {!entered &&
        [-1, 1].map((n, i) => (
          <mesh
            key={n}
            ref={(el) => {
              if (el) eyes.current[i] = el;
            }}
            position={[n * 0.22, 0.03, 0.243]}
          >
            <capsuleGeometry args={[0.075, 0.08, 4, 10]} />
            <meshBasicMaterial color="#b1f7d9" />
          </mesh>
        ))}
      {/* 灯带凹槽：让灯条有独立层级，不与面板争抢深度 */}
      <mesh position={[0, -0.302, 0.222]}>
        <boxGeometry args={[3.96, 0.07, 0.02]} />
        <meshStandardMaterial color="#0a0d0e" roughness={0.4} />
      </mesh>
      {Array.from({ length: 40 }, (_, i) => (
        <mesh
          key={i}
          ref={(el) => {
            if (el) bands.current[i] = el;
          }}
          position={[-1.91 + i * 0.098, -0.302, 0.24]}
        >
          <boxGeometry args={[0.095, 0.045, 0.05]} />
          <meshStandardMaterial
            color="#e8f0ea"
            emissive="#e8f0ea"
            emissiveIntensity={1}
            toneMapped={false}
          />
        </mesh>
      ))}
      <pointLight
        ref={glow}
        position={[0, -0.3, 0.32]}
        color="#ffdfad"
        intensity={2.2}
        distance={5}
        decay={2}
      />
      <mesh position={[1.83, 0.36, -0.05]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.055, 0.055, 0.025, 16]} />
        <meshStandardMaterial color="#b3b3a4" />
      </mesh>
    </group>
  );
}
function Desk(props: Props) {
  const wood = useMemo(woodTexture, []),
    screen = useMemo(wallpaper, []);
  useEffect(
    () => () => {
      wood.dispose();
      screen.dispose();
    },
    [wood, screen],
  );
  return (
    <>
      <RoundedBox
        args={[8.8, 0.22, 4.9]}
        position={[0, -0.05, 0.3]}
        radius={0.12}
        smoothness={3}
        receiveShadow
        castShadow
      >
        <meshStandardMaterial map={wood} roughness={0.74} />
      </RoundedBox>
      {[-3.7, 3.7].map((x) => (
        <Box
          key={x}
          position={[x, -1.0, 0.25]}
          scale={[0.14, 1.8, 3.8]}
          color="#333a34"
        />
      ))}
      <Box
        position={[0, 0.17, -0.8]}
        scale={[1.35, 0.11, 0.85]}
        color="#333a37"
        radius={0.1}
        metalness={0.7}
      />
      <Box
        position={[0, 0.57, -1.0]}
        scale={[0.19, 0.78, 0.19]}
        color="#525850"
        radius={0.035}
        metalness={0.8}
      />
      {/* 显示器：深黑机身，与石墨灰挂灯明确区分 */}
      <Box
        position={[0, 1.8, -0.86]}
        scale={[4.45, 2.6, 0.18]}
        color="#141719"
        radius={0.1}
        metalness={0.55}
        roughness={0.42}
      />
      <mesh position={[0, 1.8, -0.757]}>
        <planeGeometry args={[4.2, 2.36]} />
        <meshBasicMaterial map={screen} />
      </mesh>
      <mesh position={[0, 0.57, -0.74]}>
        <circleGeometry args={[0.023, 12]} />
        <meshBasicMaterial color="#bdc8b4" />
      </mesh>
      <Lamp {...props} />
      <Box
        position={[0, 0.1, 1.02]}
        scale={[4.5, 0.025, 1.68]}
        color="#344a40"
        radius={0.18}
        roughness={0.98}
      />
      <group position={[-0.55, 0.19, 0.96]} rotation={[0, -0.025, 0]}>
        <Box
          position={[0, 0, 0]}
          scale={[2.7, 0.14, 1.05]}
          color="#d3d4c5"
          radius={0.08}
        />
        {Array.from({ length: 5 }, (_, row) =>
          Array.from({ length: 14 }, (_, col) => (
            <Box
              key={`${row}-${col}`}
              position={[-1.23 + col * 0.188, 0.11, -0.4 + row * 0.178]}
              scale={[0.164, 0.075, 0.148]}
              color={
                row === 0 && col === 0
                  ? "#819b7e"
                  : col > 10
                    ? "#b9bfb1"
                    : "#e5e3d7"
              }
              radius={0.025}
              roughness={0.55}
            />
          )),
        )}
      </group>
      <group position={[1.53, 0.23, 1.02]}>
        <mesh scale={[0.29, 0.16, 0.46]} castShadow>
          <sphereGeometry args={[1, 32, 16]} />
          <meshStandardMaterial color="#deded0" roughness={0.36} />
        </mesh>
        <Box
          position={[0, 0.16, -0.08]}
          scale={[0.022, 0.015, 0.13]}
          color="#666e62"
          radius={0.005}
        />
      </group>
      <group position={[2.83, 0.2, 0.06]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.34, 0.36, 0.22, 48]} />
          <meshStandardMaterial
            color="#242c29"
            metalness={0.7}
            roughness={0.25}
          />
        </mesh>
        <mesh position={[0, 0.115, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.275, 0.286, 48]} />
          <meshBasicMaterial color="#aedbc0" />
        </mesh>
        <Box
          position={[0, 0.12, -0.23]}
          scale={[0.02, 0.012, 0.07]}
          color="#e6eadf"
          radius={0.005}
        />
      </group>
      <group position={[-3.12, 0.12, -0.4]}>
        <mesh position={[0, 0.27, 0]} castShadow>
          <cylinderGeometry args={[0.36, 0.29, 0.55, 32]} />
          <meshStandardMaterial color="#e3d8c2" roughness={0.8} />
        </mesh>
        <mesh position={[0, 0.55, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.32, 32]} />
          <meshStandardMaterial color="#443a2c" />
        </mesh>
        {Array.from({ length: 7 }, (_, i) => (
          <mesh
            key={i}
            position={[
              Math.sin(i * 2.4) * 0.23,
              0.9 + (i % 3) * 0.18,
              Math.cos(i * 2.4) * 0.17,
            ]}
            rotation={[i * 0.3, 0, i * 0.6]}
            scale={[0.16, 0.42, 0.05]}
            castShadow
          >
            <sphereGeometry args={[1, 16, 12]} />
            <meshStandardMaterial
              color={i % 2 ? "#627b4b" : "#83965f"}
              roughness={0.9}
            />
          </mesh>
        ))}
      </group>
      <Box
        position={[3.2, 0.13, 1.65]}
        scale={[1, 0.07, 0.68]}
        color="#c8b392"
        radius={0.025}
      />
      <Box
        position={[3.2, 0.19, 1.65]}
        scale={[0.94, 0.06, 0.65]}
        color="#e7e0cf"
        radius={0.02}
      />
    </>
  );
}
/** 体感游戏（G02/G03 及其校准）期间：相机静止、桌面只做背景，3D 场景降到约 24fps 渲染。 */
const THROTTLED_PHASES: ReadonlySet<Phase> = new Set<Phase>([
  "wingCalibration",
  "winglight",
  "leanCalibration",
  "leanSurf",
]);
const THROTTLED_FRAME_MS = 1000 / 24;
/**
 * 游戏画布与 MediaPipe 推理都在主线程。v3 期间 R3F 仍以显示器刷新率重绘整张桌面
 * （含 2048 阴影贴图与环境光照），与游戏争抢同一帧预算。这里改为按需渲染：
 * 约 24fps 主动刷新（灯带脉冲仍连续），阴影贴图冻结在进入时的一帧。
 */
function GameThrottle({ active, pulse }: { active: boolean; pulse: Props["pulse"] }) {
  const invalidate = useThree((s) => s.invalidate);
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    gl.shadowMap.autoUpdate = !active;
    gl.shadowMap.needsUpdate = true;
    invalidate();
    if (!active) return;
    let raf = 0,
      last = 0;
    const loop = (now: number) => {
      if (now - last >= THROTTLED_FRAME_MS - 2) {
        last = now;
        invalidate();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      gl.shadowMap.autoUpdate = true;
    };
  }, [active, gl, invalidate]);
  useEffect(() => {
    if (active) invalidate();
  }, [pulse, active, invalidate]);
  return null;
}
export default function DeskScene(props: Props) {
  const throttled = THROTTLED_PHASES.has(props.phase);
  return (
    <Canvas
      frameloop={throttled ? "demand" : "always"}
      shadows="basic"
      dpr={[1, 1.5]}
      camera={{
        position: overview.position as [number, number, number],
        fov: 37,
        near: 0.1,
        far: 60,
      }}
      gl={{ antialias: true }}
    >
      <color attach="background" args={["#e8e6db"]} />
      <GameThrottle active={throttled} pulse={props.pulse} />
      <fog attach="fog" args={["#e8e6db", 18, 35]} />
      <ambientLight intensity={0.55} />
      <hemisphereLight args={["#f6f3dc", "#718778", 1.0]} />
      <directionalLight
        position={[-3, 7, 5]}
        intensity={3.2}
        color="#fff1d7"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-7}
        shadow-camera-right={7}
        shadow-camera-top={7}
        shadow-camera-bottom={-7}
        shadow-normalBias={0.035}
      />
      <Suspense fallback={null}>
        <Environment resolution={128}>
          <Lightformer
            form="rect"
            intensity={3}
            position={[0, 5, 2]}
            scale={[8, 6, 1]}
            rotation={[Math.PI / 2, 0, 0]}
          />
          <Lightformer
            form="rect"
            intensity={2}
            position={[-6, 3, 1]}
            scale={[4, 6, 1]}
            rotation={[0, Math.PI / 2, 0]}
          />
        </Environment>
        <Desk {...props} />
        <ContactShadows
          position={[0, -1.96, 0]}
          opacity={0.35}
          scale={25}
          blur={2.6}
          far={6}
        />
      </Suspense>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -1.98, 0]}
        receiveShadow
      >
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial color="#d9d9cc" roughness={1} />
      </mesh>
      <CameraRig {...props} />
    </Canvas>
  );
}
