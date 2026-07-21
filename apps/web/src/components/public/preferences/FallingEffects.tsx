"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";

type EffectType = "sakura" | "stars" | "snow" | "none";

// Global state (persists across pages within session)
let _effect: EffectType = "none";
const _listeners: (() => void)[] = [];

function isEffectType(value: string | null): value is EffectType {
  return value === "sakura" || value === "stars" || value === "snow" || value === "none";
}

function emitEffectChange() {
  _listeners.forEach((fn) => fn());
}

function subscribeEffect(listener: () => void) {
  _listeners.push(listener);
  return () => {
    const index = _listeners.indexOf(listener);
    if (index >= 0) _listeners.splice(index, 1);
  };
}

function getEffectSnapshot() {
  return _effect;
}

export function useEffectType(): [EffectType, (e: EffectType) => void] {
  const effect = useSyncExternalStore(
    subscribeEffect,
    getEffectSnapshot,
    getEffectSnapshot
  );

  useEffect(() => {
    const stored = localStorage.getItem("blog-effect");
    if (isEffectType(stored) && stored !== _effect) {
      _effect = stored;
      emitEffectChange();
    }
  }, []);

  return [
    effect,
    (e: EffectType) => {
      _effect = e;
      localStorage.setItem("blog-effect", e);
      emitEffectChange();
    },
  ];
}

interface Particle {
  id: number;
  left: number;
  delay: number;
  duration: number;
  size: number;
  rotation: number;
  sway: number;
}

function generateParticles(count: number): Particle[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 8,
    duration: 5 + Math.random() * 7,
    size: 6 + Math.random() * 14,
    rotation: Math.random() * 360,
    sway: -20 + Math.random() * 40,
  }));
}

export default function FallingEffects() {
  const [effect] = useEffectType();
  const particles = useMemo(
    () => (effect === "none" ? [] : generateParticles(35)),
    [effect]
  );

  if (effect === "none" || particles.length === 0) return null;

  const getStyle = (p: Particle): React.CSSProperties => {
    const base: React.CSSProperties = {
      position: "fixed",
      top: "-5%",
      left: `${p.left}%`,
      zIndex: 40,
      pointerEvents: "none",
      animation: `sakura-fall ${p.duration}s linear ${p.delay}s infinite`,
    };

    if (effect === "sakura") {
      return {
        ...base,
        width: `${p.size}px`,
        height: `${p.size}px`,
        background: `radial-gradient(circle, rgba(204,128,101,0.8) 0%, rgba(233,201,188,0.45) 70%)`,
        borderRadius: "50% 0 50% 0",
        transform: `rotate(${p.rotation}deg)`,
      };
    }

    if (effect === "stars") {
      const colors = ["#fbbf24", "#f59e0b", "#fcd34d", "#fef3c7", "#eab308"];
      return {
        ...base,
        width: `${p.size * 0.5}px`,
        height: `${p.size * 0.5}px`,
        background: colors[p.id % colors.length],
        borderRadius: "50%",
        boxShadow: `0 0 ${p.size * 0.3}px ${colors[p.id % colors.length]}`,
        animationDuration: `${p.duration * 1.5}s`,
      };
    }

    if (effect === "snow") {
      return {
        ...base,
        width: `${p.size * 0.7}px`,
        height: `${p.size * 0.7}px`,
        background: "rgba(255,255,255,0.8)",
        borderRadius: "50%",
        boxShadow: "0 0 3px rgba(255,255,255,0.5)",
        animationDuration: `${p.duration * 1.8}s`,
      };
    }

    return base;
  };

  return (
    <>
      {particles.map((p) => (
        <div key={p.id} style={getStyle(p)} />
      ))}
    </>
  );
}
