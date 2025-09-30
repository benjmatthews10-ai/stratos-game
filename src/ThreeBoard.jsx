// src/ThreeBoard.jsx
import React, { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Stars } from "@react-three/drei";

const N = 8;

// Colors
const RED = "#ef4444";
const BLUE = "#38bdf8";
const TILE_DARK = "#1f2937";
const TILE_LIGHT = "#334155";
const FRAME = "#c8a57a";
const LEGAL = "#a3e635";

// size
const TILE = 1;
const GAP = 0.04;
const BLOCK_H = 0.22;
const TILE_THICK = 0.06;

function Tile({ x, z, dark, selected, onClick }) {
  return (
    <mesh
      position={[x, TILE_THICK / 2, z]}
      onPointerDown={onClick}
      castShadow={false}
      receiveShadow
    >
      <boxGeometry args={[TILE - GAP, TILE_THICK, TILE - GAP]} />
      <meshStandardMaterial color={dark ? TILE_DARK : TILE_LIGHT} />
      {selected && (
        <mesh position={[0, 0.01, 0]}>
          <boxGeometry args={[TILE - GAP, 0.002, TILE - GAP]} />
          <meshStandardMaterial
            color="#fbbf24"
            emissive="#fbbf24"
            emissiveIntensity={0.7}
          />
        </mesh>
      )}
    </mesh>
  );
}

function Tower({ x, z, stack, onClick }) {
  if (!stack.length) return null;
  return (
    <group position={[x, TILE_THICK, z]}>
      {stack.map((blk, idx) => (
        <mesh
          key={idx}
          position={[0, BLOCK_H * idx + BLOCK_H / 2, 0]}
          onPointerDown={onClick}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[0.86, BLOCK_H, 0.86]} />
          <meshStandardMaterial
            color={blk === "R" ? RED : BLUE}
            roughness={0.35}
            metalness={0.05}
          />
        </mesh>
      ))}
    </group>
  );
}

/** Standalone legal marker so it appears on empty tiles too */
function LegalDot({ x, z, h, onClick }) {
  // y = top of tile + height of stack + little offset
  const y = TILE_THICK + h * BLOCK_H + 0.14;
  return (
    <mesh position={[x, y, z]} onPointerDown={onClick}>
      <sphereGeometry args={[0.12, 24, 24]} />
      <meshStandardMaterial
        color={LEGAL}
        emissive={LEGAL}
        emissiveIntensity={0.6}
      />
    </mesh>
  );
}

/**
 * ThreeBoard
 * Props:
 *  - board: string[][][] (stacks of 'R'/'B')
 *  - flipped: boolean
 *  - selected: [r,c] | null
 *  - selectedMoves: [{src:[r,c], dst:[r,c], kind:string}]
 *  - onCellClick: (r,c)=>void
 */
export default function ThreeBoard({
  board,
  flipped = false,
  selected,
  selectedMoves = [],
  onCellClick,
}) {
  // For quick lookup of legal destinations
  const legalSet = useMemo(() => {
    const s = new Set();
    for (const m of selectedMoves) s.add(`${m.dst[0]},${m.dst[1]}`);
    return s;
  }, [selectedMoves]);

  const tiles = [];
  const towers = [];
  const markers = [];

  for (let vr = 0; vr < N; vr++) {
    for (let vc = 0; vc < N; vc++) {
      // map view -> board coordinates
      const r = flipped ? N - 1 - vr : vr;
      const c = flipped ? N - 1 - vc : vc;

      // world position (center the 8×8 at origin)
      const x = vc - (N - 1) / 2;
      const z = vr - (N - 1) / 2;

      const dark = (vr + vc) % 2 === 0;
      const isSel = selected && selected[0] === r && selected[1] === c;
      const isLegal = legalSet.has(`${r},${c}`);

      const stack = board[r][c];
      const h = stack.length;

      tiles.push(
        <Tile
          key={`t-${vr}-${vc}`}
          x={x}
          z={z}
          dark={dark}
          selected={!!isSel}
          onClick={() => onCellClick?.(r, c)}
        />
      );

      towers.push(
        <Tower
          key={`tw-${vr}-${vc}`}
          x={x}
          z={z}
          stack={stack}
          onClick={() => onCellClick?.(r, c)}
        />
      );

      if (isLegal) {
        markers.push(
          <LegalDot
            key={`lm-${vr}-${vc}`}
            x={x}
            z={z}
            h={h}
            onClick={() => onCellClick?.(r, c)}
          />
        );
      }
    }
  }

  return (
    <Canvas
      shadows
      camera={{ position: [6, 8.5, 9.5], fov: 40 }}
      style={{ width: "100%", height: "100%" }}
    >
      {/* mood + soft lights */}
      <color attach="background" args={["#0b1220"]} />
      <ambientLight intensity={0.45} />
      <directionalLight
        position={[6, 8, 6]}
        intensity={1.0}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <Stars
        radius={40}
        depth={18}
        count={500}
        factor={3}
        saturation={0}
        fade
        speed={1}
      />

      {/* wooden frame below the board */}
      <group position={[0, 0, 0]}>
        <mesh position={[0, 0, 0]} receiveShadow>
          <boxGeometry args={[N + 0.6, 0.2, N + 0.6]} />
          <meshStandardMaterial color={FRAME} roughness={0.7} metalness={0.0} />
        </mesh>

        {/* tile layer, towers, and legal markers */}
        <group position={[0, 0.11, 0]}>{tiles}</group>
        <group position={[0, 0.11, 0]}>{towers}</group>
        <group position={[0, 0, 0]}>{markers}</group>
      </group>

      {/* mouse look / zoom */}
      <OrbitControls
        makeDefault
        enablePan={false}
        minDistance={7}
        maxDistance={18}
        minPolarAngle={0.4}
        maxPolarAngle={1.35}
      />
    </Canvas>
  );
}
