"use client";

import * as THREE from "three";
import {
  type CSSProperties,
  type DragEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import manifestJson from "../../public/reef/assets/manifest.json";

type AssetKind = "animal" | "plant" | "decor";
type Behavior = "solo" | "school" | "bottom" | "jellyfish" | "turtle" | "whale";
type ReefAsset = {
  id: string;
  name: string;
  file: string;
  mask: string;
  kind: AssetKind;
  headDirection: "right" | "none";
  bodyRange: [number, number];
  tailStart: number;
  sizeRange: [number, number];
  depthRange: [number, number];
  speedRange: [number, number];
  behavior: Behavior;
  schoolSize: number;
};
type ReefObject = {
  id: string;
  type: string;
  x: number;
  y: number;
  size: number;
  rotation: number;
  depth: number;
  speed: number;
  range: number;
  flipped: boolean;
  locked: boolean;
  phase: number;
};
type BubbleGroup = { id: string; x: number; y: number; count: number; seed: number };
type WaterTrail = { id: string; x: number; y: number; length: number; angle: number; seed: number };
type FoodDrop = { id: string; x: number; y: number; bornAt: number; seed: number };
type BloodBloom = { id: string; x: number; y: number; seed: number };
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};
type Runtime = {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  position: THREE.Vector2;
  velocity: THREE.Vector2;
  target: THREE.Vector2;
  targetTimer: number;
  pauseTimer: number;
  yaw: number;
  desiredYaw: number;
  turn: number;
  turnSide: -1 | 1;
  turnStartFace: -1 | 1;
  travelDir: -1 | 1;
  verticalDir: -1 | 1;
  fleeVector: THREE.Vector2;
  swimRate: number;
  swimPower: number;
  tempoScale: number;
  moodSpeed: number;
  moodTarget: number;
  moodTimer: number;
  moodIndex: number;
  aspect: number;
  width: number;
  height: number;
  phase: number;
  flee: number;
  eatenTimer: number;
  respawnTimer: number;
  huntCooldown: number;
  mask: Uint8Array | null;
};
type ReefEngine = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  runtimes: Map<string, Runtime>;
  textureCache: Map<string, Promise<THREE.Texture>>;
  width: number;
  height: number;
  sync: (objects: ReefObject[]) => void;
};

const MANIFEST = manifestJson.assets as ReefAsset[];
const ASSETS = Object.fromEntries(MANIFEST.map((asset) => [asset.id, asset])) as Record<string, ReefAsset>;
const STORAGE_KEY = "photo-reef:v1";
const CCD_STORAGE_KEY = "photo-reef:ccd:v1";
const DEFAULT_CCD_STRENGTH = 0.72;
const WALLPAPER_RELEASE_URL = "https://github.com/1009pls666-spec/coral-reef-wallpaper-downloads/releases/download/v0.1.0";
const WINDOWS_WALLPAPER_DOWNLOAD_URL = `${WALLPAPER_RELEASE_URL}/CoralReefWallpaper-Windows.exe`;
const AMBIENT_WHALE_ID = "humpbackWhale-default-ambient";
// Keep individual saved sizes intact while making every foreground animal
// read clearly on first load. This also upgrades existing saved reefs because
// the visual baseline is applied only at render time.
const BASE_ANIMAL_VISUAL_SCALE = 1.03;
const DEFAULT_ANIMAL_POPULATION_SCALE = 1;
const MIN_ANIMAL_POPULATION_SCALE = 0.25;
const MAX_ANIMAL_POPULATION_SCALE = 2.5;
const DEFAULT_ANIMAL_SPEED_SCALE = 1;
const MIN_ANIMAL_SPEED_SCALE = 0.35;
const MAX_ANIMAL_SPEED_SCALE = 2;
const POPULATION_AUTO_ID_PREFIX = "population-auto-";
// The source whale is unusually wide and shallow. Let the ambient pass span
// almost the whole viewport so its visible body also feels genuinely huge,
// while keeping user-added whales at their normal editable size.
const WHALE_SCREEN_WIDTH = 0.95;
// A full pass takes about 31 seconds. Hiding it for another 58 seconds keeps
// the start-to-start cadence close to 90 seconds across viewport sizes.
const WHALE_PASS_GAP_SECONDS = 58;
const STANDARD_FISH_MAX_SIZE = 0.35;
const LARGE_SWIMMER_MAX_SIZE = STANDARD_FISH_MAX_SIZE * 5;
const TAU = Math.PI * 2;
const SMALL_FISH_EXCLUSIONS = new Set(["reefShark", "humpbackWhale", "seaTurtle", "jellyfish"]);
const LARGE_SWIMMERS = new Set(["reefShark", "humpbackWhale"]);
const SCALABLE_POPULATION_TYPES = [
  "blueTang",
  "yellowTang",
  "clownfish",
  "bannerfish",
  "butterflyfish",
  "silverTang",
  "seaTurtle",
  "jellyfish",
] as const;
const SCALABLE_POPULATION_SET = new Set<string>(SCALABLE_POPULATION_TYPES);
const DEFAULT_POPULATION_LIMITS: Record<string, number> = {
  blueTang: 2,
  yellowTang: 2,
  clownfish: 3,
  bannerfish: 1,
  butterflyfish: 2,
  silverTang: 2,
  seaTurtle: 1,
  jellyfish: 1,
  humpbackWhale: 1,
  reefShark: 1,
};

const FISH_VERTEX = `
  varying vec2 vUv;
  uniform float uTime;
  uniform float uAmp;
  uniform float uFreq;
  uniform float uPhase;
  uniform float uTailStart;
  uniform float uPlant;
  uniform float uBehavior;
  void main() {
    vUv = uv;
    vec3 p = position;
    if (uPlant > 0.5) {
      float rootWeight = pow(clamp(uv.y, 0.0, 1.0), 1.7);
      p.x += sin(uTime * 0.72 + uv.y * 4.4 + uPhase) * uAmp * rootWeight;
    } else if (uBehavior > 1.5 && uBehavior < 2.5) {
      float lowerHalf = pow(clamp((0.59 - uv.y) * 2.35, 0.0, 1.0), 1.35);
      float frontFlipper = exp(-pow((uv.x - 0.62) * 6.6, 2.0)) * lowerHalf;
      float farFlipper = exp(-pow((uv.x - 0.84) * 10.5, 2.0)) * pow(clamp((0.56 - uv.y) * 2.55, 0.0, 1.0), 1.5);
      float rearFlipper = exp(-pow((uv.x - 0.16) * 9.2, 2.0)) * pow(clamp((0.55 - uv.y) * 2.45, 0.0, 1.0), 1.25);
      float paddle = sin(uTime * uFreq + uPhase);
      p.y += paddle * uAmp * (frontFlipper * 4.3 - farFlipper * 2.1 + rearFlipper * 1.8);
      p.x += cos(uTime * uFreq + uPhase) * uAmp * (frontFlipper * 1.3 + farFlipper * 0.42);
    } else if (uBehavior > 2.5 && uBehavior < 3.5) {
      // The source jellyfish lies horizontally with its bell on the right.
      // Keep that bell rigid and bend only the transparent tentacle half.
      float tentacle = pow(1.0 - smoothstep(0.06, 0.58, uv.x), 1.18);
      float strand = 0.88 + sin(uv.y * 13.0 + uPhase * 1.3) * 0.12;
      float longWave = sin(uTime * uFreq * 0.92 - uv.x * 9.5 + uv.y * 2.6 + uPhase);
      float secondaryWave = sin(uTime * uFreq * 1.18 - uv.x * 14.0 - uv.y * 1.8 + uPhase * 0.73);
      float bell = smoothstep(0.56, 0.8, uv.x);
      float bellPulse = sin(uTime * uFreq * 0.72 + uPhase);
      p.y += (longWave * 0.86 + secondaryWave * 0.14) * uAmp * tentacle * strand * 3.15;
      p.x += sin(uTime * uFreq * 0.78 - uv.x * 6.8 + uPhase) * uAmp * tentacle * 0.34;
      p.x += bellPulse * uAmp * bell * 0.42;
      p.y *= 1.0 - bell * bellPulse * 0.035;
    } else if (uBehavior > 3.5) {
      float tailness = 1.0 - uv.x;
      float envelope = pow(tailness, 1.58);
      float caudalBoost = 1.0 + smoothstep(0.58, 0.94, tailness) * 1.15;
      p.y += sin(uv.x * 8.2 - uTime * uFreq + uPhase) * uAmp * envelope * caudalBoost * 1.22;
      p.x += cos(uv.x * 5.4 - uTime * uFreq + uPhase) * uAmp * envelope * 0.1;
    } else {
      float tailness = 1.0 - uv.x;
      float envelope = pow(tailness, 1.65);
      float tailBoost = 1.0 + smoothstep(uTailStart, 1.0, tailness) * 1.45;
      p.y += sin(uv.x * 8.6 - uTime * uFreq + uPhase) * uAmp * envelope * tailBoost;
      p.x += cos(uv.x * 5.8 - uTime * uFreq + uPhase) * uAmp * envelope * 0.12;
    }
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const FISH_FRAGMENT = `
  varying vec2 vUv;
  uniform sampler2D uMap;
  uniform vec3 uTint;
  uniform float uOpacity;
  uniform float uPlant;
  uniform float uViewportFeather;
  uniform float uDepth;
  uniform vec2 uResolution;
  void main() {
    vec4 texel = texture2D(uMap, vUv);
    if (texel.a < 0.025) discard;
    vec3 color = texel.rgb * uTint;
    float viewportFeather = 1.0;
    if (uPlant < 0.5 && uViewportFeather > 0.5 && uResolution.x > 1.0) {
      vec2 screenUv = gl_FragCoord.xy / uResolution;
      float fadeX = smoothstep(0.0, 0.024, screenUv.x) * smoothstep(0.0, 0.024, 1.0 - screenUv.x);
      float fadeY = smoothstep(0.0, 0.02, screenUv.y) * smoothstep(0.0, 0.02, 1.0 - screenUv.y);
      viewportFeather = min(fadeX, fadeY);
    }
    gl_FragColor = vec4(color, texel.a * uOpacity * viewportFeather);
  }
`;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function seeded(index: number, salt: number) {
  // Integer hashing stays bit-for-bit identical between SSR and the browser.
  let value = Math.imul(Math.trunc(index) ^ Math.imul(Math.trunc(salt), 0x45d9f3b), 0x27d4eb2d);
  value = Math.imul(value ^ (value >>> 15), 0x85ebca6b);
  value ^= value >>> 13;
  return (value >>> 0) / 4294967296;
}

function cloneObjects(objects: ReefObject[]) {
  return objects.map((object) => ({ ...object }));
}

function maxSizeForType(type: string) {
  return LARGE_SWIMMERS.has(type) ? LARGE_SWIMMER_MAX_SIZE : STANDARD_FISH_MAX_SIZE;
}

function trimDefaultPopulation(objects: ReefObject[]) {
  const counts = new Map<string, number>();
  return objects.filter((object) => {
    if (!object.id.includes("-default-") || DEFAULT_POPULATION_LIMITS[object.type] === undefined) return true;
    const count = counts.get(object.type) ?? 0;
    counts.set(object.type, count + 1);
    return count < DEFAULT_POPULATION_LIMITS[object.type];
  });
}

function isScalableDefaultAnimal(object: ReefObject) {
  return object.id.includes("-default-") && SCALABLE_POPULATION_SET.has(object.type);
}

function populationScene(objects: ReefObject[], populationScale: number) {
  const scalableDefaults = objects.filter(isScalableDefaultAnimal);
  const fixedObjects = objects.filter((object) => !isScalableDefaultAnimal(object));
  const balancedDefaults: ReefObject[] = [];
  for (let occurrence = 0; occurrence < 3; occurrence += 1) {
    for (const type of SCALABLE_POPULATION_TYPES) {
      const match = scalableDefaults.filter((object) => object.type === type)[occurrence];
      if (match) balancedDefaults.push(match);
    }
  }
  const normalizedScale = clamp(populationScale, MIN_ANIMAL_POPULATION_SCALE, MAX_ANIMAL_POPULATION_SCALE);
  const visibleDefaultCount = normalizedScale < 1
    ? Math.max(1, Math.round(scalableDefaults.length * normalizedScale))
    : scalableDefaults.length;
  const visibleDefaults = balancedDefaults.slice(0, visibleDefaultCount);
  const extraCount = normalizedScale > 1
    ? Math.round(scalableDefaults.length * (normalizedScale - 1))
    : 0;
  const extras = Array.from({ length: extraCount }, (_, index): ReefObject => {
    const type = SCALABLE_POPULATION_TYPES[index % SCALABLE_POPULATION_TYPES.length];
    const asset = ASSETS[type];
    const seedIndex = index + 300;
    const depth = asset.depthRange[0] + seeded(seedIndex, 211) * (asset.depthRange[1] - asset.depthRange[0]);
    const size = asset.sizeRange[0] + seeded(seedIndex, 223) * (asset.sizeRange[1] - asset.sizeRange[0]);
    return {
      id: `${POPULATION_AUTO_ID_PREFIX}${index}-${type}`,
      type,
      x: 0.05 + seeded(seedIndex, 227) * 0.9,
      y: 0.12 + seeded(seedIndex, 229) * 0.68,
      size,
      rotation: (seeded(seedIndex, 233) - 0.5) * 6,
      depth,
      speed: 0.76 + seeded(seedIndex, 239) * 0.5,
      range: 0.07 + seeded(seedIndex, 241) * 0.12,
      flipped: seeded(seedIndex, 251) > 0.5,
      locked: false,
      phase: seeded(seedIndex, 257) * TAU,
    };
  });
  return [...fixedObjects, ...visibleDefaults, ...extras];
}

function defaultReef(): ReefObject[] {
  const population: string[] = [
    ...Array(2).fill("blueTang"),
    ...Array(2).fill("yellowTang"),
    ...Array(3).fill("clownfish"),
    "bannerfish",
    ...Array(2).fill("butterflyfish"),
    ...Array(2).fill("silverTang"),
    "seaTurtle",
    "jellyfish",
    "humpbackWhale",
    "reefShark",
  ];
  const objects = population.map((type, index) => {
    const asset = ASSETS[type];
    const depth = type === "reefShark" ? 0.07 : type === "humpbackWhale" ? 0.12 : type === "seaTurtle" ? 0.86 : asset.depthRange[0] + seeded(index, 2) * (asset.depthRange[1] - asset.depthRange[0]);
    const sizeMix = seeded(index, 7);
    const size = asset.sizeRange[0] + sizeMix * (asset.sizeRange[1] - asset.sizeRange[0]);
    return {
      id: type === "humpbackWhale" ? AMBIENT_WHALE_ID : `${type}-default-${index}`,
      type,
      x: type === "reefShark" ? 0.69 : type === "humpbackWhale" ? 0.2 : 0.08 + seeded(index, 3) * 0.84,
      y: type === "reefShark" ? 0.34 : type === "humpbackWhale" ? 0.2 : 0.17 + seeded(index, 5) * 0.58,
      size,
      rotation: (seeded(index, 9) - 0.5) * 7,
      depth,
      speed: 0.8 + seeded(index, 11) * 0.42,
      range: 0.07 + seeded(index, 13) * 0.12,
      flipped: type === "humpbackWhale" ? false : seeded(index, 15) > 0.52,
      locked: false,
      phase: seeded(index, 17) * TAU,
    };
  });
  objects.push(
    { id: "seaweed-default-0", type: "seaweed", x: 0.88, y: 0.95, size: 0.22, rotation: -4, depth: 0.94, speed: 0, range: 0, flipped: false, locked: true, phase: 0.4 },
    { id: "seaweed-default-1", type: "seaweed", x: 0.08, y: 0.96, size: 0.17, rotation: 5, depth: 0.7, speed: 0, range: 0, flipped: true, locked: true, phase: 2.2 },
    { id: "seaFan-default-0", type: "seaFan", x: 0.76, y: 0.96, size: 0.16, rotation: 2, depth: 0.76, speed: 0, range: 0, flipped: false, locked: true, phase: 4.1 },
    { id: "seaFan-default-1", type: "seaFan", x: 0.16, y: 0.95, size: 0.12, rotation: -3, depth: 0.48, speed: 0, range: 0, flipped: false, locked: true, phase: 5.3 },
    { id: "coralRock-default-0", type: "coralRock", x: 0.57, y: 0.98, size: 0.2, rotation: 0, depth: 0.98, speed: 0, range: 0, flipped: false, locked: true, phase: 1.1 },
  );
  return objects;
}

function validateImport(value: unknown): ReefObject[] | null {
  if (!value || typeof value !== "object" || !("objects" in value) || !Array.isArray((value as { objects: unknown }).objects)) return null;
  const parsed: ReefObject[] = [];
  for (const raw of (value as { objects: unknown[] }).objects) {
    if (!raw || typeof raw !== "object") return null;
    const item = raw as Partial<ReefObject>;
    if (!item.type || !ASSETS[item.type] || typeof item.x !== "number" || typeof item.y !== "number") return null;
    const asset = ASSETS[item.type];
    parsed.push({
      id: typeof item.id === "string" ? item.id : `${item.type}-${crypto.randomUUID()}`,
      type: item.type,
      x: clamp(item.x, 0.015, 0.985),
      y: clamp(item.y, 0.04, 0.985),
      size: clamp(Number(item.size) || asset.sizeRange[0], 0.025, maxSizeForType(item.type)),
      rotation: clamp(Number(item.rotation) || 0, -180, 180),
      depth: clamp(Number(item.depth) || 0.5, 0, 1),
      speed: clamp(Number(item.speed) || 1, 0.1, 2),
      range: clamp(Number(item.range) || 0.1, 0.02, 0.3),
      flipped: Boolean(item.flipped),
      locked: Boolean(item.locked),
      phase: Number(item.phase) || 0,
    });
  }
  return parsed.length ? parsed : null;
}

function Icon({ name }: { name: "add" | "food" | "edit" | "pause" | "play" | "save" | "desktop" | "download" | "windows" | "apple" | "settings" | "hide" | "undo" | "redo" | "close" }) {
  const paths = {
    add: <><path d="M12 5v14M5 12h14" /></>,
    food: <><path d="M5 14c1.7 4 12.3 4 14 0" /><path d="M4 13h16" /><circle cx="8" cy="9" r="1" /><circle cx="12.5" cy="7" r="1" /><circle cx="16" cy="10" r="1" /></>,
    edit: <><path d="m5 19 3.5-.7L19 7.8 16.2 5 5.7 15.5 5 19Z" /><path d="m14.8 6.4 2.8 2.8" /></>,
    pause: <><path d="M9 6v12M15 6v12" /></>,
    play: <path d="m9 6 9 6-9 6V6Z" />,
    save: <><path d="M5 4h12l2 2v14H5V4Z" /><path d="M8 4v6h8V4M8 20v-6h8v6" /></>,
    desktop: <><rect x="3.5" y="4.5" width="17" height="12" rx="2" /><path d="M9 20h6M12 16.5V20" /><path d="m9.5 11 2.5 2.5 2.5-2.5M12 7.5v6" /></>,
    download: <><path d="M12 4v11" /><path d="m8 11 4 4 4-4" /><path d="M5 20h14" /></>,
    windows: <><path d="M4 5.5 10.5 4v7H4v-5.5ZM12 3.7 20 2v9h-8V3.7ZM4 12.5h6.5v7L4 18.5v-6ZM12 12.5h8v9l-8-1.7v-7.3Z" /></>,
    apple: <><path d="M16.7 12.6c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.5-.1-2.8.8-3.5.8-.7 0-1.8-.8-3-.8-1.5 0-3 .9-3.8 2.3-1.7 2.9-.4 7.2 1.2 9.5.8 1.1 1.7 2.4 2.9 2.3 1.2 0 1.6-.7 3.1-.7 1.4 0 1.9.7 3.1.7 1.3 0 2.1-1.1 2.9-2.3.9-1.3 1.3-2.6 1.3-2.7-.1 0-2.8-1.1-2.8-3.8Z" /><path d="M14.4 5.8c.6-.8 1.1-1.9 1-3-.9 0-2 .6-2.7 1.4-.6.7-1.1 1.8-1 2.9 1 0 2-.5 2.7-1.3Z" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" /></>,
    hide: <><path d="M3 12s3.3-5 9-5 9 5 9 5-3.3 5-9 5-9-5-9-5Z" /><path d="m4 4 16 16" /></>,
    undo: <><path d="m9 7-5 5 5 5" /><path d="M5 12h8a6 6 0 0 1 6 6" /></>,
    redo: <><path d="m15 7 5 5-5 5" /><path d="M19 12h-8a6 6 0 0 0-6 6" /></>,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>,
  } satisfies Record<string, React.ReactNode>;
  return <svg className="reef-icon" viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

function ToolButton({ label, icon, active, disabled, onClick }: { label: string; icon: Parameters<typeof Icon>[0]["name"]; active?: boolean; disabled?: boolean; onClick: () => void }) {
  return <button type="button" className={`reef-tool${active ? " is-active" : ""}`} onClick={onClick} disabled={disabled} aria-label={label} aria-pressed={active} data-label={label}><Icon name={icon} /><span>{label}</span></button>;
}

function createMaterial(texture: THREE.Texture, asset: ReefAsset, phase: number) {
  return new THREE.ShaderMaterial({
    vertexShader: FISH_VERTEX,
    fragmentShader: FISH_FRAGMENT,
    uniforms: {
      uMap: { value: texture },
      uTime: { value: 0 },
      uAmp: { value: 0.018 },
      uFreq: { value: 2.8 },
      uPhase: { value: phase },
      uTailStart: { value: asset.tailStart },
      uPlant: { value: asset.kind === "animal" ? 0 : 1 },
      uBehavior: { value: asset.id === "reefShark" ? 4 : asset.behavior === "whale" ? 5 : asset.behavior === "turtle" ? 2 : asset.behavior === "jellyfish" ? 3 : 0 },
      uTint: { value: new THREE.Color(1, 1, 1) },
      uOpacity: { value: 1 },
      uViewportFeather: { value: 1 },
      uDepth: { value: 1 },
      uResolution: { value: new THREE.Vector2(1, 1) },
    },
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

export function CoralReef() {
  const startsAsDesktopWallpaper = typeof window !== "undefined"
    && new URLSearchParams(window.location.search).get("mode") === "wallpaper";
  const desktopPlatform = typeof window !== "undefined"
    ? (window as Window & { reefDesktop?: { platform?: string } }).reefDesktop?.platform
    : undefined;
  const isWindowsWallpaper = desktopPlatform === "win32" && startsAsDesktopWallpaper;
  const [objects, setObjects] = useState<ReefObject[]>(() => defaultReef());
  const [editMode, setEditMode] = useState(false);
  const [paused, setPaused] = useState(false);
  const [uiHidden, setUiHidden] = useState(startsAsDesktopWallpaper);
  const [addOpen, setAddOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [desktopOpen, setDesktopOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [ccdEnabled, setCcdEnabled] = useState(true);
  const [ccdStrength, setCcdStrength] = useState(DEFAULT_CCD_STRENGTH);
  const ccdActive = ccdEnabled && ccdStrength > 0.001;
  const [globalAnimalScale, setGlobalAnimalScale] = useState(1);
  const [globalAnimalPopulation, setGlobalAnimalPopulation] = useState(DEFAULT_ANIMAL_POPULATION_SCALE);
  const [globalAnimalSpeed, setGlobalAnimalSpeed] = useState(DEFAULT_ANIMAL_SPEED_SCALE);
  const [addType, setAddType] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [bubbles, setBubbles] = useState<BubbleGroup[]>([]);
  const [waterTrails, setWaterTrails] = useState<WaterTrail[]>([]);
  const [feedingMode, setFeedingMode] = useState(false);
  const [foodDrops, setFoodDrops] = useState<FoodDrop[]>([]);
  const [bloodBlooms, setBloodBlooms] = useState<BloodBloom[]>([]);
  const [hint, setHint] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [historyTick, setHistoryTick] = useState(0);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installedApp, setInstalledApp] = useState(false);
  const [webglFallback, setWebglFallback] = useState(false);

  const rootRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const engineRef = useRef<ReefEngine | null>(null);
  const objectsRef = useRef(objects);
  const sceneObjects = useMemo(() => populationScene(objects, globalAnimalPopulation), [objects, globalAnimalPopulation]);
  const sceneObjectsRef = useRef(sceneObjects);
  const editRef = useRef(editMode);
  const pausedRef = useRef(paused);
  const selectedRef = useRef(selectedId);
  const reducedRef = useRef(false);
  const ccdEnabledRef = useRef(true);
  const ccdStrengthRef = useRef(DEFAULT_CCD_STRENGTH);
  const globalAnimalScaleRef = useRef(1);
  const globalAnimalSpeedRef = useRef(DEFAULT_ANIMAL_SPEED_SCALE);
  const foodDropsRef = useRef<FoodDrop[]>([]);
  const historyRef = useRef<ReefObject[][]>([]);
  const futureRef = useRef<ReefObject[][]>([]);
  const dragRef = useRef<{ id: string; snapshot: ReefObject[] } | null>(null);
  const viewGestureRef = useRef<{ pointerId: number; startX: number; startY: number; lastX: number; lastY: number; lastTrailAt: number; moved: boolean; hitId: string | null } | null>(null);
  const trailFleeRef = useRef(new Map<string, number>());

  const selected = useMemo(() => objects.find((object) => object.id === selectedId) ?? null, [objects, selectedId]);
  const visibleAnimalCount = useMemo(() => sceneObjects.filter((object) => ASSETS[object.type].kind === "animal").length, [sceneObjects]);

  useEffect(() => { objectsRef.current = objects; }, [objects]);
  useEffect(() => { sceneObjectsRef.current = sceneObjects; }, [sceneObjects]);
  useEffect(() => { editRef.current = editMode; }, [editMode]);
  useEffect(() => { pausedRef.current = paused; }, [paused]);
  useEffect(() => { selectedRef.current = selectedId; }, [selectedId]);
  useEffect(() => { reducedRef.current = reducedMotion; }, [reducedMotion]);
  useEffect(() => { foodDropsRef.current = foodDrops; }, [foodDrops]);
  useEffect(() => { ccdEnabledRef.current = ccdEnabled; }, [ccdEnabled]);
  useEffect(() => { ccdStrengthRef.current = ccdStrength; }, [ccdStrength]);
  useEffect(() => { globalAnimalScaleRef.current = globalAnimalScale; }, [globalAnimalScale]);
  useEffect(() => {
    const previous = globalAnimalSpeedRef.current;
    globalAnimalSpeedRef.current = globalAnimalSpeed;
    if (previous <= 0) return;
    const ratio = globalAnimalSpeed / previous;
    for (const runtime of engineRef.current?.runtimes.values() ?? []) runtime.velocity.multiplyScalar(ratio);
  }, [globalAnimalSpeed]);

  useEffect(() => {
    if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
      void navigator.serviceWorker.register("/sw.js");
    }
    const standalone = window.matchMedia("(display-mode: standalone)").matches
      || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    setInstalledApp(standalone);
    const captureInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const installed = () => {
      setInstalledApp(true);
      setInstallPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", captureInstallPrompt);
    window.addEventListener("appinstalled", installed);
    return () => {
      window.removeEventListener("beforeinstallprompt", captureInstallPrompt);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);

  useEffect(() => {
    const syncDesktopPause = (event: Event) => {
      setPaused(Boolean((event as CustomEvent<boolean>).detail));
    };
    window.addEventListener("reef:desktop-pause", syncDesktopPause);
    return () => window.removeEventListener("reef:desktop-pause", syncDesktopPause);
  }, []);

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast((current) => current === message ? "" : current), 2100);
  }, []);

  const checkpoint = useCallback((snapshot = objectsRef.current) => {
    historyRef.current.push(cloneObjects(snapshot));
    if (historyRef.current.length > 60) historyRef.current.shift();
    futureRef.current = [];
    setHistoryTick((tick) => tick + 1);
  }, []);

  const commit = useCallback((recipe: (current: ReefObject[]) => ReefObject[]) => {
    setObjects((current) => {
      checkpoint(current);
      return recipe(current);
    });
  }, [checkpoint]);

  const undo = useCallback(() => {
    const previous = historyRef.current.pop();
    if (!previous) return;
    futureRef.current.push(cloneObjects(objectsRef.current));
    setObjects(cloneObjects(previous));
    setSelectedId(null);
    setHistoryTick((tick) => tick + 1);
  }, []);

  const redo = useCallback(() => {
    const next = futureRef.current.pop();
    if (!next) return;
    historyRef.current.push(cloneObjects(objectsRef.current));
    setObjects(cloneObjects(next));
    setSelectedId(null);
    setHistoryTick((tick) => tick + 1);
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const restored = raw ? validateImport(JSON.parse(raw)) : null;
      if (restored) {
        const trimmed = trimDefaultPopulation(restored);
        const ambientWhale = defaultReef().find((object) => object.id === AMBIENT_WHALE_ID);
        const withoutAmbientWhales = trimmed.filter((object) => (
          object.type !== "humpbackWhale" || !object.id.includes("-default-")
        ));
        setObjects(ambientWhale ? [...withoutAmbientWhales, ambientWhale] : withoutAmbientWhales);
      }
      if (!localStorage.getItem(`${STORAGE_KEY}:hint`)) {
        setHint(true);
        localStorage.setItem(`${STORAGE_KEY}:hint`, "shown");
        window.setTimeout(() => setHint(false), 4300);
      }
    } catch { /* Keep the complete default reef. */ }
    try {
      const cameraRaw = localStorage.getItem(CCD_STORAGE_KEY);
      if (cameraRaw) {
        const camera = JSON.parse(cameraRaw) as { enabled?: unknown; strength?: unknown; animalScale?: unknown; animalPopulation?: unknown; animalSpeed?: unknown };
        if (typeof camera.enabled === "boolean") setCcdEnabled(camera.enabled);
        if (typeof camera.strength === "number" && Number.isFinite(camera.strength)) setCcdStrength(clamp(camera.strength, 0, 1));
        if (typeof camera.animalScale === "number" && Number.isFinite(camera.animalScale)) setGlobalAnimalScale(clamp(camera.animalScale, 0.5, 1.8));
        if (typeof camera.animalPopulation === "number" && Number.isFinite(camera.animalPopulation)) setGlobalAnimalPopulation(clamp(camera.animalPopulation, MIN_ANIMAL_POPULATION_SCALE, MAX_ANIMAL_POPULATION_SCALE));
        if (typeof camera.animalSpeed === "number" && Number.isFinite(camera.animalSpeed)) setGlobalAnimalSpeed(clamp(camera.animalSpeed, MIN_ANIMAL_SPEED_SCALE, MAX_ANIMAL_SPEED_SCALE));
      }
    } catch { /* Keep the reference CCD preset. */ }
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, objects })); } catch { /* Manual save reports errors. */ }
    }, 260);
    return () => window.clearTimeout(timer);
  }, [objects]);

  useEffect(() => {
    try { localStorage.setItem(CCD_STORAGE_KEY, JSON.stringify({ enabled: ccdEnabled, strength: ccdStrength, animalScale: globalAnimalScale, animalPopulation: globalAnimalPopulation, animalSpeed: globalAnimalSpeed })); } catch { /* Keep the current in-memory setting. */ }
    const engine = engineRef.current;
    if (!engine) return;
    const lowPower = (navigator.hardwareConcurrency || 8) <= 4;
    const ccdCap = isWindowsWallpaper ? 0.74 : lowPower ? 0.78 : 1.02 - ccdStrength * 0.22;
    const clearCap = isWindowsWallpaper ? 0.9 : 2;
    engine.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, ccdActive ? ccdCap : clearCap));
    engine.renderer.setSize(engine.width, engine.height, false);
  }, [ccdActive, ccdEnabled, ccdStrength, globalAnimalScale, globalAnimalPopulation, globalAnimalSpeed, isWindowsWallpaper]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const root = rootRef.current;
    if (!canvas || !root) return;
    let disposed = false;
    let frame = 0;
    let running = !document.hidden;
    let last = performance.now();
    let elapsed = 0;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: !isWindowsWallpaper,
        powerPreference: isWindowsWallpaper ? "high-performance" : "default",
        preserveDrawingBuffer: !isWindowsWallpaper,
      });
      setWebglFallback(false);
    } catch (error) {
      console.error("[reef] WebGL initialization failed; showing the static reef fallback.", error);
      setWebglFallback(true);
      notify("그래픽 가속을 사용할 수 없어 정적 바다로 표시해요");
      return;
    }
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(0, 1, 0, 1, -10, 10);
    camera.position.z = 5;
    const runtimes = new Map<string, Runtime>();
    const overlapDurations = new Map<string, number>();
    const textureCache = new Map<string, Promise<THREE.Texture>>();
    const animalGeometry = new THREE.PlaneGeometry(1, 1, 28, 10);
    const plantGeometry = new THREE.PlaneGeometry(1, 1, 12, 20);
    const loader = new THREE.TextureLoader();
    const drawingBufferSize = new THREE.Vector2();

    const engine: ReefEngine = { renderer, scene, camera, runtimes, textureCache, width: 1, height: 1, sync: () => undefined };
    engineRef.current = engine;

    const textureFor = (asset: ReefAsset) => {
      let promise = textureCache.get(asset.file);
      if (!promise) {
        promise = new Promise<THREE.Texture>((resolve, reject) => loader.load(asset.file, (texture) => {
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.minFilter = THREE.LinearMipmapLinearFilter;
          texture.magFilter = THREE.LinearFilter;
          texture.generateMipmaps = true;
          resolve(texture);
        }, undefined, reject));
        textureCache.set(asset.file, promise);
      }
      return promise;
    };

    const addRuntime = async (object: ReefObject) => {
      if (runtimes.has(object.id)) return;
      const asset = ASSETS[object.type];
      try {
        const [texture, maskBuffer] = await Promise.all([
          textureFor(asset),
          fetch(asset.mask).then((response) => response.ok ? response.arrayBuffer() : Promise.reject(new Error("mask"))).catch(() => null),
        ]);
        if (disposed || runtimes.has(object.id) || !sceneObjectsRef.current.some((item) => item.id === object.id)) return;
        const image = texture.image as { width: number; height: number };
        const material = createMaterial(texture, asset, object.phase);
        const mesh = new THREE.Mesh(asset.kind === "animal" ? animalGeometry : plantGeometry, material);
        mesh.renderOrder = Math.round(object.depth * 1000) + (asset.kind === "animal" ? 100 : 0);
        scene.add(mesh);
        const base = Math.min(engine.width, engine.height * 1.45);
        const speed = (asset.speedRange[0] + asset.speedRange[1]) * 0.5 * base * object.speed * globalAnimalSpeedRef.current;
        const face = object.flipped ? -1 : 1;
        const speciesTempo = asset.behavior === "whale" ? 0.38 : asset.behavior === "turtle" ? 0.52 : asset.id === "reefShark" ? 0.9 : asset.id === "bannerfish" ? 0.78 : asset.id === "blueTang" ? 0.9 : asset.id === "clownfish" ? 1.32 : asset.id === "yellowTang" ? 1.17 : asset.id === "silverTang" ? 1.1 : 1;
        runtimes.set(object.id, {
          mesh,
          position: new THREE.Vector2(object.x * engine.width, object.y * engine.height),
          velocity: new THREE.Vector2(speed * face, (seeded(object.phase * 1000, 21) - 0.5) * speed * 0.38),
          target: new THREE.Vector2(clamp(object.x + face * Math.max(0.06, object.range * 0.72), 0.04, 0.96), clamp(object.y + (seeded(object.phase * 700, 19) - 0.5) * 0.06, 0.1, 0.82)),
          targetTimer: 1.1 + seeded(object.phase * 900, 23) * 2.1,
          pauseTimer: 0,
          yaw: object.flipped ? -1 : 1,
          desiredYaw: object.flipped ? -1 : 1,
          turn: 0,
          turnSide: 1,
          turnStartFace: face as -1 | 1,
          travelDir: face as -1 | 1,
          verticalDir: -1,
          fleeVector: new THREE.Vector2(face, 0),
          swimRate: speciesTempo * (0.72 + seeded(object.phase * 1300, 95) * 0.72),
          swimPower: 0.72 + seeded(object.phase * 1700, 97) * 0.62,
          tempoScale: asset.id === "reefShark" || asset.behavior === "whale"
            ? 0.92 + seeded(object.phase * 1900, 131) * 0.16
            : 0.82 + seeded(object.phase * 1900, 131) * 0.36,
          moodSpeed: 0.9 + seeded(object.phase * 2100, 133) * 0.2,
          moodTarget: 0.9 + seeded(object.phase * 2100, 133) * 0.2,
          moodTimer: 1.4 + seeded(object.phase * 2300, 135) * 3.8,
          moodIndex: 0,
          aspect: image.width / image.height,
          width: 1,
          height: 1,
          phase: object.phase,
          flee: 0,
          eatenTimer: 0,
          respawnTimer: 0,
          huntCooldown: 0,
          mask: maskBuffer ? new Uint8Array(maskBuffer) : null,
        });
      } catch {
        notify(`${asset.name} 에셋을 불러오지 못했어요`);
      }
    };

    engine.sync = (nextObjects) => {
      const ids = new Set(nextObjects.map((object) => object.id));
      for (const [id, runtime] of runtimes) {
        if (!ids.has(id)) {
          scene.remove(runtime.mesh);
          runtime.mesh.material.dispose();
          runtimes.delete(id);
        }
      }
      nextObjects.forEach((object) => { void addRuntime(object); });
    };

    const resize = () => {
      const rect = root.getBoundingClientRect();
      const oldWidth = engine.width || rect.width;
      const oldHeight = engine.height || rect.height;
      engine.width = Math.max(1, rect.width);
      engine.height = Math.max(1, rect.height);
      const lowPower = (navigator.hardwareConcurrency || 8) <= 4;
      const currentStrength = ccdStrengthRef.current;
      const ccdCap = isWindowsWallpaper ? 0.74 : lowPower ? 0.78 : 1.02 - currentStrength * 0.22;
      const clearCap = isWindowsWallpaper ? 0.9 : 2;
      const currentCcdActive = ccdEnabledRef.current && currentStrength > 0.001;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, currentCcdActive ? ccdCap : clearCap));
      renderer.setSize(engine.width, engine.height, false);
      camera.left = 0; camera.right = engine.width; camera.top = engine.height; camera.bottom = 0;
      camera.updateProjectionMatrix();
      for (const runtime of runtimes.values()) {
        runtime.position.x *= engine.width / oldWidth;
        runtime.position.y *= engine.height / oldHeight;
      }
    };
    const observer = new ResizeObserver(resize);
    observer.observe(root);
    resize();
    engine.sync(sceneObjectsRef.current);

    const tick = (now: number) => {
      if (!running || disposed) return;
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      if (!pausedRef.current) elapsed += dt * (reducedRef.current ? 0.32 : 1);
      const current = sceneObjectsRef.current;
      const byId = new Map(current.map((object) => [object.id, object]));
      const minBase = Math.min(engine.width, engine.height * 1.45);
      const activeFood = [...foodDropsRef.current].reverse().find((drop) => now - drop.bornAt < 6500);
      renderer.getDrawingBufferSize(drawingBufferSize);

      for (const object of current) {
        const runtime = runtimes.get(object.id);
        if (!runtime) continue;
        const asset = ASSETS[object.type];
        const isAmbientWhale = object.id === AMBIENT_WHALE_ID;
        // Every unlocked animal is a through-swimmer, including animals added
        // by the user. They leave fully beyond the edge and re-enter from the
        // opposite off-screen side instead of turning against an invisible wall.
        const routeSwimmer = asset.kind === "animal" && !object.locked;
        const isSelected = editRef.current && selectedRef.current === object.id;
        const moving = asset.kind === "animal" && !object.locked && !isSelected && !pausedRef.current;
        const depthScale = 0.58 + object.depth * 0.56;
        // Large swimmers share the editor's size value without hidden caps.
        // Their asset-specific multipliers only compensate for transparent
        // padding in the source images, so every slider step remains visible.
        const effectiveSize = object.size;
        const nominal = minBase * effectiveSize * depthScale * (asset.kind === "animal" ? BASE_ANIMAL_VISUAL_SCALE * globalAnimalScaleRef.current : 1);
        runtime.width = isAmbientWhale
          ? engine.width * WHALE_SCREEN_WIDTH * globalAnimalScaleRef.current
          : asset.kind === "animal" ? nominal : nominal * runtime.aspect;
        runtime.height = asset.kind === "animal" ? nominal / runtime.aspect : nominal;
        if (isAmbientWhale) runtime.height = runtime.width / runtime.aspect;
        runtime.huntCooldown = Math.max(0, runtime.huntCooldown - dt);

        if (runtime.eatenTimer > 0) {
          runtime.eatenTimer += dt;
          runtime.respawnTimer -= dt;
          runtime.position.addScaledVector(runtime.velocity, dt * 0.34);
          runtime.mesh.position.set(runtime.position.x, engine.height - runtime.position.y, 0);
          runtime.mesh.material.uniforms.uTime.value = elapsed;
          runtime.mesh.material.uniforms.uOpacity.value = clamp(1 - runtime.eatenTimer / 0.32, 0, 1);
          runtime.mesh.visible = runtime.eatenTimer < 0.32;
          if (runtime.respawnTimer <= 0) {
            runtime.travelDir = seeded(now * 0.001 + runtime.phase, 117) > 0.5 ? 1 : -1;
            const offscreen = runtime.width * 0.8 + 54;
            runtime.position.set(runtime.travelDir > 0 ? -offscreen : engine.width + offscreen, (0.13 + seeded(now * 0.001 + runtime.phase, 119) * 0.66) * engine.height);
            runtime.velocity.set(runtime.travelDir * minBase * 0.04 * globalAnimalSpeedRef.current, 0);
            runtime.yaw = runtime.travelDir;
            runtime.desiredYaw = runtime.travelDir;
            runtime.eatenTimer = 0;
            runtime.mesh.material.uniforms.uOpacity.value = 1;
            runtime.mesh.visible = true;
          } else {
            continue;
          }
        } else {
          runtime.mesh.visible = true;
        }

        if (isAmbientWhale && runtime.respawnTimer > 0) {
          if (!pausedRef.current) runtime.respawnTimer -= dt;
          if (runtime.respawnTimer > 0) {
            runtime.mesh.visible = false;
            continue;
          }
          const offscreen = runtime.width * 0.7 + 44;
          runtime.position.set(runtime.travelDir > 0 ? -offscreen : engine.width + offscreen, (0.14 + seeded(now * 0.00019 + runtime.phase, 167) * 0.52) * engine.height);
          runtime.velocity.set(runtime.travelDir * engine.width / 18 * globalAnimalSpeedRef.current, 0);
          runtime.target.set(runtime.travelDir > 0 ? 1.18 : -0.18, runtime.position.y / engine.height);
          runtime.targetTimer = 8;
          runtime.mesh.visible = true;
        }

        if (moving) {
          const speedRange = asset.speedRange;
          const speedScale = globalAnimalSpeedRef.current;
          const baseCruise = (speedRange[0] + (speedRange[1] - speedRange[0]) * (0.35 + object.depth * 0.42)) * minBase * object.speed * speedScale;
          const heavySwimmer = asset.id === "reefShark" || asset.behavior === "whale";
          runtime.moodTimer -= dt;
          if (runtime.moodTimer <= 0) {
            runtime.moodIndex += 1;
            const mood = seeded(runtime.phase * 2900 + runtime.moodIndex * 17.3, 137);
            const moodDuration = seeded(runtime.phase * 3100 + runtime.moodIndex * 23.7, 139);
            runtime.moodTarget = heavySwimmer
              ? 0.88 + mood * 0.25
              : asset.behavior === "turtle" || asset.behavior === "jellyfish"
                ? 0.8 + mood * 0.34
                : 0.72 + mood * 0.68;
            runtime.moodTimer = heavySwimmer ? 5.2 + moodDuration * 6.4 : 2.8 + moodDuration * 5.6;
          }
          const moodEase = heavySwimmer
            ? (runtime.moodTarget > runtime.moodSpeed ? 0.42 : 0.3)
            : (runtime.moodTarget > runtime.moodSpeed ? 0.7 : 0.46);
          runtime.moodSpeed += (runtime.moodTarget - runtime.moodSpeed) * (1 - Math.exp(-dt * moodEase));
          const personalityCruise = baseCruise * runtime.tempoScale * runtime.moodSpeed;
          const cruise = asset.id === "reefShark" ? personalityCruise * 1.22 : isAmbientWhale ? Math.max(personalityCruise * 1.4, engine.width / 18 * speedScale) : asset.behavior === "whale" ? Math.max(personalityCruise * 1.4, minBase * 0.03 * object.speed * runtime.moodSpeed * speedScale) : personalityCruise;
          let seekingFood = false;

          if (asset.behavior === "jellyfish") {
            runtime.turn = 0;
            runtime.yaw = 1;
            runtime.desiredYaw = 1;
            const driftX = Math.sin(elapsed * 0.42 + runtime.phase) * cruise * 0.18;
            const buoyancy = 0.82 + Math.sin(elapsed * 0.88 + runtime.phase) * 0.09;
            if (!routeSwimmer) {
              const halfRange = Math.max(0.028, object.range * 0.45) * engine.height;
              const centerY = object.y * engine.height;
              if (runtime.position.y <= centerY - halfRange) runtime.verticalDir = 1;
              else if (runtime.position.y >= centerY + halfRange) runtime.verticalDir = -1;
            }
            const naturalVelocity = new THREE.Vector2(driftX, cruise * buoyancy * (routeSwimmer ? -1 : runtime.verticalDir));
            if (runtime.flee > 0.015) {
              const escapeSpeed = cruise * (2.35 + runtime.flee * 1.3);
              naturalVelocity.addScaledVector(runtime.fleeVector, escapeSpeed * runtime.flee);
            }
            runtime.velocity.lerp(naturalVelocity, Math.min(1, dt * (runtime.flee > 0.015 ? 5.2 : 2.4)));
            runtime.position.addScaledVector(runtime.velocity, dt);
            if (routeSwimmer && runtime.position.y < -runtime.height * 1.35) {
              runtime.position.set((0.08 + seeded(now * 0.00021 + runtime.phase, 101) * 0.84) * engine.width, engine.height + runtime.height * 1.35);
              runtime.velocity.set(0, -cruise * 0.7);
              runtime.flee = 0;
            }
            runtime.flee *= Math.exp(-dt * 1.45);
          } else {
          runtime.targetTimer -= dt;
          runtime.pauseTimer = Math.max(0, runtime.pauseTimer - dt);
          if (runtime.targetTimer <= 0) {
            const radius = Math.max(0.035, object.range);
            const forwardAngle = runtime.travelDir < 0 ? Math.PI : 0;
            const angle = forwardAngle + (seeded(now * 0.0001 + runtime.phase, 31) - 0.5) * 1.55;
            const distance = radius * (0.35 + seeded(now * 0.00013 + runtime.phase, 33) * 0.65);
            runtime.target.set(
              routeSwimmer ? (runtime.travelDir < 0 ? -0.18 : 1.18) : clamp(object.x + runtime.travelDir * distance, 0.035, 0.965),
              routeSwimmer ? clamp(runtime.position.y / engine.height + Math.sin(angle) * 0.1, 0.09, 0.82) : clamp(object.y + Math.sin(angle) * distance * 0.62, 0.09, 0.84),
            );
            runtime.targetTimer = 1.8 + seeded(now * 0.00017 + runtime.phase, 35) * 4.2;
            if (seeded(now * 0.00021 + runtime.phase, 37) > 0.91) runtime.pauseTimer = 0.16 + seeded(runtime.phase, 39) * 0.34;
          }

          const targetPx = new THREE.Vector2(runtime.target.x * engine.width, runtime.target.y * engine.height);
          const desired = targetPx.sub(runtime.position);
          if (desired.lengthSq() > 1) desired.normalize();
          desired.multiplyScalar(runtime.pauseTimer > 0 ? cruise * 0.18 : cruise);
          const steer = desired.clone().sub(runtime.velocity).clampLength(0, minBase * (asset.behavior === "turtle" ? 0.025 : 0.095));

          const margin = Math.max(38, Math.min(engine.width, engine.height) * 0.08);
          if (runtime.position.y < margin) steer.y += (margin - runtime.position.y) * 0.62;
          if (runtime.position.y > engine.height * 0.84) steer.y -= (runtime.position.y - engine.height * 0.84) * 0.72;

          if (asset.behavior === "school") {
            const alignment = new THREE.Vector2();
            const cohesion = new THREE.Vector2();
            const separation = new THREE.Vector2();
            let neighbors = 0;
            for (const other of current) {
              if (other.id === object.id || other.type !== object.type) continue;
              const otherRuntime = runtimes.get(other.id);
              if (!otherRuntime) continue;
              const offset = runtime.position.clone().sub(otherRuntime.position);
              const distance = offset.length();
              if (distance < minBase * 0.16) {
                neighbors += 1;
                alignment.add(otherRuntime.velocity);
                cohesion.add(otherRuntime.position);
                if (distance < minBase * 0.065 && distance > 0.1) separation.add(offset.multiplyScalar(1 / distance));
              }
            }
            if (neighbors) {
              alignment.multiplyScalar(1 / neighbors).sub(runtime.velocity).multiplyScalar(0.025);
              cohesion.multiplyScalar(1 / neighbors).sub(runtime.position).multiplyScalar(0.018);
              if (routeSwimmer) {
                alignment.x *= 0.12;
                cohesion.x *= 0.08;
                separation.x *= 0.28;
              }
              steer.add(alignment).add(cohesion).add(separation.multiplyScalar(3.2));
            }
          }

          // Only some nearby small fish notice the shark. They use the same
          // broad U-turn as every other direction change, then sprint away.
          if (!SMALL_FISH_EXCLUSIONS.has(asset.id) && runtime.turn === 0 && runtime.flee < 0.08) {
            const awarenessWindow = Math.floor(now / 1800);
            if (seeded(runtime.phase + awarenessWindow, 153) > 0.48) {
              for (const sharkObject of current) {
                if (sharkObject.type !== "reefShark") continue;
                const shark = runtimes.get(sharkObject.id);
                if (!shark || shark.eatenTimer > 0) continue;
                const escape = runtime.position.clone().sub(shark.position);
                const sharkDistance = escape.length();
                const noticeRadius = minBase * 0.2;
                if (sharkDistance <= 1 || sharkDistance >= noticeRadius) continue;
                escape.normalize();
                const escapeFace = (escape.x < 0 ? -1 : 1) as -1 | 1;
                if (escapeFace !== runtime.travelDir && Math.abs(escape.x) > 0.22) {
                  runtime.turn = 0.001;
                  runtime.turnStartFace = runtime.travelDir;
                  runtime.desiredYaw = escapeFace;
                  runtime.turnSide = (escape.y >= 0 ? 1 : -1) as -1 | 1;
                }
                runtime.fleeVector.copy(escape);
                runtime.flee = 0.46 + (1 - sharkDistance / noticeRadius) * 0.24;
                break;
              }
            }
          }

          if (activeFood && !SMALL_FISH_EXCLUSIONS.has(asset.id)) {
            const foodPosition = new THREE.Vector2(activeFood.x * engine.width, activeFood.y * engine.height);
            const toFood = foodPosition.sub(runtime.position);
            const foodDistance = toFood.length();
            if (foodDistance < minBase * 0.92 && foodDistance > 0.5) {
              seekingFood = true;
              const foodFace = (toFood.x < 0 ? -1 : 1) as -1 | 1;
              if (foodFace !== runtime.travelDir && runtime.turn === 0 && Math.abs(toFood.x) > 28) {
                runtime.turn = 0.001;
                runtime.turnStartFace = runtime.travelDir;
                runtime.desiredYaw = foodFace;
                runtime.turnSide = runtime.position.y < foodPosition.y ? 1 : -1;
              }
              if (runtime.turn === 0) {
                const toward = toFood.normalize();
                const gatherRadius = Math.max(24, minBase * 0.045);
                if (foodDistance < gatherRadius) {
                  toward.set(-toward.y * runtime.travelDir, toward.x * runtime.travelDir).multiplyScalar(cruise * 0.42);
                } else {
                  toward.multiplyScalar(cruise * 1.18);
                }
                steer.add(toward.sub(runtime.velocity).clampLength(0, minBase * 0.14));
                runtime.targetTimer = Math.min(runtime.targetTimer, 0.65);
              }
            }
          }

          if (!routeSwimmer && runtime.turn === 0) {
            const radiusPx = Math.max(34, object.range * minBase);
            const centerX = object.x * engine.width;
            const reachedEnd = runtime.travelDir > 0 ? runtime.position.x >= centerX + radiusPx : runtime.position.x <= centerX - radiusPx;
            const reachedWall = runtime.travelDir > 0 ? runtime.position.x >= engine.width - margin : runtime.position.x <= margin;
            if (reachedEnd || reachedWall) {
              runtime.turn = 0.001;
              runtime.turnStartFace = runtime.travelDir;
              runtime.desiredYaw = (runtime.travelDir * -1) as -1 | 1;
              runtime.turnSide = runtime.position.y < engine.height * 0.3 ? 1 : runtime.position.y > engine.height * 0.68 ? -1 : (seeded(now * 0.00041 + runtime.phase, 103) > 0.5 ? 1 : -1);
            }
          }

          runtime.velocity.addScaledVector(steer, dt);
          const speedLimit = cruise * 1.28 * (1 + runtime.flee * 2.3);
          if (runtime.velocity.length() > speedLimit) runtime.velocity.setLength(speedLimit);
          if (runtime.pauseTimer <= 0 && runtime.velocity.length() < cruise * 0.52) runtime.velocity.lerp(desired.setLength(cruise * 0.72), Math.min(1, dt * 1.8));
          if (routeSwimmer && !seekingFood && runtime.pauseTimer <= 0 && runtime.turn === 0) {
            runtime.velocity.x = runtime.travelDir * Math.max(Math.abs(runtime.velocity.x), cruise * 0.48);
            runtime.desiredYaw = runtime.travelDir;
          }

          if (runtime.turn > 0) {
            // A direction change is a real U-shaped swim path, not a sprite spin.
            // Giving every placed animal the same wide arc also keeps freshly added
            // fish from snapping around at the edge of their activity range.
            const heavySwimmer = asset.id === "reefShark" || asset.behavior === "turtle" || asset.behavior === "whale";
            const turnDuration = (heavySwimmer ? 3.05 : 2.45) / Math.sqrt(speedScale);
            runtime.turn = Math.min(1, runtime.turn + dt / turnDuration);
            const eased = runtime.turn * runtime.turn * (3 - 2 * runtime.turn);
            const startAngle = runtime.turnStartFace > 0 ? 0 : Math.PI;
            const heading = startAngle + runtime.turnSide * Math.PI * eased;
            const turnRadius = clamp(Math.max(minBase * 0.075, runtime.height * 0.56), minBase * 0.075, minBase * 0.14);
            const arcSpeed = Math.PI * turnRadius / turnDuration;
            const turnSpeed = Math.max(cruise * (heavySwimmer ? 1.32 : 1.48), arcSpeed);
            runtime.velocity.set(Math.cos(heading) * turnSpeed, Math.sin(heading) * turnSpeed);
            if (runtime.turn >= 0.5) runtime.yaw = runtime.desiredYaw;
            if (runtime.turn >= 1) {
              runtime.travelDir = runtime.desiredYaw as -1 | 1;
              runtime.yaw = runtime.travelDir;
              runtime.turn = 0;
              runtime.targetTimer = 0;
            }
          } else if (!routeSwimmer && runtime.pauseTimer <= 0) {
            runtime.velocity.x = runtime.travelDir * Math.max(Math.abs(runtime.velocity.x), cruise * 0.38);
          }
          if (runtime.flee > 0.015 && runtime.turn === 0) {
            const escapeSpeed = cruise * (asset.id === "reefShark" || asset.behavior === "turtle" || asset.behavior === "whale" ? 2.15 : 2.85);
            const escapeVelocity = runtime.fleeVector.clone().multiplyScalar(escapeSpeed * (0.64 + runtime.flee * 0.36));
            runtime.velocity.lerp(escapeVelocity, Math.min(1, dt * (asset.id === "reefShark" ? 4.2 : 6.4)));
            if (Math.abs(runtime.velocity.x) > cruise * 0.18) runtime.desiredYaw = runtime.velocity.x < 0 ? -1 : 1;
          }
          runtime.position.addScaledVector(runtime.velocity, dt);
          runtime.flee *= Math.exp(-dt * (asset.id === "reefShark" || asset.behavior === "turtle" || asset.behavior === "whale" ? 1.35 : 1.8));

          if (routeSwimmer) {
            const offscreen = runtime.width * 0.7 + 44;
            if (runtime.travelDir > 0 && runtime.position.x > engine.width + offscreen) {
              if (isAmbientWhale) {
                runtime.respawnTimer = WHALE_PASS_GAP_SECONDS;
                runtime.mesh.visible = false;
              } else runtime.position.set(-offscreen, (0.1 + seeded(now * 0.00023 + runtime.phase, 81) * 0.68) * engine.height);
              runtime.velocity.x = Math.abs(runtime.velocity.x);
              runtime.target.set(1.18, clamp(runtime.position.y / engine.height + (seeded(now * 0.00029 + runtime.phase, 83) - 0.5) * 0.18, 0.1, 0.82));
              runtime.targetTimer = 4 + seeded(now * 0.00031 + runtime.phase, 85) * 4;
            } else if (runtime.travelDir < 0 && runtime.position.x < -offscreen) {
              if (isAmbientWhale) {
                runtime.respawnTimer = WHALE_PASS_GAP_SECONDS;
                runtime.mesh.visible = false;
              } else runtime.position.set(engine.width + offscreen, (0.1 + seeded(now * 0.00027 + runtime.phase, 87) * 0.68) * engine.height);
              runtime.velocity.x = -Math.abs(runtime.velocity.x);
              runtime.target.set(-0.18, clamp(runtime.position.y / engine.height + (seeded(now * 0.00033 + runtime.phase, 89) - 0.5) * 0.18, 0.1, 0.82));
              runtime.targetTimer = 4 + seeded(now * 0.00037 + runtime.phase, 91) * 4;
            }
          }
          }
        } else if (object.locked || isSelected) {
          runtime.position.set(object.x * engine.width, object.y * engine.height);
        }

        const visualSpeed = runtime.velocity.length() / Math.max(1, minBase);
        const fleeBoost = runtime.flee;
        const material = runtime.mesh.material;
        material.uniforms.uTime.value = elapsed;
        material.uniforms.uAmp.value = asset.kind === "animal"
          ? (asset.id === "reefShark" ? 0.055 + fleeBoost * 0.025 : asset.behavior === "whale" ? 0.036 + fleeBoost * 0.014 : asset.behavior === "turtle" ? 0.04 : asset.behavior === "jellyfish" ? 0.058 : 0.011 + visualSpeed * 0.22 + fleeBoost * 0.035) * runtime.swimPower
          : (asset.behavior === "bottom" ? 0.018 : 0.01);
        const movementTempo = asset.kind === "animal" ? 0.5 + globalAnimalSpeedRef.current * 0.5 : 1;
        material.uniforms.uFreq.value = (asset.id === "reefShark" ? 4.4 + fleeBoost * 1.55 : asset.behavior === "whale" ? 1.12 + fleeBoost * 0.42 : asset.behavior === "turtle" ? 1.55 : asset.behavior === "jellyfish" ? 2.05 + fleeBoost * 0.65 : 2.1 + visualSpeed * 42 + fleeBoost * 3.2) * runtime.swimRate * movementTempo;
        material.uniforms.uTint.value.setRGB(0.66 + object.depth * 0.34, 0.82 + object.depth * 0.18, 1);
        let sceneOpacity = 1;
        if (asset.kind === "animal" && !isAmbientWhale) {
          // Do not expose a hard rectangular cut when a swimmer enters or exits
          // through open water. Fade the whole animal over the outer slice of
          // its own body instead of discarding pixels with an approximate reef.
          const featherX = Math.max(24, runtime.width * 0.85);
          const featherY = Math.max(18, runtime.height * 0.78);
          const leftVisibility = clamp((runtime.position.x + runtime.width * 0.5) / featherX, 0, 1);
          const rightVisibility = clamp((engine.width + runtime.width * 0.5 - runtime.position.x) / featherX, 0, 1);
          const topVisibility = clamp((runtime.position.y + runtime.height * 0.5) / featherY, 0, 1);
          const bottomVisibility = clamp((engine.height + runtime.height * 0.5 - runtime.position.y) / featherY, 0, 1);
          sceneOpacity = Math.min(leftVisibility, rightVisibility, topVisibility, bottomVisibility);
          sceneOpacity = sceneOpacity * sceneOpacity * (3 - 2 * sceneOpacity);
        }
        material.uniforms.uOpacity.value = sceneOpacity;
        material.uniforms.uViewportFeather.value = isAmbientWhale ? 0 : 1;
        material.uniforms.uDepth.value = object.depth;
        material.uniforms.uResolution.value.copy(drawingBufferSize);
        // Keep saved/pointer coordinates in screen space (top = 0), but render in
        // Three's upright Y-up camera so transparent photo assets never turn upside down.
        runtime.mesh.position.set(runtime.position.x, engine.height - runtime.position.y, 0);
        runtime.mesh.rotation.y = 0;
        const bank = asset.kind === "animal" && runtime.turn === 0 ? clamp(-runtime.velocity.y / Math.max(25, runtime.velocity.length()) * 0.18, -0.17, 0.17) : 0;
        // Never rotate the photo around the screen's Z axis during a U-turn.
        // The turn is communicated entirely by the broad semicircular trajectory.
        runtime.mesh.rotation.z = asset.behavior === "jellyfish" ? Math.PI * 0.5 + Math.sin(elapsed * 0.38 + runtime.phase) * 0.018 : THREE.MathUtils.degToRad(object.rotation) + bank + Math.sin(elapsed * 0.7 + runtime.phase) * (asset.kind === "animal" ? 0.008 : 0);
        let pulseX = 1;
        let pulseY = 1;
        if (asset.behavior === "jellyfish") {
          const jellyPulse = Math.sin(elapsed * 1.08 * runtime.swimRate + runtime.phase);
          pulseX = 1 + jellyPulse * 0.018;
          pulseY = 1 - jellyPulse * 0.032;
        }
        if (asset.behavior === "turtle") { pulseY = 1 + Math.sin(elapsed * 1.25 + runtime.phase) * 0.012; }
        const faceScale = asset.kind === "animal" ? (asset.behavior === "jellyfish" ? 1 : runtime.yaw < 0 ? -1 : 1) : (object.flipped ? -1 : 1);
        runtime.mesh.scale.set(runtime.width * pulseX * faceScale, runtime.height * pulseY, 1);
        runtime.mesh.renderOrder = Math.round(object.depth * 1000) + (asset.kind === "animal" ? 100 : 0);
      }

      if (!pausedRef.current) {
        const sharks = current.filter((object) => object.type === "reefShark");
        const prey = current.filter((object) => ASSETS[object.type].kind === "animal" && !SMALL_FISH_EXCLUSIONS.has(object.type));
        for (const sharkObject of sharks) {
          const shark = runtimes.get(sharkObject.id);
          if (!shark || shark.eatenTimer > 0 || shark.huntCooldown > 0) continue;
          const sharkFace = shark.yaw < 0 ? -1 : 1;
          const headX = shark.position.x + sharkFace * shark.width * 0.37;
          const headY = shark.position.y;
          for (const preyObject of prey) {
            const fish = runtimes.get(preyObject.id);
            if (!fish || fish.eatenTimer > 0) continue;
            // Judge predation by the rendered size, which already includes the
            // fish's depth, individual size, and the global animal scale. A
            // fish that reads as foreground because it is larger than the
            // shark stays alive even when their sprites overlap.
            const sharkVisualSize = Math.sqrt(Math.max(1, shark.width * shark.height));
            const fishVisualSize = Math.sqrt(Math.max(1, fish.width * fish.height));
            if (fishVisualSize > sharkVisualSize * 1.08) continue;
            const headRadiusX = shark.width * 0.14 + fish.width * 0.1;
            const headRadiusY = shark.height * 0.27 + fish.height * 0.1;
            const dx = (fish.position.x - headX) / Math.max(1, headRadiusX);
            const dy = (fish.position.y - headY) / Math.max(1, headRadiusY);
            if (dx * dx + dy * dy < 1) {
              fish.eatenTimer = 0.001;
              fish.respawnTimer = 6.5 + seeded(now * 0.001 + fish.phase, 123) * 3.5;
              fish.velocity.lerp(shark.velocity, 0.45);
              shark.huntCooldown = 1.35;
              // Eating never stops or turns the shark: keep its nose moving
              // forward and damp only the incidental vertical wobble.
              shark.velocity.x = shark.travelDir * Math.max(Math.abs(shark.velocity.x), minBase * 0.026 * globalAnimalSpeedRef.current);
              shark.velocity.y *= 0.55;
              shark.targetTimer = Math.max(shark.targetTimer, 2.4);
              const bloom: BloodBloom = { id: crypto.randomUUID(), x: fish.position.x / engine.width, y: fish.position.y / engine.height, seed: Math.random() * 100 };
              setBloodBlooms((blooms) => [...blooms, bloom]);
              window.setTimeout(() => setBloodBlooms((blooms) => blooms.filter((item) => item.id !== bloom.id)), 4200);
              break;
            }
          }
        }

        // Let swimmers cross briefly, but prevent pairs from travelling as one
        // stacked silhouette. After a short overlap they choose opposite lanes
        // and receive a soft, size-aware separation push. Locked or selected
        // animals keep their exact editor placement while the other one yields.
        const swimmers = current.filter((object) => ASSETS[object.type].kind === "animal");
        const activeOverlapKeys = new Set<string>();
        for (let i = 0; i < swimmers.length; i += 1) {
          const objectA = swimmers[i];
          const runtimeA = runtimes.get(objectA.id);
          if (!runtimeA || runtimeA.eatenTimer > 0) continue;
          for (let j = i + 1; j < swimmers.length; j += 1) {
            const objectB = swimmers[j];
            const runtimeB = runtimes.get(objectB.id);
            if (!runtimeB || runtimeB.eatenTimer > 0 || Math.abs(objectA.depth - objectB.depth) > 0.36) continue;

            const safeX = clamp((runtimeA.width + runtimeB.width) * 0.34, minBase * 0.026, minBase * 0.135);
            const safeY = clamp((runtimeA.height + runtimeB.height) * 0.38, minBase * 0.022, minBase * 0.09);
            const dx = runtimeA.position.x - runtimeB.position.x;
            const dy = runtimeA.position.y - runtimeB.position.y;
            const ellipticalDistance = Math.hypot(dx / Math.max(1, safeX), dy / Math.max(1, safeY));
            if (ellipticalDistance >= 1) continue;

            const overlapKey = objectA.id < objectB.id ? `${objectA.id}:${objectB.id}` : `${objectB.id}:${objectA.id}`;
            activeOverlapKeys.add(overlapKey);
            const previousDuration = overlapDurations.get(overlapKey) ?? 0;
            const overlapDuration = previousDuration + dt;
            overlapDurations.set(overlapKey, overlapDuration);
            if (overlapDuration < 0.22) continue;

            const laneSign = seeded(objectA.phase + objectB.phase * 1.73, 211) > 0.5 ? 1 : -1;
            const awayA = new THREE.Vector2(dx / Math.max(1, safeX), dy / Math.max(1, safeY));
            if (awayA.lengthSq() < 0.015) awayA.set(0, laneSign);
            else awayA.normalize();
            if (Math.abs(awayA.y) < 0.48) awayA.y += laneSign * (0.48 - Math.abs(awayA.y));
            awayA.normalize();

            const movableA = !objectA.locked && !(editRef.current && selectedRef.current === objectA.id);
            const movableB = !objectB.locked && !(editRef.current && selectedRef.current === objectB.id);
            if (!movableA && !movableB) continue;
            const areaA = Math.max(1, runtimeA.width * runtimeA.height);
            const areaB = Math.max(1, runtimeB.width * runtimeB.height);
            const totalArea = areaA + areaB;
            const shareA = movableA ? (movableB ? areaB / totalArea : 1) : 0;
            const shareB = movableB ? (movableA ? areaA / totalArea : 1) : 0;
            const strength = clamp((overlapDuration - 0.22) / 0.72, 0, 1) * (1 - ellipticalDistance);
            const separationAcceleration = minBase * 0.16 * strength;
            const positionCorrection = minBase * 0.009 * strength * Math.min(1, dt * 9);

            if (shareA > 0) {
              runtimeA.velocity.addScaledVector(awayA, separationAcceleration * dt * shareA);
              runtimeA.position.addScaledVector(awayA, positionCorrection * shareA);
            }
            if (shareB > 0) {
              runtimeB.velocity.addScaledVector(awayA, -separationAcceleration * dt * shareB);
              runtimeB.position.addScaledVector(awayA, -positionCorrection * shareB);
            }

            if (previousDuration < 0.46 && overlapDuration >= 0.46) {
              const laneOffset = clamp(safeY / engine.height * 0.82, 0.025, 0.085);
              if (shareA > 0) {
                runtimeA.target.y = clamp(runtimeA.position.y / engine.height + laneSign * laneOffset, 0.09, 0.84);
                runtimeA.targetTimer = Math.max(runtimeA.targetTimer, 1.15);
              }
              if (shareB > 0) {
                runtimeB.target.y = clamp(runtimeB.position.y / engine.height - laneSign * laneOffset, 0.09, 0.84);
                runtimeB.targetTimer = Math.max(runtimeB.targetTimer, 1.15);
              }
            }
          }
        }
        for (const key of overlapDurations.keys()) {
          if (!activeOverlapKeys.has(key)) overlapDurations.delete(key);
        }
      }

      for (const [id, runtime] of runtimes) if (!byId.has(id)) runtime.mesh.visible = false;
      try {
        renderer.render(scene, camera);
      } catch (error) {
        console.error("[reef] WebGL rendering failed; showing the static reef fallback.", error);
        running = false;
        setWebglFallback(true);
        notify("그래픽 가속을 사용할 수 없어 정적 바다로 표시해요");
        return;
      }
      frame = requestAnimationFrame(tick);
    };

    const visibility = () => {
      running = !document.hidden;
      if (running) { last = performance.now(); frame = requestAnimationFrame(tick); }
      else cancelAnimationFrame(frame);
    };
    document.addEventListener("visibilitychange", visibility);
    frame = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      running = false;
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", visibility);
      observer.disconnect();
      for (const runtime of runtimes.values()) runtime.mesh.material.dispose();
      for (const promise of textureCache.values()) void promise.then((texture) => texture.dispose());
      animalGeometry.dispose(); plantGeometry.dispose(); renderer.dispose();
      engineRef.current = null;
    };
  }, [isWindowsWallpaper, notify]);

  useEffect(() => { engineRef.current?.sync(sceneObjects); }, [sceneObjects]);

  const addObject = useCallback((type: string, x: number, y: number) => {
    const asset = ASSETS[type];
    if (!asset) return;
    const object: ReefObject = {
      id: `${type}-${crypto.randomUUID()}`,
      type,
      x: clamp(x, 0.03, 0.97), y: clamp(y, 0.06, 0.97),
      size: type === "humpbackWhale"
        ? (ASSETS.reefShark.sizeRange[0] + ASSETS.reefShark.sizeRange[1]) * 0.5
        : (asset.sizeRange[0] + asset.sizeRange[1]) * 0.5,
      rotation: 0,
      depth: (asset.depthRange[0] + asset.depthRange[1]) * 0.5,
      speed: 1, range: asset.kind === "animal" ? 0.11 : 0,
      flipped: false, locked: asset.kind !== "animal", phase: Math.random() * TAU,
    };
    commit((current) => [...current, object]);
    setSelectedId(object.id); setEditMode(true); setAddType(null); setAddOpen(false);
    notify(`${asset.name}을(를) 놓았어요`);
  }, [commit, notify]);

  const hitAt = useCallback((x: number, y: number, touch: boolean) => {
    const engine = engineRef.current;
    if (!engine) return null;
    const ordered = [...sceneObjectsRef.current]
      .filter((object) => !editRef.current || !object.id.startsWith(POPULATION_AUTO_ID_PREFIX))
      .sort((a, b) => b.depth - a.depth);
    for (const object of ordered) {
      const runtime = engine.runtimes.get(object.id);
      if (!runtime) continue;
      const dx = x - runtime.position.x;
      const dy = y - runtime.position.y;
      const angle = -(runtime.mesh.rotation.z || 0);
      const localX = dx * Math.cos(angle) - dy * Math.sin(angle);
      const localY = dx * Math.sin(angle) + dy * Math.cos(angle);
      const yawWidth = 1;
      const pad = touch ? 7 : 1;
      let u = localX / (runtime.width * yawWidth + pad * 2) + 0.5;
      const v = 0.5 - localY / (runtime.height + pad * 2);
      if (u < -0.04 || u > 1.04 || v < -0.04 || v > 1.04) continue;
      if (runtime.yaw < 0) u = 1 - u;
      if (!runtime.mask) return object;
      const mx = clamp(Math.round(u * 63), 0, 63);
      const my = clamp(Math.round(v * 63), 0, 63);
      const maskPad = touch ? 2 : ASSETS[object.type].kind === "animal" ? 1 : 0;
      const alphaThreshold = ASSETS[object.type].kind === "animal" ? 28 : 100;
      let solid = false;
      for (let oy = -maskPad; oy <= maskPad && !solid; oy += 1) for (let ox = -maskPad; ox <= maskPad; ox += 1) {
        const px = clamp(mx + ox, 0, 63); const py = clamp(my + oy, 0, 63);
        if (runtime.mask[py * 64 + px] > alphaThreshold) { solid = true; break; }
      }
      if (solid) return object;
    }
    return null;
  }, []);

  const makeBubbles = useCallback((x: number, y: number) => {
    const id = crypto.randomUUID();
    setBubbles((current) => [...current, { id, x, y, count: 7 + Math.floor(Math.random() * 7), seed: Math.random() * 100 }]);
    window.setTimeout(() => setBubbles((current) => current.filter((group) => group.id !== id)), 2900);
  }, []);

  const installMobileApp = useCallback(async () => {
    if (installedApp) {
      notify("이미 휴대폰 앱으로 설치되어 있어요");
      return;
    }
    if (installPrompt) {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === "accepted") notify("홈 화면에 산호초 바다를 설치했어요");
      setInstallPrompt(null);
      return;
    }
    const isiPhone = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    notify(isiPhone ? "Safari 공유 버튼 → 홈 화면에 추가를 눌러주세요" : "브라우저 메뉴 → 앱 설치를 눌러주세요");
  }, [installPrompt, installedApp, notify]);

  const dropFood = useCallback((x: number, y: number) => {
    const drop: FoodDrop = {
      id: crypto.randomUUID(),
      x: clamp(x, 0.03, 0.97),
      y: clamp(y, 0.06, 0.9),
      bornAt: performance.now(),
      seed: Math.random() * 100,
    };
    setFoodDrops((current) => [...current.slice(-2), drop]);
    setFeedingMode(false);
    window.setTimeout(() => setFoodDrops((current) => current.filter((item) => item.id !== drop.id)), 7000);
    notify("먹이를 놓았어요");
  }, [notify]);

  const startFlee = useCallback((target: ReefObject, x: number, y: number) => {
    const engine = engineRef.current;
    if (!engine) return;
    const source = engine.runtimes.get(target.id);
    if (!source) return;
    const asset = ASSETS[target.type];
    const away = source.position.clone().sub(new THREE.Vector2(x, y));
    if (away.lengthSq() < 1) away.set(source.velocity.x < 0 ? -1 : 1, -0.15);
    away.normalize();
    const base = Math.min(engine.width, engine.height * 1.45);
    const forward = asset.behavior === "jellyfish"
      ? new THREE.Vector2(clamp(away.x, -0.28, 0.28), -1).normalize()
      : new THREE.Vector2(source.travelDir, clamp(source.velocity.y / Math.max(base * 0.08, 1), -0.14, 0.14)).normalize();
    source.fleeVector.copy(forward);
    const weight = asset.behavior === "turtle" || asset.behavior === "whale" || target.type === "reefShark" ? 0.16 : 0.28;
    source.velocity.add(forward.clone().multiplyScalar(base * weight));
    source.flee = 1;
  }, []);

  const stirWater = useCallback((fromX: number, fromY: number, toX: number, toY: number) => {
    const engine = engineRef.current;
    if (!engine) return;
    const dx = toX - fromX;
    const dy = toY - fromY;
    const length = Math.hypot(dx, dy);
    if (length < 5) return;

    const id = crypto.randomUUID();
    const trail: WaterTrail = {
      id,
      x: ((fromX + toX) * 0.5 / engine.width) * 100,
      y: ((fromY + toY) * 0.5 / engine.height) * 100,
      length: Math.min(92, length + 18),
      angle: Math.atan2(dy, dx) * 180 / Math.PI,
      seed: Math.random(),
    };
    setWaterTrails((current) => [...current.slice(-31), trail]);
    window.setTimeout(() => setWaterTrails((current) => current.filter((item) => item.id !== id)), 920);

    const segmentLengthSq = Math.max(1, dx * dx + dy * dy);
    const minBase = Math.min(engine.width, engine.height * 1.45);
    const radius = Math.max(54, minBase * 0.14);
    const now = performance.now();
    const nearby = sceneObjectsRef.current.flatMap((object) => {
      if (object.locked || ASSETS[object.type].kind !== "animal") return [];
      const runtime = engine.runtimes.get(object.id);
      if (!runtime || !runtime.mesh.visible || runtime.eatenTimer > 0) return [];
      const projection = clamp(((runtime.position.x - fromX) * dx + (runtime.position.y - fromY) * dy) / segmentLengthSq, 0, 1);
      const closestX = fromX + dx * projection;
      const closestY = fromY + dy * projection;
      const distance = Math.hypot(runtime.position.x - closestX, runtime.position.y - closestY);
      const depthRadius = radius * (0.72 + object.depth * 0.34);
      return distance < depthRadius ? [{ object, closestX, closestY, distance }] : [];
    }).sort((a, b) => a.distance - b.distance).slice(0, 5);

    for (const { object, closestX, closestY } of nearby) {
      const lastFlee = trailFleeRef.current.get(object.id) ?? 0;
      if (now - lastFlee < 230) continue;
      trailFleeRef.current.set(object.id, now);
      startFlee(object, closestX, closestY);
    }
  }, [startFlee]);

  const pointerPosition = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top, nx: (event.clientX - rect.left) / rect.width, ny: (event.clientY - rect.top) / rect.height };
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const point = pointerPosition(event);
    if (feedingMode) { dropFood(point.nx, point.ny); return; }
    if (addType) { addObject(addType, point.nx, point.ny); return; }
    const hit = hitAt(point.x, point.y, event.pointerType === "touch");
    if (editMode) {
      if (!hit) { setSelectedId(null); return; }
      const caught = engineRef.current?.runtimes.get(hit.id);
      if (caught && engineRef.current) {
        const caughtX = clamp(caught.position.x / engineRef.current.width, 0.02, 0.98);
        const caughtY = clamp(caught.position.y / engineRef.current.height, 0.04, 0.98);
        setObjects((current) => current.map((object) => object.id === hit.id ? { ...object, x: caughtX, y: caughtY } : object));
      }
      setSelectedId(hit.id);
      dragRef.current = { id: hit.id, snapshot: cloneObjects(objectsRef.current) };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    viewGestureRef.current = {
      pointerId: event.pointerId,
      startX: point.x,
      startY: point.y,
      lastX: point.x,
      lastY: point.y,
      lastTrailAt: performance.now(),
      moved: false,
      hitId: hit?.id ?? null,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    const point = pointerPosition(event);
    if (drag) {
      setObjects((current) => current.map((object) => object.id === drag.id ? { ...object, x: clamp(point.nx, 0.02, 0.98), y: clamp(point.ny, 0.04, 0.98) } : object));
      return;
    }
    const gesture = viewGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId || editRef.current) return;
    const totalDistance = Math.hypot(point.x - gesture.startX, point.y - gesture.startY);
    const stepDistance = Math.hypot(point.x - gesture.lastX, point.y - gesture.lastY);
    const now = performance.now();
    if (totalDistance < 8 || stepDistance < 10 || now - gesture.lastTrailAt < 24) return;
    gesture.moved = true;
    stirWater(gesture.lastX, gesture.lastY, point.x, point.y);
    gesture.lastX = point.x;
    gesture.lastY = point.y;
    gesture.lastTrailAt = now;
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLCanvasElement>, cancelled = false) => {
    const drag = dragRef.current;
    if (drag) {
      historyRef.current.push(drag.snapshot);
      futureRef.current = [];
      setHistoryTick((tick) => tick + 1);
      dragRef.current = null;
      return;
    }
    const gesture = viewGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    viewGestureRef.current = null;
    if (cancelled || gesture.moved) return;
    const point = pointerPosition(event);
    const hit = gesture.hitId ? sceneObjectsRef.current.find((object) => object.id === gesture.hitId) ?? null : hitAt(point.x, point.y, event.pointerType === "touch");
    if (hit && ASSETS[hit.type].kind === "animal") startFlee(hit, point.x, point.y);
    else makeBubbles(point.nx * 100, point.ny * 100);
  };

  const updateSelected = useCallback((patch: Partial<ReefObject>, saveHistory = true) => {
    if (!selectedRef.current) return;
    if (saveHistory) checkpoint();
    setObjects((current) => current.map((object) => object.id === selectedRef.current ? { ...object, ...patch } : object));
  }, [checkpoint]);

  const duplicateSelected = () => {
    if (!selected) return;
    const copy = { ...selected, id: `${selected.type}-${crypto.randomUUID()}`, x: clamp(selected.x + 0.035, 0.03, 0.97), y: clamp(selected.y + 0.025, 0.05, 0.97), phase: Math.random() * TAU };
    commit((current) => [...current, copy]); setSelectedId(copy.id);
  };

  const deleteSelected = useCallback(() => {
    const id = selectedRef.current;
    if (!id) return;
    commit((current) => current.filter((object) => object.id !== id)); setSelectedId(null);
  }, [commit]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!editRef.current || !selectedRef.current || ["INPUT", "BUTTON"].includes((event.target as HTMLElement).tagName)) return;
      if (event.key === "Escape") { setSelectedId(null); return; }
      if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); deleteSelected(); return; }
      const delta = event.shiftKey ? 0.015 : 0.004;
      const move: Partial<ReefObject> = {};
      const current = objectsRef.current.find((object) => object.id === selectedRef.current);
      if (!current) return;
      if (event.key === "ArrowLeft") move.x = clamp(current.x - delta, 0.02, 0.98);
      else if (event.key === "ArrowRight") move.x = clamp(current.x + delta, 0.02, 0.98);
      else if (event.key === "ArrowUp") move.y = clamp(current.y - delta, 0.04, 0.98);
      else if (event.key === "ArrowDown") move.y = clamp(current.y + delta, 0.04, 0.98);
      else return;
      event.preventDefault(); updateSelected(move, !event.repeat);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deleteSelected, updateSelected]);

  const downloadJson = () => {
    const blob = new Blob([JSON.stringify({ version: 2, objects, settings: { animalPopulation: globalAnimalPopulation, animalSpeed: globalAnimalSpeed } }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `나의-산호초-${new Date().toISOString().slice(0, 10)}.json`; anchor.click(); URL.revokeObjectURL(url);
    notify("구성 파일을 저장했어요");
  };

  const loadJson = async (file: File) => {
    try {
      const imported = JSON.parse(await file.text()) as { settings?: { animalPopulation?: unknown; animalSpeed?: unknown } };
      const parsed = validateImport(imported);
      if (!parsed) throw new Error("invalid");
      checkpoint();
      setObjects(parsed);
      if (typeof imported.settings?.animalPopulation === "number" && Number.isFinite(imported.settings.animalPopulation)) {
        setGlobalAnimalPopulation(clamp(imported.settings.animalPopulation, MIN_ANIMAL_POPULATION_SCALE, MAX_ANIMAL_POPULATION_SCALE));
      }
      if (typeof imported.settings?.animalSpeed === "number" && Number.isFinite(imported.settings.animalSpeed)) {
        setGlobalAnimalSpeed(clamp(imported.settings.animalSpeed, MIN_ANIMAL_SPEED_SCALE, MAX_ANIMAL_SPEED_SCALE));
      }
      setSelectedId(null); notify("구성을 불러왔어요");
    } catch { notify("올바른 산호초 구성 파일이 아니에요"); }
  };

  const exportImage = async () => {
    const engine = engineRef.current;
    if (!engine) return;
    try {
      const width = Math.round(engine.width * Math.min(window.devicePixelRatio || 1, 1.5));
      const height = Math.round(engine.height * Math.min(window.devicePixelRatio || 1, 1.5));
      const raw = document.createElement("canvas"); raw.width = width; raw.height = height;
      const rawContext = raw.getContext("2d", { willReadFrequently: true }); if (!rawContext) throw new Error("canvas");
      const src = engine.width / engine.height > 0.82 ? "/reef/assets/bg/reef-desktop.png" : "/reef/assets/bg/reef-mobile.png";
      const image = new Image(); image.src = src; await image.decode();
      const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
      const dw = image.naturalWidth * scale; const dh = image.naturalHeight * scale;
      rawContext.filter = "brightness(1.04) saturate(1.08) contrast(1.02)";
      rawContext.drawImage(image, (width - dw) / 2, (height - dh) / 2, dw, dh);
      rawContext.filter = "none";
      rawContext.drawImage(engine.renderer.domElement, 0, 0, width, height);

      // DOM bubbles are redrawn before processing so the saved scene passes
      // through the same virtual camera as the WebGL animals and background.
      const sx = width / engine.width; const sy = height / engine.height;
      for (const group of bubbles) {
        for (let index = 0; index < group.count; index += 1) {
          const random = seeded(group.seed + index, 71);
          const radius = (2.5 + seeded(group.seed + index, 73) * 5) * Math.min(sx, sy);
          const bx = (group.x + (random - 0.5) * 1.4) * width / 100;
          const by = (group.y + (seeded(group.seed + index, 79) - 0.5) * 1.2) * height / 100;
          rawContext.beginPath(); rawContext.arc(bx, by, radius, 0, TAU);
          rawContext.strokeStyle = "rgba(222,250,255,.7)"; rawContext.lineWidth = Math.max(1, radius * 0.18); rawContext.stroke();
        }
      }

      const output = document.createElement("canvas"); output.width = width; output.height = height;
      const context = output.getContext("2d", { willReadFrequently: true }); if (!context) throw new Error("canvas");
      if (ccdActive) {
        const reduced = document.createElement("canvas");
        const downscale = 0.86 - ccdStrength * 0.18;
        reduced.width = Math.max(1, Math.round(width * downscale)); reduced.height = Math.max(1, Math.round(height * downscale));
        const reducedContext = reduced.getContext("2d"); if (!reducedContext) throw new Error("canvas");
        reducedContext.imageSmoothingEnabled = true; reducedContext.imageSmoothingQuality = "low";
        reducedContext.drawImage(raw, 0, 0, reduced.width, reduced.height);
        context.imageSmoothingEnabled = true; context.imageSmoothingQuality = "medium";
        context.filter = `brightness(${1.012 + ccdStrength * 0.026}) contrast(${1.015 + ccdStrength * 0.07}) saturate(${1.035 + ccdStrength * 0.13})`;
        context.drawImage(reduced, 0, 0, width, height);
        context.filter = "none";

        const pixels = context.getImageData(0, 0, width, height);
        const source = new Uint8ClampedArray(pixels.data);
        const shift = Math.max(1, Math.round(ccdStrength * Math.min(window.devicePixelRatio || 1, 1.5)));
        const quantize = 1.4 + ccdStrength * 2.8;
        let noiseSeed = 0x6d2b79f5;
        for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
          const index = (y * width + x) * 4;
          const redIndex = (y * width + Math.min(width - 1, x + shift)) * 4;
          const blueIndex = (y * width + Math.max(0, x - shift)) * 4;
          noiseSeed ^= noiseSeed << 13; noiseSeed ^= noiseSeed >>> 17; noiseSeed ^= noiseSeed << 5;
          const luma = source[index] * 0.21 + source[index + 1] * 0.72 + source[index + 2] * 0.07;
          const noise = (((noiseSeed >>> 0) / 4294967296) - 0.5) * (1.2 + ccdStrength * 5.2) * (0.28 + (1 - luma / 255) * 0.72);
          pixels.data[index] = Math.round((source[redIndex] + noise * 1.12) / quantize) * quantize;
          pixels.data[index + 1] = Math.round((source[index + 1] + noise * 0.36) / quantize) * quantize;
          pixels.data[index + 2] = Math.round((source[blueIndex + 2] - noise * 0.42) / quantize) * quantize;
        }
        context.putImageData(pixels, 0, 0);

        context.globalCompositeOperation = "screen";
        const bloom = context.createRadialGradient(width * 0.36, -height * 0.04, 0, width * 0.36, height * 0.03, Math.max(width, height) * 0.56);
        bloom.addColorStop(0, `rgba(235,255,255,${0.18 + ccdStrength * 0.18})`);
        bloom.addColorStop(0.32, `rgba(190,247,255,${0.08 + ccdStrength * 0.07})`);
        bloom.addColorStop(1, "rgba(190,247,255,0)");
        context.fillStyle = bloom; context.fillRect(0, 0, width, height);
        context.globalCompositeOperation = "source-over";
        const vignette = context.createRadialGradient(width * 0.5, height * 0.43, Math.min(width, height) * 0.25, width * 0.5, height * 0.46, Math.max(width, height) * 0.72);
        vignette.addColorStop(0, "rgba(0,0,0,0)"); vignette.addColorStop(0.72, "rgba(0,12,35,0)"); vignette.addColorStop(1, `rgba(0,13,32,${0.08 + ccdStrength * 0.12})`);
        context.fillStyle = vignette; context.fillRect(0, 0, width, height);
      } else {
        context.drawImage(raw, 0, 0);
      }
      const anchor = document.createElement("a"); anchor.href = output.toDataURL("image/png"); anchor.download = `나의-산호초-${new Date().toISOString().slice(0, 10)}.png`; anchor.click();
      notify(`UI 없이 ${ccdActive ? "CCD 효과가 적용된 " : "선명한 "}바다 이미지를 저장했어요`);
    } catch { notify("이미지 저장에 실패했어요"); }
  };

  const reset = () => {
    if (!window.confirm("배치를 기본 산호초로 되돌릴까요?")) return;
    checkpoint(); setObjects(defaultReef()); setSelectedId(null); notify("기본 산호초로 돌아왔어요");
  };

  const onDrop = (event: DragEvent<HTMLElement>) => {
    const type = event.dataTransfer.getData("application/x-reef-asset");
    if (!ASSETS[type]) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    addObject(type, (event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height);
  };

  const chromaShift = ccdActive ? 0.18 + ccdStrength * 0.72 : 0;
  const sharpenEdge = ccdActive ? 0.018 + ccdStrength * 0.024 : 0;
  const sharpenKernel = `0 ${-sharpenEdge} 0 ${-sharpenEdge} ${1 + sharpenEdge * 4} ${-sharpenEdge} 0 ${-sharpenEdge} 0`;
  const ccdStyle = {
    "--ccd-softness": ccdActive ? `${0.08 + ccdStrength * 0.2}px` : "0px",
    "--ccd-brightness": ccdActive ? `${1.01 + ccdStrength * 0.025}` : "1",
    "--ccd-contrast": ccdActive ? `${1.012 + ccdStrength * 0.065}` : "1",
    "--ccd-saturation": ccdActive ? `${1.035 + ccdStrength * 0.14}` : "1",
    "--ccd-noise-opacity": ccdActive ? `${0.025 + ccdStrength * 0.045}` : "0",
    "--ccd-block-opacity": ccdActive ? `${0.012 + ccdStrength * 0.022}` : "0",
    "--ccd-bloom-opacity": ccdActive ? `${0.46 + ccdStrength * 0.32}` : "0",
    "--ccd-vignette-opacity": ccdActive ? `${0.46 + ccdStrength * 0.38}` : "0",
  } as CSSProperties;
  const selectedVisualScale = selected && ASSETS[selected.type].kind === "animal"
    ? BASE_ANIMAL_VISUAL_SCALE * globalAnimalScale
    : 1;

  return (
    <main ref={rootRef} style={ccdStyle} className={`coral-reef${editMode ? " is-editing" : ""}${paused ? " is-paused" : ""}${uiHidden ? " is-ui-hidden" : ""}${ccdActive ? " is-ccd" : ""}${webglFallback ? " is-webgl-fallback" : ""}`} onDragOver={(event) => event.preventDefault()} onDrop={onDrop}>
      <svg className="reef-filter-defs" width="0" height="0" aria-hidden="true" focusable="false">
        <defs>
          <filter id="reef-ccd-filter" x="-2%" y="-2%" width="104%" height="104%" colorInterpolationFilters="sRGB">
            <feColorMatrix in="SourceGraphic" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="redChannel" />
            <feOffset in="redChannel" dx={chromaShift} result="redShift" />
            <feColorMatrix in="SourceGraphic" values="0 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0" result="cyanChannel" />
            <feOffset in="cyanChannel" dx={-chromaShift} result="cyanShift" />
            <feBlend in="redShift" in2="cyanShift" mode="screen" result="chromatic" />
            <feConvolveMatrix in="chromatic" order="3" kernelMatrix={sharpenKernel} divisor="1" edgeMode="duplicate" preserveAlpha="true" />
          </filter>
        </defs>
      </svg>
      <div className="reef-scene-stage">
      <picture className="reef-background" aria-hidden="true">
        <source media="(max-aspect-ratio: 4/5)" srcSet="/reef/assets/bg/reef-mobile.png" />
        <img src="/reef/assets/bg/reef-desktop.png" alt="" />
      </picture>
      <div className="reef-caustics" aria-hidden="true"><i /><i /><i /></div>
      <div className="reef-plankton" aria-hidden="true">{Array.from({ length: 18 }, (_, index) => <i key={index} style={{ "--i": index } as CSSProperties} />)}</div>
      <canvas ref={canvasRef} className="reef-webgl" aria-label="헤엄치는 산호초 바다" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={(event) => onPointerUp(event, true)} />
      <div className="reef-ccd-overlay" aria-hidden="true"><i className="ccd-bloom" /><i className="ccd-noise" /><i className="ccd-blocks" /><i className="ccd-vignette" /></div>

      <div className="reef-water-trails" aria-hidden="true">
        {waterTrails.map((trail) => <i key={trail.id} style={{
          "--x": `${trail.x}%`,
          "--y": `${trail.y}%`,
          "--length": `${trail.length}px`,
          "--angle": `${trail.angle}deg`,
          "--drift": `${(trail.seed - 0.5) * 8}px`,
        } as CSSProperties} />)}
      </div>

      <div className="reef-bubbles" aria-hidden="true">
        {bubbles.flatMap((group) => Array.from({ length: group.count }, (_, index) => {
          const random = seeded(group.seed + index, 71);
          return <i key={`${group.id}-${index}`} style={{ "--x": `${group.x + (random - 0.5) * 1.4}%`, "--y": `${group.y + (seeded(group.seed + index, 79) - 0.5) * 1.2}%`, "--offset": `${(random - 0.5) * 58}px`, "--size": `${5 + seeded(group.seed + index, 73) * 10}px`, "--duration": `${1.65 + seeded(group.seed + index, 77) * 0.9}s` } as CSSProperties} />;
        }))}
      </div>

      <div className="reef-food-cloud" aria-hidden="true">
        {foodDrops.flatMap((drop) => Array.from({ length: 18 }, (_, index) => {
          const side = seeded(drop.seed + index, 131) - 0.5;
          return <i key={`${drop.id}-${index}`} style={{
            "--x": `${drop.x * 100 + side * 2.3}%`,
            "--y": `${drop.y * 100 + (seeded(drop.seed + index, 133) - 0.5) * 1.8}%`,
            "--dx": `${side * 54}px`,
            "--dy": `${38 + seeded(drop.seed + index, 137) * 72}px`,
            "--size": `${2.2 + seeded(drop.seed + index, 139) * 3.6}px`,
            "--delay": `${seeded(drop.seed + index, 141) * 0.7}s`,
          } as CSSProperties} />;
        }))}
      </div>

      <div className="reef-blood-cloud" aria-hidden="true">
        {bloodBlooms.map((bloom) => {
          const filterId = `pigment-current-${bloom.id}`;
          const gradientId = `pigment-gradient-${bloom.id}`;
          return <svg key={bloom.id} className="reef-blood-plume" viewBox="0 0 140 180" style={{
            "--x": `${bloom.x * 100}%`,
            "--y": `${bloom.y * 100}%`,
            "--plume-size": `${44 + seeded(bloom.seed, 149) * 10}px`,
            "--drift": `${(seeded(bloom.seed, 151) - 0.5) * 14}px`,
            "--tilt": `${(seeded(bloom.seed, 157) - 0.5) * 4}deg`,
          } as CSSProperties}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="1" x2="0" y2="0">
                <stop offset="0" stopColor="#641526" stopOpacity=".92" />
                <stop offset=".46" stopColor="#b93849" stopOpacity=".68" />
                <stop offset="1" stopColor="#dc716f" stopOpacity=".04" />
              </linearGradient>
              <filter id={filterId} x="-45%" y="-12%" width="190%" height="125%" colorInterpolationFilters="sRGB">
                <feTurbulence type="fractalNoise" baseFrequency=".014 .038" numOctaves="2" seed={Math.round(seeded(bloom.seed, 163) * 90) + 1} result="currentNoise" />
                <feDisplacementMap in="SourceGraphic" in2="currentNoise" scale="7" xChannelSelector="R" yChannelSelector="B" />
                <feGaussianBlur stdDeviation=".28" />
              </filter>
            </defs>
            <path className="plume-single-wisp" filter={`url(#${filterId})`} style={{ fill: `url(#${gradientId})` }} d="M68 176 C63 160 74 147 67 130 C60 113 72 99 65 83 C59 68 69 55 63 42 C58 30 65 19 61 7 L67 6 C72 20 66 32 72 44 C79 58 69 70 75 84 C83 101 71 114 78 131 C86 149 73 161 75 176 Z" />
          </svg>;
        })}
      </div>
      </div>

      {selected && editMode && <div className={`reef-selection ${ASSETS[selected.type].kind}`} aria-hidden="true" style={{ left: `${selected.x * 100}%`, top: `${selected.y * 100}%`, "--selection-size": `${selected.size * 145 * selectedVisualScale}vmin` } as CSSProperties}><i /></div>}

      {!uiHidden && <>
        <nav className="reef-toolbar" aria-label="바다 도구" data-reef-ui>
          <ToolButton label="추가" icon="add" active={addOpen || Boolean(addType)} onClick={() => { setAddOpen((open) => !open); setSaveOpen(false); setDesktopOpen(false); setSettingsOpen(false); setFeedingMode(false); }} />
          <ToolButton label="먹이" icon="food" active={feedingMode} onClick={() => { setFeedingMode((mode) => !mode); setEditMode(false); setSelectedId(null); setAddType(null); setAddOpen(false); setSaveOpen(false); setDesktopOpen(false); setSettingsOpen(false); }} />
          <ToolButton label={editMode ? "감상" : "편집"} icon="edit" active={editMode} onClick={() => { setEditMode((mode) => !mode); setSelectedId(null); setAddType(null); setFeedingMode(false); setDesktopOpen(false); setSettingsOpen(false); }} />
          <ToolButton label={paused ? "재생" : "멈춤"} icon={paused ? "play" : "pause"} active={paused} onClick={() => setPaused((value) => !value)} />
          <ToolButton label="저장" icon="save" active={saveOpen} onClick={() => { setSaveOpen((open) => !open); setAddOpen(false); setDesktopOpen(false); setSettingsOpen(false); setFeedingMode(false); }} />
          <ToolButton label="바탕화면" icon="desktop" active={desktopOpen} onClick={() => { setDesktopOpen((open) => !open); setAddOpen(false); setSaveOpen(false); setSettingsOpen(false); setFeedingMode(false); }} />
          <ToolButton label="화질 설정" icon="settings" active={settingsOpen} onClick={() => { setSettingsOpen((open) => !open); setAddOpen(false); setSaveOpen(false); setDesktopOpen(false); setFeedingMode(false); }} />
          <ToolButton label="숨기기" icon="hide" onClick={() => { setUiHidden(true); setAddOpen(false); setSaveOpen(false); setDesktopOpen(false); setSettingsOpen(false); setAddType(null); setFeedingMode(false); }} />
        </nav>
        <div className="reef-history" data-reef-ui>
          <ToolButton label="실행 취소" icon="undo" onClick={undo} disabled={!historyRef.current.length} />
          <ToolButton label="다시 실행" icon="redo" onClick={redo} disabled={!futureRef.current.length} />
          <span aria-hidden="true">{historyTick}</span>
        </div>

        {addOpen && <aside className="reef-panel reef-assets" data-reef-ui>
          <header><div><small>ADD TO REEF</small><strong>바다 친구 추가</strong></div><button type="button" onClick={() => setAddOpen(false)} aria-label="추가 패널 닫기"><Icon name="close" /></button></header>
          <div className="reef-asset-grid">
            {MANIFEST.map((asset) => <button key={asset.id} type="button" draggable onDragStart={(event) => event.dataTransfer.setData("application/x-reef-asset", asset.id)} onClick={() => { setAddType(asset.id); setAddOpen(false); }} className={addType === asset.id ? "is-selected" : ""}>
              <span><img src={asset.file} alt="" /></span><b>{asset.name}</b>
            </button>)}
          </div>
          <p>탭한 뒤 바다에 놓거나, 데스크톱에서는 바로 끌어 놓을 수 있어요.</p>
        </aside>}

        {saveOpen && <aside className="reef-panel reef-save" data-reef-ui>
          <button type="button" onClick={() => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, objects })); notify("현재 배치를 저장했어요"); } catch { notify("저장하지 못했어요"); } }}>현재 배치 저장 <small>브라우저</small></button>
          <button type="button" onClick={() => void installMobileApp()}>{installedApp ? "휴대폰 앱 설치됨" : "휴대폰 앱 설치"} <small>iPhone · Android</small></button>
          <button type="button" onClick={() => void exportImage()}>바다 이미지 저장 <small>PNG · UI 제외</small></button>
          <button type="button" onClick={downloadJson}>구성 내보내기 <small>JSON</small></button>
          <button type="button" onClick={() => fileRef.current?.click()}>구성 불러오기 <small>JSON</small></button>
          <button type="button" className="danger" onClick={reset}>기본 산호초로 초기화</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void loadJson(file); event.currentTarget.value = ""; }} />
        </aside>}

        {desktopOpen && <aside className="reef-panel reef-desktop-download" data-reef-ui aria-label="바탕화면 앱 다운로드">
          <header><div><small>LIVE WALLPAPER</small><strong>움직이는 바탕화면</strong></div><button type="button" onClick={() => setDesktopOpen(false)} aria-label="바탕화면 다운로드 닫기"><Icon name="close" /></button></header>
          <p>Windows 10·11용 최신 파일 하나만 제공해요.</p>
          <div className="reef-download-options">
            <a href={WINDOWS_WALLPAPER_DOWNLOAD_URL} target="_blank" rel="noreferrer" aria-label="Windows 산호초 바탕화면 다운로드">
              <span className="reef-download-os"><Icon name="windows" /></span>
              <span><b>Windows 다운로드</b><small>10 · 11 x64</small></span>
              <span className="reef-download-arrow"><Icon name="download" /></span>
            </a>
          </div>
          <div className="reef-windows-install-guide" aria-label="Windows 실행 방법">
            <strong>실행 방법</strong>
            <ol>
              <li>받은 <b>EXE 파일</b> 더블클릭</li>
              <li>Windows 경고가 뜨면 <b>추가 정보 → 실행</b></li>
              <li>편집 후 <b>바탕화면으로 돌아가기</b> 누르기</li>
            </ol>
          </div>
          <div className="reef-download-shortcuts" aria-label="바탕화면 앱 단축키">
            <strong>설치 후 단축키</strong>
            <span><kbd>Ctrl / ⌘</kbd><b>+</b><kbd>Shift</kbd><b>+</b><kbd>E</kbd><small>편집 열기 · 바탕화면 복귀</small></span>
            <span><kbd>Ctrl / ⌘</kbd><b>+</b><kbd>Shift</kbd><b>+</b><kbd>Space</kbd><small>움직임 멈춤 · 재생</small></span>
          </div>
          <small className="reef-download-note">설치 후 단축키로 바다 편집 화면을 언제든 다시 열 수 있어요.</small>
        </aside>}

        {settingsOpen && <aside className="reef-panel reef-camera-settings" data-reef-ui aria-label="카메라 화질 설정">
          <header><div><small>CAMERA LOOK</small><strong>CCD 디카 화질</strong></div><button type="button" onClick={() => setSettingsOpen(false)} aria-label="화질 설정 닫기"><Icon name="close" /></button></header>
          <label className="reef-camera-toggle">
            <span><b>효과 사용</b><small>원본 에셋은 그대로 유지돼요</small></span>
            <input type="checkbox" checked={ccdEnabled} onChange={(event) => setCcdEnabled(event.target.checked)} />
          </label>
          <label className={`reef-camera-strength${ccdEnabled ? "" : " is-disabled"}`}>
            <span><b>강도</b><output>{Math.round(ccdStrength * 100)}%</output></span>
            <input aria-label="CCD 효과 강도" type="range" min="0" max="1" step="0.01" value={ccdStrength} disabled={!ccdEnabled} onChange={(event) => setCcdStrength(Number(event.target.value))} />
          </label>
          <label className="reef-camera-strength reef-camera-size">
            <span><b>전체 생물 크기</b><output>{Math.round(globalAnimalScale * 100)}%</output></span>
            <input aria-label="전체 생물 크기" type="range" min="0.5" max="1.8" step="0.01" value={globalAnimalScale} onChange={(event) => setGlobalAnimalScale(Number(event.target.value))} />
          </label>
          <label className="reef-camera-strength reef-camera-population">
            <span><b>전체 생물 수</b><output>{Math.round(globalAnimalPopulation * 100)}% · {visibleAnimalCount}마리</output></span>
            <input aria-label="전체 생물 수" type="range" min={MIN_ANIMAL_POPULATION_SCALE} max={MAX_ANIMAL_POPULATION_SCALE} step="0.05" value={globalAnimalPopulation} onChange={(event) => setGlobalAnimalPopulation(Number(event.target.value))} />
          </label>
          <label className="reef-camera-strength reef-camera-speed">
            <span><b>전체 물고기 속도</b><output>{Math.round(globalAnimalSpeed * 100)}%</output></span>
            <input aria-label="전체 물고기 속도" type="range" min={MIN_ANIMAL_SPEED_SCALE} max={MAX_ANIMAL_SPEED_SCALE} step="0.05" value={globalAnimalSpeed} onChange={(event) => setGlobalAnimalSpeed(Number(event.target.value))} />
          </label>
          <p>CCD 효과는 색을 유지한 채 화질만 바꾸고, 크기·생물 수·유영 속도는 즉시 전체 바다에 반영돼요.</p>
        </aside>}

        {selected && editMode && <aside className="reef-panel reef-inspector" data-reef-ui>
          <header><img src={ASSETS[selected.type].file} alt="" /><div><small>선택됨</small><strong>{ASSETS[selected.type].name}</strong></div><button type="button" onClick={() => setSelectedId(null)} aria-label="선택 해제"><Icon name="close" /></button></header>
          <div className="reef-sliders">
            <label><span>크기</span><input aria-label={`${ASSETS[selected.type].name} 크기`} type="range" min="0.025" max={maxSizeForType(selected.type)} step="0.005" value={selected.size} onPointerDown={() => checkpoint()} onChange={(event) => updateSelected({ size: Number(event.target.value) }, false)} /></label>
            <label><span>깊이</span><input type="range" min="0" max="1" step="0.02" value={selected.depth} onPointerDown={() => checkpoint()} onChange={(event) => updateSelected({ depth: Number(event.target.value) }, false)} /></label>
            {ASSETS[selected.type].kind === "animal" && <>
              <label><span>속도</span><input type="range" min="0.1" max="2" step="0.05" value={selected.speed} onPointerDown={() => checkpoint()} onChange={(event) => updateSelected({ speed: Number(event.target.value) }, false)} /></label>
              <label><span>활동 범위</span><input type="range" min="0.02" max="0.3" step="0.01" value={selected.range} onPointerDown={() => checkpoint()} onChange={(event) => updateSelected({ range: Number(event.target.value) }, false)} /></label>
            </>}
            {ASSETS[selected.type].kind !== "animal" && <label><span>회전</span><input type="range" min="-35" max="35" step="1" value={selected.rotation} onPointerDown={() => checkpoint()} onChange={(event) => updateSelected({ rotation: Number(event.target.value) }, false)} /></label>}
          </div>
          <div className="reef-actions">
            <button type="button" onClick={() => {
              const runtime = engineRef.current?.runtimes.get(selected.id);
              if (runtime && ASSETS[selected.type].kind === "animal") {
                const nextFace = (runtime.travelDir * -1) as -1 | 1;
                if (ASSETS[selected.type].behavior === "jellyfish") {
                  runtime.travelDir = nextFace;
                  runtime.yaw = nextFace;
                  runtime.desiredYaw = nextFace;
                  runtime.velocity.x = nextFace * Math.abs(runtime.velocity.x || 1);
                  runtime.targetTimer = 0;
                } else {
                  runtime.turnStartFace = runtime.travelDir;
                  runtime.desiredYaw = nextFace;
                  runtime.turnSide = runtime.position.y < (engineRef.current?.height ?? 1) * 0.42 ? 1 : -1;
                  runtime.turn = 0.001;
                }
              }
              updateSelected({ flipped: !selected.flipped });
            }}>좌우 반전</button>
            <button type="button" onClick={() => updateSelected({ depth: clamp(selected.depth - 0.12, 0, 1) })}>뒤로</button>
            <button type="button" onClick={() => updateSelected({ depth: clamp(selected.depth + 0.12, 0, 1) })}>앞으로</button>
            <button type="button" onClick={() => updateSelected({ locked: !selected.locked })}>{selected.locked ? "고정 해제" : "배치 고정"}</button>
            <button type="button" onClick={duplicateSelected}>복제</button>
            <button type="button" className="danger" onClick={deleteSelected}>삭제</button>
          </div>
        </aside>}

        {hint && <div className="reef-hint" data-reef-ui>빈 물은 거품 · 물고기는 앞으로 휙 · 물을 드래그하면 물길을 피해요</div>}
        {addType && <div className="reef-placement" data-reef-ui><img src={ASSETS[addType].file} alt="" /><span>놓을 곳을 탭하세요</span></div>}
        {feedingMode && <div className="reef-feed-hint" data-reef-ui><Icon name="food" /><span>먹이를 놓을 곳을 탭하세요</span></div>}
      </>}

      {uiHidden && <button type="button" className="reef-reveal" onClick={() => setUiHidden(false)} aria-label="바다 도구 다시 보이기" />}
      <div className={`reef-toast${toast ? " is-visible" : ""}`} role="status" aria-live="polite">{toast}</div>
    </main>
  );
}
