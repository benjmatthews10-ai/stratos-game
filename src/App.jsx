import React, { useEffect, useMemo, useState } from "react";
import ThreeBoard from "./ThreeBoard"; // 3D board (toggleable)

/* ================== Core game constants & helpers ================== */
const N = 8;
const DIRS = [
  { name: "Up", d: [-1, 0], key: "ArrowUp" },
  { name: "Down", d: [1, 0], key: "ArrowDown" },
  { name: "Left", d: [0, -1], key: "ArrowLeft" },
  { name: "Right", d: [0, 1], key: "ArrowRight" },
];

function makeInitialBoard() {
  const board = Array.from({ length: N }, () =>
    Array.from({ length: N }, () => [])
  );
  for (let r = 0; r < 4; r++) for (let c = 0; c < N; c++) board[r][c] = ["R"];
  for (let r = 4; r < 8; r++) for (let c = 0; c < N; c++) board[r][c] = ["B"];
  return board;
}
const inBounds = (r, c) => r >= 0 && r < N && c >= 0 && c < N;
const height = (b, r, c) => b[r][c].length;
const topColor = (b, r, c) =>
  b[r][c].length ? b[r][c][b[r][c].length - 1] : null;
const forwardDir = (color) => (color === "R" ? 1 : -1);
const cx = (...xs) => xs.filter(Boolean).join(" ");
const sqKey = (r, c) => `${r},${c}`;
const moveKey = (m) =>
  `${sqKey(m.src[0], m.src[1])}->${sqKey(m.dst[0], m.dst[1])}`;

/** Rules (final):
 * - Backward: step-down only (no across, no climb).
 * - Empty: you may step-down only to empty by −1 or −2 height.
 * - Own colour: Across only (equal height). No +1 climb.
 * - Opponent: Capture only if you are strictly taller by 1–2 (destination lower).
 * - Orthogonal only; only top block moves; origin shrinks, destination grows.
 */
function moveKind(board, color, src, dst) {
  const [sr, sc] = src,
    [dr, dc] = dst;
  if (!inBounds(sr, sc) || !inBounds(dr, dc)) return null;
  if (Math.abs(sr - dr) + Math.abs(sc - dc) !== 1) return null;
  if (height(board, sr, sc) === 0) return null;
  if (topColor(board, sr, sc) !== color) return null;

  const hSrc = height(board, sr, sc);
  const hDst = height(board, dr, dc);
  const topDst = topColor(board, dr, dc);
  const delta = hDst - hSrc; // >0 "climb", 0 across, <0 step-down

  const movingBackward = dr - sr === -forwardDir(color);
  if (movingBackward && delta >= 0) return null; // backward only step-down

  // Step-down (empty or any colour) only if -1 or -2
  if (delta === -1 || delta === -2) {
    return topDst && topDst !== color ? "Capture" : "StepDown";
  }

  // Cannot move onto empty if not stepping down
  if (!topDst) return null;

  // Own colour: equal height only (Across). No +1 climb allowed.
  if (topDst === color) {
    return delta === 0 ? "Across" : null;
  }

  // Opponent but not step-down => illegal
  return null;
}

function legalMoves(board, color) {
  const moves = [];
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (topColor(board, r, c) !== color) continue;
      for (const { d } of DIRS) {
        const dst = [r + d[0], c + d[1]];
        const kind = moveKind(board, color, [r, c], dst);
        if (kind) moves.push({ src: [r, c], dst, kind });
      }
    }
  }
  return moves;
}

const applyMove = (board, move) => {
  const b = board.map((row) => row.map((stack) => [...stack]));
  const [sr, sc] = move.src,
    [dr, dc] = move.dst;
  const block = b[sr][sc].pop();
  b[dr][dc].push(block);
  return b;
};

function crossingVictory(board) {
  for (let c = 0; c < N; c++) {
    if (topColor(board, 7, c) === "R") return "R";
    if (topColor(board, 0, c) === "B") return "B";
  }
  return null;
}
const hasLegalMoves = (board, color) => legalMoves(board, color).length > 0;

/* ================== AI (same as before, stronger heuristics) ================== */
function centerBonus(c) {
  const mid = [3, 4];
  return mid.includes(c) ? 4 : c === 2 || c === 5 ? 2 : 0;
}

// Static eval: higher better for Red, lower better for Blue
function evaluate(board) {
  let score = 0;
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const top = topColor(board, r, c);
      if (!top) continue;
      const h = height(board, r, c);
      const central = centerBonus(c);
      if (top === "R") score += 14 * r + 4 * h + central;
      else score -= 14 * (7 - r) + 4 * h + central;
    }
  }
  const redMoves = legalMoves(board, "R").length;
  const blueMoves = legalMoves(board, "B").length;
  score += 3 * (redMoves - blueMoves);
  for (let c = 0; c < N; c++) {
    if (topColor(board, 6, c) === "R") score += 40;
    if (topColor(board, 1, c) === "B") score -= 40;
  }
  for (let c = 0; c < N; c++) {
    if (topColor(board, 7, c) === "R") score += 120;
    if (topColor(board, 0, c) === "B") score -= 120;
  }
  return score;
}

function orderMoves(board, color, moves, avoidKey) {
  return moves
    .map((m) => {
      const key = moveKey(m);
      let w = 0;
      if (m.kind === "Capture") w += 50;
      if (m.kind === "StepDown") w += 10;
      const dr = m.dst[0] - m.src[0];
      if ((color === "R" && dr > 0) || (color === "B" && dr < 0)) w += 8;
      w += centerBonus(m.dst[1]);
      const hAfter = height(applyMove(board, m), m.dst[0], m.dst[1]);
      w += Math.min(hAfter, 6);
      if (avoidKey && key === avoidKey) w -= 1000;
      return { m, w };
    })
    .sort((a, b) => b.w - a.w)
    .map((x) => x.m);
}
function pickRandom(moves, avoidKey) {
  const filtered = avoidKey
    ? moves.filter((m) => moveKey(m) !== avoidKey)
    : moves;
  const list = filtered.length ? filtered : moves;
  if (!list.length) return null;
  return list[Math.floor(Math.random() * list.length)];
}
function pickGreedy(board, color, avoidKey) {
  const moves = legalMoves(board, color);
  if (!moves.length) return null;
  let best = null;
  let bestScore = color === "R" ? -Infinity : Infinity;
  const ordered = orderMoves(board, color, moves, avoidKey);
  for (const m of ordered) {
    const nb = applyMove(board, m);
    const penalty = avoidKey && moveKey(m) === avoidKey ? 15 : 0;
    const s = evaluate(nb) - (color === "R" ? penalty : -penalty);
    if (color === "R" ? s > bestScore : s < bestScore) {
      bestScore = s;
      best = m;
    }
  }
  return best || pickRandom(moves, avoidKey);
}
function minimax(board, color, depth, alpha, beta, avoidKey) {
  const cross = crossingVictory(board);
  if (cross === "R") return { score: 999999, move: null };
  if (cross === "B") return { score: -999999, move: null };
  if (depth === 0) return { score: evaluate(board), move: null };

  const moves = legalMoves(board, color);
  if (!moves.length)
    return { score: color === "R" ? -99999 : 99999, move: null };

  const ordered = orderMoves(board, color, moves, avoidKey);
  let bestMove = null;

  if (color === "R") {
    let best = -Infinity;
    for (const m of ordered) {
      const nb = applyMove(board, m);
      const res = minimax(nb, "B", depth - 1, alpha, beta, null);
      const penalty = avoidKey && moveKey(m) === avoidKey ? 15 : 0;
      const s = res.score - penalty;
      if (s > best) {
        best = s;
        bestMove = m;
      }
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return { score: best, move: bestMove };
  } else {
    let best = Infinity;
    for (const m of ordered) {
      const nb = applyMove(board, m);
      const res = minimax(nb, "R", depth - 1, alpha, beta, null);
      const penalty = avoidKey && moveKey(m) === avoidKey ? 15 : 0;
      const s = res.score + penalty;
      if (s < best) {
        best = s;
        bestMove = m;
      }
      beta = Math.min(beta, best);
      if (beta <= alpha) break;
    }
    return { score: best, move: bestMove };
  }
}
function pickMinimax(board, color, depth, avoidKey) {
  const moves = legalMoves(board, color);
  if (!moves.length) return null;
  const { move } = minimax(board, color, depth, -Infinity, Infinity, avoidKey);
  return (
    move || pickGreedy(board, color, avoidKey) || pickRandom(moves, avoidKey)
  );
}

/* ================== App ================== */
export default function App() {
  const [board, setBoard] = useState(makeInitialBoard());
  const [toMove, setToMove] = useState("R");
  const [selected, setSelected] = useState(null); // [r,c] | null
  const [history, setHistory] = useState([]);

  const [rotX, setRotX] = useState(60); // 2D tilt
  const [rotY, setRotY] = useState(0); // 2D rotate
  const [flipped, setFlipped] = useState(false);

  // 2D / 3D toggle
  const [useThree, setUseThree] = useState(false);

  // Setup overlay state
  const [showSetup, setShowSetup] = useState(true);
  const [setupMode, setSetupMode] = useState("HUMAN"); // HUMAN | AI
  const [setupHumanColor, setSetupHumanColor] = useState("R");
  const [setupAiLevel, setSetupAiLevel] = useState("MINIMAX3"); // EASY..VERY HARD

  const [mode, setMode] = useState("HUMAN"); // HUMAN | AI
  const [humanColor, setHumanColor] = useState("R");
  const [aiLevel, setAiLevel] = useState("MINIMAX3");

  // Repetition (bounce) tracking: per-player pair counting between two squares
  const [bounce, setBounce] = useState({
    R: { endpoints: null, lastDir: null, pairs: 0 },
    B: { endpoints: null, lastDir: null, pairs: 0 },
  });
  const [repWin, setRepWin] = useState(null); // "R" | "B" | null

  // NEW: Rules modal
  const [showRules, setShowRules] = useState(false);

  const aiColor = humanColor === "R" ? "B" : "R";
  const aiTurn = mode === "AI" && toMove === aiColor;

  const legals = useMemo(() => legalMoves(board, toMove), [board, toMove]);

  const selectedMoves = useMemo(() => {
    if (!selected) return [];
    if (topColor(board, selected[0], selected[1]) !== toMove) return [];
    return legals.filter(
      (m) => m.src[0] === selected[0] && m.src[1] === selected[1]
    );
  }, [legals, selected, board, toMove]);

  const status = useMemo(() => {
    if (repWin) return { mode: "Repetition", winner: repWin };
    const cross = crossingVictory(board);
    if (cross) return { mode: "Crossing", winner: cross };
    if (!hasLegalMoves(board, toMove))
      return { mode: "Lockout", winner: toMove === "R" ? "B" : "R" };
    return null;
  }, [board, toMove, repWin]);

  useEffect(() => setSelected(null), [toMove]);
  useEffect(() => setSelected(null), [mode, humanColor]);

  function hardResetToSetup() {
    setBoard(makeInitialBoard());
    setToMove("R");
    setSelected(null);
    setHistory([]);
    setFlipped(false);
    setUseThree(false);
    setShowSetup(true);
    setBounce({
      R: { endpoints: null, lastDir: null, pairs: 0 },
      B: { endpoints: null, lastDir: null, pairs: 0 },
    });
    setRepWin(null);
  }
  function startGameFromSetup() {
    setBoard(makeInitialBoard());
    setToMove("R");
    setSelected(null);
    setHistory([]);
    setMode(setupMode);
    setHumanColor(setupHumanColor);
    setAiLevel(
      setupAiLevel === "EASY"
        ? "RANDOM"
        : setupAiLevel === "MEDIUM"
        ? "GREEDY"
        : setupAiLevel === "HARD"
        ? "MINIMAX2"
        : "MINIMAX3"
    );
    setShowSetup(false);
    setBounce({
      R: { endpoints: null, lastDir: null, pairs: 0 },
      B: { endpoints: null, lastDir: null, pairs: 0 },
    });
    setRepWin(null);
    setFlipped(setupMode === "AI" && setupHumanColor === "B");
  }

  function reset() {
    setBoard(makeInitialBoard());
    setToMove("R");
    setSelected(null);
    setHistory([]);
    setBounce({
      R: { endpoints: null, lastDir: null, pairs: 0 },
      B: { endpoints: null, lastDir: null, pairs: 0 },
    });
    setRepWin(null);
  }
  function swapTurn() {
    setToMove((t) => (t === "R" ? "B" : "R"));
    setSelected(null);
  }
  function undo() {
    if (!history.length) return;
    const last = history[history.length - 1];
    setBoard(last.board);
    setToMove(last.toMove);
    setSelected(last.selected);
    setHistory((h) => h.slice(0, -1));
    // (We don't rewind bounce; OK for testing)
  }

  // Bounce pair helper
  function updateBounce(mover, src, dst) {
    const a = sqKey(src[0], src[1]);
    const b = sqKey(dst[0], dst[1]);
    const dir = a < b ? 1 : -1; // just a consistent direction flag
    const ep = [a, b].sort().join("|");

    setBounce((prev) => {
      const cur = prev[mover];
      if (cur.endpoints === ep) {
        // same two squares as before
        const newPairs =
          cur.lastDir != null && cur.lastDir !== dir
            ? cur.pairs + 1
            : cur.pairs;
        const next = {
          ...prev,
          [mover]: { endpoints: ep, lastDir: dir, pairs: newPairs },
        };
        if (newPairs >= 3) setRepWin(mover === "R" ? "B" : "R");
        return next;
      } else {
        // new squares: start tracking
        return { ...prev, [mover]: { endpoints: ep, lastDir: dir, pairs: 0 } };
      }
    });
  }

  function tryApply(move) {
    const kind = moveKind(board, toMove, move.src, move.dst);
    if (!kind || status) return;

    // record for undo
    const rec = { board, toMove, selected };
    const nb = applyMove(board, { ...move, kind });

    // update repetition/bounce for mover
    updateBounce(toMove, move.src, move.dst);

    setHistory((h) => [...h, rec]);
    setBoard(nb);
    setToMove(toMove === "R" ? "B" : "R");
    setSelected(null);
  }

  function onCellClick(r, c) {
    if (status || showSetup) return;
    if (aiTurn) return;
    if (selected && selected[0] === r && selected[1] === c) {
      setSelected(null);
      return;
    }
    if (selected) {
      const mv = selectedMoves.find((m) => m.dst[0] === r && m.dst[1] === c);
      if (mv) {
        tryApply(mv);
        return;
      }
    }
    setSelected([r, c]);
  }

  const arrowAttempt = (d) => {
    if (!selected || showSetup || aiTurn || status) return;
    if (topColor(board, selected[0], selected[1]) !== toMove) return;
    const [r, c] = selected;
    const dst = [r + d[0], c + d[1]];
    const kind = moveKind(board, toMove, [r, c], dst);
    if (!kind) return;
    tryApply({ src: [r, c], dst, kind });
  };
  const arrowEnabled = (dir) => {
    if (!selected || showSetup || aiTurn || status) return false;
    if (topColor(board, selected[0], selected[1]) !== toMove) return false;
    const [r, c] = selected;
    const dst = [r + dir[0], c + dir[1]];
    return !!moveKind(board, toMove, [r, c], dst);
  };

  const selectedOwner = selected
    ? topColor(board, selected[0], selected[1]) || "Empty"
    : "—";

  /* ---------------- AI turn effect ---------------- */
  useEffect(() => {
    if (status || showSetup) return;
    if (!aiTurn) return;

    const t = setTimeout(() => {
      const color = aiColor;
      const moves = legalMoves(board, color);
      if (!moves.length) {
        setToMove(color === "R" ? "B" : "R");
        return;
      }
      const avoidKey = null; // ordering penalty already discourages repeats

      let move = null;
      if (aiLevel === "RANDOM") move = pickRandom(moves, avoidKey);
      else if (aiLevel === "GREEDY") move = pickGreedy(board, color, avoidKey);
      else if (aiLevel === "MINIMAX2")
        move = pickMinimax(board, color, 2, avoidKey);
      else move = pickMinimax(board, color, 3, avoidKey);

      if (move) tryApply(move);
      else setToMove(color === "R" ? "B" : "R");
    }, 220);

    return () => clearTimeout(t);
  }, [aiTurn, aiLevel, aiColor, board, status, showSetup]); // eslint-disable-line

  /* ================== UI ================== */
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 px-4 py-6">
      <div className="max-w-6xl mx-auto grid lg:grid-cols-[1fr_380px] gap-6 items-start">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <h1 className="text-2xl font-semibold">STRATOS — Play Test</h1>
            {/* Info button (always available) */}
            <button
              onClick={() => setShowRules(true)}
              className="ml-2 inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-800 hover:bg-slate-700 border border-slate-700"
              title="Rules of Play"
            >
              <svg width="16" height="16" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M12 2a10 10 0 1 1 0 20a10 10 0 0 1 0-20Zm1 15v-6h-2v6h2Zm0-8V7h-2v2h2Z"
                />
              </svg>
            </button>
          </div>

          <div className="mb-3 flex flex-wrap gap-3 items-center">
            <div className="flex items-center gap-2">
              <label className="text-sm text-slate-300">Tilt</label>
              <input
                type="range"
                min={30}
                max={80}
                value={rotX}
                onChange={(e) => setRotX(parseInt(e.target.value))}
                disabled={useThree}
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-slate-300">Rotate</label>
              <input
                type="range"
                min={-45}
                max={45}
                value={rotY}
                onChange={(e) => setRotY(parseInt(e.target.value))}
                disabled={useThree}
              />
            </div>

            <button
              onClick={() => setFlipped((f) => !f)}
              className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-sm"
            >
              {flipped ? "Unflip board" : "Flip board"}
            </button>

            <button
              onClick={() => setUseThree((v) => !v)}
              className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-sm"
            >
              {useThree ? "Switch to 2D" : "Switch to 3D"}
            </button>

            <button
              onClick={undo}
              className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-sm disabled:opacity-40"
              disabled={!history.length}
            >
              Undo
            </button>
            <button
              onClick={reset}
              className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-sm"
            >
              Reset
            </button>

            {mode === "HUMAN" && (
              <button
                onClick={swapTurn}
                className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-sm"
              >
                Swap turn
              </button>
            )}

            <button
              onClick={hardResetToSetup}
              className="px-3 py-1 rounded bg-indigo-700 hover:bg-indigo-600 text-sm ml-auto"
            >
              New game
            </button>

            <div className="text-sm text-slate-300">
              To move:{" "}
              <span
                className={toMove === "R" ? "text-rose-300" : "text-sky-300"}
              >
                {toMove === "R" ? "Red" : "Blue"}
              </span>
            </div>
          </div>

          {/* ---- BOARD AREA ---- */}
          <div
            className="w-full overflow-hidden rounded-xl"
            style={{ height: 720 }}
          >
            {useThree ? (
              <ThreeBoard
                board={board}
                flipped={flipped}
                selected={selected}
                selectedMoves={selectedMoves}
                onCellClick={onCellClick}
              />
            ) : (
              <div
                className="mx-auto"
                style={{ width: 720, height: 720, perspective: 1400 }}
              >
                <div
                  className="relative origin-center mx-auto select-none"
                  style={{
                    width: 640,
                    height: 640,
                    transform: `rotateX(${rotX}deg) rotateY(${rotY}deg)`,
                    transformStyle: "preserve-3d",
                  }}
                >
                  {/* background plate */}
                  <div
                    className="absolute inset-0 rounded-xl"
                    style={{
                      background:
                        "linear-gradient(135deg,#0f172a 0%,#111827 50%,#0b1220 100%)",
                      boxShadow:
                        "0 40px 80px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.05)",
                      transform: "translateZ(-20px)",
                      zIndex: 0,
                    }}
                  />
                  {/* grid layer */}
                  <div
                    className="absolute inset-3 grid grid-cols-8 grid-rows-8 gap-1 z-20"
                    onClick={(e) => {
                      const cell = e.target.closest("[data-cell]");
                      if (!cell) return;
                      const r = parseInt(cell.getAttribute("data-r"), 10);
                      const c = parseInt(cell.getAttribute("data-c"), 10);
                      if (!Number.isInteger(r) || !Number.isInteger(c)) return;
                      onCellClick(r, c);
                    }}
                  >
                    {Array.from({ length: N * N }).map((_, i) => {
                      const vr = Math.floor(i / N),
                        vc = i % N;
                      const r = flipped ? N - 1 - vr : vr;
                      const c = flipped ? N - 1 - vc : vc;

                      const isSel =
                        selected && selected[0] === r && selected[1] === c;
                      const legalHere = selectedMoves.find(
                        (m) => m.dst[0] === r && m.dst[1] === c
                      );
                      const top = topColor(board, r, c);
                      const h = height(board, r, c);

                      const labelCol = String.fromCharCode(
                        65 + (flipped ? N - 1 - c : c)
                      );
                      const labelRow = flipped ? r + 1 : N - r;

                      return (
                        <div
                          key={i}
                          data-cell
                          data-r={r}
                          data-c={c}
                          role="button"
                          tabIndex={0}
                          className={cx(
                            "relative rounded-md p-1 transition-colors",
                            (vr + vc) % 2 === 0
                              ? "bg-slate-800/70"
                              : "bg-slate-700/70",
                            isSel && "ring-2 ring-amber-300",
                            legalHere && "outline outline-2 outline-lime-300",
                            !top && "opacity-90",
                            "cursor-pointer"
                          )}
                          title={h ? `${top}${h}` : "Empty"}
                        >
                          {legalHere && !showSetup && !status && (
                            <div className="absolute inset-0 grid place-items-center pointer-events-none">
                              <div className="w-4 h-4 rounded-full bg-lime-300/80" />
                            </div>
                          )}
                          {h > 0 && (
                            <div className="w-full h-full flex flex-col-reverse gap-0.5 pointer-events-none">
                              {board[r][c].map((block, idx) => (
                                <div
                                  key={idx}
                                  className={cx(
                                    "h-4 rounded-sm border border-black/30",
                                    block === "R"
                                      ? "bg-rose-500"
                                      : "bg-sky-500",
                                    "shadow-[inset_0_2px_0_rgba(255,255,255,0.25),0_2px_4px_rgba(0,0,0,0.35)]"
                                  )}
                                  style={{
                                    transform: `translateZ(${idx * 2}px)`,
                                  }}
                                />
                              ))}
                            </div>
                          )}
                          <div className="absolute left-1 top-1 text-[10px] text-slate-300/70 pointer-events-none">
                            {labelCol}
                            {labelRow}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Win overlay */}
          {status && !showSetup && (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
              <div className="relative z-10 w-[min(92vw,560px)] rounded-3xl border border-slate-700 bg-slate-900/90 p-8 shadow-2xl">
                <div className="flex items-center gap-4 mb-4">
                  <svg
                    width="48"
                    height="48"
                    viewBox="0 0 24 24"
                    className="opacity-90"
                  >
                    <path
                      fill="currentColor"
                      d="M6 3h12v2h3v3a5 5 0 0 1-5 5h-1a5 5 0 0 1-4 2a5 5 0 0 1-4-2H6a5 5 0 0 1-5-5V5h3V3Zm-3 5a3 3 0 0 0 3 3h1V5H3Zm17 3a3 3 0 0 0 3-3V5h-4v6Zm-9 4h4v2h-4v-2Zm-3 3h10v2H8v-2Z"
                    />
                  </svg>
                  <div>
                    <h2 className="text-3xl font-extrabold tracking-tight">
                      <span
                        className={
                          status.winner === "R"
                            ? "text-rose-300"
                            : "text-sky-300"
                        }
                      >
                        {status.winner === "R" ? "Red" : "Blue"}
                      </span>{" "}
                      wins!
                    </h2>
                    <p className="text-slate-300">
                      {status.mode === "Crossing"
                        ? "Crossing Victory"
                        : status.mode === "Lockout"
                        ? "Lockout Victory"
                        : "Repetition Victory"}
                    </p>
                  </div>
                </div>
                <div className="mt-6 flex gap-3">
                  <button
                    onClick={hardResetToSetup}
                    className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium"
                  >
                    New game
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Repetition warning (2 pairs reached) */}
          {!status && bounce[toMove].pairs === 2 && (
            <div className="mt-3 p-2 rounded bg-amber-900/40 border border-amber-700 text-amber-200">
              Warning: repeating back-and-forth with the same piece. One more
              A↔B pair and you lose by repetition.
            </div>
          )}
        </div>

        {/* Side panel */}
        <div className="sticky top-6">
          <div className="rounded-2xl bg-slate-900/70 border border-slate-700 p-4 shadow-xl">
            <h2 className="text-lg font-semibold mb-3">Controls</h2>
            <div className="text-sm text-slate-300 mb-2">
              Click any square to select. Legal moves show only if the selected
              tower belongs to the side to move.
              {mode === "AI" && (
                <span className="block mt-1">
                  You:{" "}
                  <b
                    className={
                      humanColor === "R" ? "text-rose-300" : "text-sky-300"
                    }
                  >
                    {humanColor === "R" ? "Red" : "Blue"}
                  </b>{" "}
                  • Computer:{" "}
                  <b
                    className={
                      humanColor === "R" ? "text-sky-300" : "text-rose-300"
                    }
                  >
                    {humanColor === "R" ? "Blue" : "Red"}
                  </b>{" "}
                  • Level:{" "}
                  {
                    {
                      RANDOM: "Easy",
                      GREEDY: "Medium",
                      MINIMAX2: "Hard",
                      MINIMAX3: "Very Hard",
                    }[aiLevel]
                  }
                </span>
              )}
            </div>

            {/* Arrows */}
            <div className="grid grid-cols-3 gap-2 w-40 mx-auto my-4">
              <div />
              <button
                className={cx(
                  "px-3 py-2 rounded bg-slate-800 border border-slate-700",
                  arrowEnabled([-1, 0])
                    ? "hover:bg-slate-700"
                    : "opacity-40 cursor-not-allowed"
                )}
                onClick={() => arrowAttempt([-1, 0])}
                disabled={!arrowEnabled([-1, 0])}
              >
                ↑
              </button>
              <div />
              <button
                className={cx(
                  "px-3 py-2 rounded bg-slate-800 border border-slate-700",
                  arrowEnabled([0, -1])
                    ? "hover:bg-slate-700"
                    : "opacity-40 cursor-not-allowed"
                )}
                onClick={() => arrowAttempt([0, -1])}
                disabled={!arrowEnabled([0, -1])}
              >
                ←
              </button>
              <div />
              <button
                className={cx(
                  "px-3 py-2 rounded bg-slate-800 border border-slate-700",
                  arrowEnabled([0, 1])
                    ? "hover:bg-slate-700"
                    : "opacity-40 cursor-not-allowed"
                )}
                onClick={() => arrowAttempt([0, 1])}
                disabled={!arrowEnabled([0, 1])}
              >
                →
              </button>
              <div />
              <button
                className={cx(
                  "px-3 py-2 rounded bg-slate-800 border border-slate-700",
                  arrowEnabled([1, 0])
                    ? "hover:bg-slate-700"
                    : "opacity-40 cursor-not-allowed"
                )}
                onClick={() => arrowAttempt([1, 0])}
                disabled={!arrowEnabled([1, 0])}
              >
                ↓
              </button>
              <div />
            </div>

            {/* Selection info */}
            <div className="text-sm text-slate-300 space-y-1">
              <div>
                <span className="inline-block w-24">Selected:</span>
                {selected
                  ? `${String.fromCharCode(65 + selected[1])}${8 - selected[0]}`
                  : "—"}
              </div>
              <div>
                <span className="inline-block w-24">Owner:</span>
                {selectedOwner}
              </div>
              <div>
                <span className="inline-block w-24">Moves:</span>
                {selectedMoves.length
                  ? selectedMoves.map((m, i) => (
                      <span
                        key={i}
                        className="mr-2 px-2 py-0.5 rounded bg-slate-800 border border-slate-700"
                      >
                        {m.kind} → {String.fromCharCode(65 + m.dst[1])}
                        {8 - m.dst[0]}
                      </span>
                    ))
                  : "—"}
              </div>
            </div>

            <hr className="my-4 border-slate-700" />
            <h3 className="font-semibold flex items-center gap-2">
              Rule Reminders
              <button
                onClick={() => setShowRules(true)}
                className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs"
                title="Open Rules"
              >
                i
              </button>
            </h3>
            <ul className="mt-1 text-sm text-slate-300 list-disc pl-5 space-y-1">
              <li>
                <b>Across</b>: own colour, equal height only.
              </li>
              <li>
                <b>Step-Down</b>: any/empty, −1 or −2 only (backward allowed).
              </li>
              <li>
                <b>Capture</b>: opponent only, strictly taller by 1–2.
              </li>
              <li>
                <b>Backward</b>: step-down only (no across/climb).
              </li>
              <li>
                <b>Win</b>: Crossing, Lockout, or 3 A↔B pairs with the same
                piece (Repetition).
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Setup overlay */}
      {showSetup && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative z-10 w-[min(92vw,640px)] rounded-3xl border border-slate-700 bg-slate-900/95 p-8 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold">New Game Setup</h2>
              <button
                onClick={() => setShowRules(true)}
                className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 border border-slate-700"
                title="Rules of Play"
              >
                <svg width="16" height="16" viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M12 2a10 10 0 1 1 0 20a10 10 0 0 1 0-20Zm1 15v-6h-2v6h2Zm0-8V7h-2v2h2Z"
                  />
                </svg>
              </button>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-3">
                <label className="block text-sm text-slate-300">Mode</label>
                <div className="flex gap-2">
                  <button
                    className={cx(
                      "px-3 py-2 rounded border",
                      "bg-slate-800 border-slate-700 hover:bg-slate-800/60",
                      setupMode === "HUMAN" && "border-slate-500"
                    )}
                    onClick={() => setSetupMode("HUMAN")}
                  >
                    Human vs Human
                  </button>
                  <button
                    className={cx(
                      "px-3 py-2 rounded border",
                      "bg-slate-800 border-slate-700 hover:bg-slate-800/60",
                      setupMode === "AI" && "border-slate-500"
                    )}
                    onClick={() => setSetupMode("AI")}
                  >
                    Human vs Computer
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <label className="block text-sm text-slate-300">
                  Your colour
                </label>
                <div className="flex gap-2">
                  <button
                    disabled={setupMode !== "AI"}
                    className={cx(
                      "px-3 py-2 rounded border",
                      setupHumanColor === "R"
                        ? "bg-rose-900/40 border-rose-500 text-rose-200"
                        : "bg-slate-800/40 border-slate-700 hover:bg-slate-800/60",
                      setupMode !== "AI" && "opacity-40 cursor-not-allowed"
                    )}
                    onClick={() => setSetupHumanColor("R")}
                  >
                    Red
                  </button>
                  <button
                    disabled={setupMode !== "AI"}
                    className={cx(
                      "px-3 py-2 rounded border",
                      setupHumanColor === "B"
                        ? "bg-sky-900/40 border-sky-500 text-sky-200"
                        : "bg-slate-800/40 border-slate-700 hover:bg-slate-800/60",
                      setupMode !== "AI" && "opacity-40 cursor-not-allowed"
                    )}
                    onClick={() => setSetupHumanColor("B")}
                  >
                    Blue
                  </button>
                </div>
              </div>

              <div className="space-y-3 sm:col-span-2">
                <label className="block text-sm text-slate-300">
                  Computer difficulty
                </label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { id: "EASY", name: "Easy" },
                    { id: "MEDIUM", name: "Medium" },
                    { id: "HARD", name: "Hard" },
                    { id: "VERY_HARD", name: "Very Hard" },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      disabled={setupMode !== "AI"}
                      className={cx(
                        "px-3 py-2 rounded border",
                        setupAiLevel === opt.id
                          ? "bg-slate-800 border-slate-500"
                          : "bg-slate-800/40 border-slate-700 hover:bg-slate-800/60",
                        setupMode !== "AI" && "opacity-40 cursor-not-allowed"
                      )}
                      onClick={() => setSetupAiLevel(opt.id)}
                    >
                      {opt.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-6 flex gap-3 justify-end">
              <button
                onClick={startGameFromSetup}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium"
              >
                Start game
              </button>
            </div>

            <p className="mt-3 text-slate-400 text-sm">
              Red moves first. In Human vs Computer, the computer plays the
              opposite colour you choose. Repetition rule: if you bounce the
              same piece back and forth A↔B three times (3 pairs) across your
              turns, you lose immediately.
            </p>
          </div>
        </div>
      )}

      {/* Rules Modal (available always) */}
      {showRules && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowRules(false)}
          />
          <div className="relative z-10 w-[min(92vw,680px)] max-h-[85vh] overflow-auto rounded-3xl border border-slate-700 bg-slate-900/95 p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xl font-bold">Rules of Play — STRATOS</h3>
              <button
                onClick={() => setShowRules(false)}
                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sm"
              >
                Close
              </button>
            </div>

            <div className="space-y-3 text-slate-200 text-sm leading-6">
              <p>
                <b>Goal:</b> Reach the opponent’s back row with one of your
                blocks (Crossing), or win by Lockout (opponent has no legal
                move), or by Repetition (same piece bounces between two squares
                A↔B three times across your turns).
              </p>

              <p>
                <b>Movement:</b> Only the top block of a tower moves, one square
                orthogonally (no diagonals). When it moves, the origin tower
                shrinks by 1 and the destination grows by 1 with the mover on
                top. Empty squares are height 0.
              </p>

              <ul className="list-disc pl-5 space-y-1">
                <li>
                  <b>Across (own colour):</b> move onto your own tower of{" "}
                  <i>equal height</i>. Forward/sideways only. No backward.
                </li>
                <li>
                  <b>Step-Down (any/empty):</b> destination is 1–2 lower (Δ =
                  −1/−2). Allowed forward, sideways, or backward. You may step
                  into empty if it’s within −1/−2.
                </li>
                <li>
                  <b>Capture (opponent):</b> you are strictly taller by 1–2; you
                  move on top and seize control.
                </li>
                <li>
                  <b>Backward restriction:</b> backward moves must be Step-Down
                  only (no backward across/climb).
                </li>
              </ul>

              <p className="text-slate-300">
                <b>Turn order:</b> Red moves first. Passing is not allowed if
                you have a legal move.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
