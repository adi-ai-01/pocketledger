import React from 'react';

/**
 * Theme-specific SVGs matching the reference screenshots:
 * - Stark Direwolf (Fantasy)
 * - Elden Ring Great Rune Sigil (Elden)
 * - S-Rank Hunter Badge (Cyber)
 * - Pixel Heart, Pixel Iron/Diamond Sword, Minecraft XP Bar, Chest, Redstone (Pixel)
 * - Crossed Swords for Elden & Pixel Split buttons
 * - Crown for Fantasy FAB
 * - Arcane Magic Summoning Circle for Cyber FAB
 */

// ── Fantasy Stark Direwolf Sigil ──
export function StarkSigil({ className = "w-8 h-8 text-neutral-400" }) {
  return (
    <svg className={className} viewBox="0 0 100 100" fill="currentColor">
      <path d="M85 30 L72 38 L65 28 L55 35 L48 24 L38 32 L30 20 L22 35 L12 42 L18 52 L26 50 L22 62 L32 60 L38 72 L46 64 L54 78 L62 66 L74 72 L72 58 L82 56 L78 46 L88 42 Z" opacity="0.85" />
      <path d="M38 38 L42 42 L36 44 Z" fill="#121216" />
      <circle cx="40" cy="40" r="2.5" fill="#c5a059" />
    </svg>
  );
}

// ── Elden Ring Great Rune Seal ──
export function EldenRuneSeal({ className = "w-8 h-8 text-amber-400" }) {
  return (
    <svg className={className} viewBox="0 0 100 100" fill="none" stroke="currentColor">
      {/* Central arc and rings */}
      <circle cx="50" cy="45" r="28" strokeWidth="2.5" opacity="0.85" />
      <circle cx="35" cy="48" r="24" strokeWidth="2" opacity="0.75" />
      <circle cx="65" cy="48" r="24" strokeWidth="2" opacity="0.75" />
      <circle cx="50" cy="62" r="22" strokeWidth="2" opacity="0.75" />
      <path d="M50 10 L50 90" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M20 52 Q 50 20 80 52" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M15 72 Q 50 40 85 72" strokeWidth="2" fill="none" strokeLinecap="round" />
      <circle cx="50" cy="22" r="3" fill="currentColor" />
    </svg>
  );
}

// ── Cyber S-Rank Visual Badge ──
export function SRankBadge() {
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-[#00f0ff] bg-[#0c1333]/90 shadow-[0_0_10px_rgba(0,240,255,0.45)]">
      <svg className="w-3.5 h-3.5 text-[#00f0ff]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
      <span className="text-xs font-bold tracking-wider text-[#00f0ff] drop-shadow-[0_0_6px_rgba(0,240,255,0.8)] font-sans">
        S-Rank
      </span>
    </div>
  );
}

// ── Crossed Greatswords (for Elden Ring Split action) ──
export function CrossedSwords({ className = "w-6 h-6 text-amber-400" }) {
  return (
    <svg className={className} viewBox="0 0 64 64" fill="currentColor">
      {/* Sword 1 - diagonal down-right */}
      <g transform="rotate(45 32 32)">
        <rect x="30" y="6" width="4" height="38" rx="1" fill="currentColor" />
        <polygon points="32,2 29,8 35,8" fill="currentColor" />
        <rect x="22" y="44" width="20" height="3" rx="1" fill="#c5a059" />
        <rect x="30.5" y="47" width="3" height="11" rx="1" fill="#755f30" />
        <circle cx="32" cy="60" r="3" fill="#c5a059" />
      </g>
      {/* Sword 2 - diagonal up-right */}
      <g transform="rotate(-45 32 32)">
        <rect x="30" y="6" width="4" height="38" rx="1" fill="currentColor" opacity="0.9" />
        <polygon points="32,2 29,8 35,8" fill="currentColor" />
        <rect x="22" y="44" width="20" height="3" rx="1" fill="#c5a059" />
        <rect x="30.5" y="47" width="3" height="11" rx="1" fill="#755f30" />
        <circle cx="32" cy="60" r="3" fill="#c5a059" />
      </g>
    </svg>
  );
}

// ── Minecraft Crossed Diamond Swords (for Pixel Split action) ──
export function MinecraftCrossedSwords({ className = "w-7 h-7" }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none">
      {/* Pixelated sword 1 */}
      <g>
        <rect x="22" y="2" width="4" height="4" fill="#55ffff" />
        <rect x="18" y="6" width="4" height="4" fill="#55ffff" />
        <rect x="14" y="10" width="4" height="4" fill="#55ffff" />
        <rect x="10" y="14" width="4" height="4" fill="#00aaaa" />
        <rect x="6" y="18" width="4" height="4" fill="#aa7733" />
        <rect x="8" y="16" width="3" height="3" fill="#553311" />
        <rect x="4" y="20" width="3" height="3" fill="#553311" />
        <rect x="2" y="22" width="4" height="4" fill="#553311" />
      </g>
      {/* Pixelated sword 2 */}
      <g>
        <rect x="6" y="2" width="4" height="4" fill="#55ffff" />
        <rect x="10" y="6" width="4" height="4" fill="#55ffff" />
        <rect x="14" y="10" width="4" height="4" fill="#55ffff" />
        <rect x="18" y="14" width="4" height="4" fill="#00aaaa" />
        <rect x="22" y="18" width="4" height="4" fill="#aa7733" />
        <rect x="20" y="16" width="3" height="3" fill="#553311" />
        <rect x="24" y="20" width="3" height="3" fill="#553311" />
        <rect x="26" y="22" width="4" height="4" fill="#553311" />
      </g>
    </svg>
  );
}

// ── Pixel Red Heart ──
export function PixelHeart({ className = "w-4 h-4" }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="currentColor">
      <path
        d="M2 3 h4 v2 h-4 z M10 3 h4 v2 h-4 z M0 5 h16 v4 h-16 z M2 9 h12 v2 h-12 z M4 11 h8 v2 h-8 z M6 13 h4 v2 h-4 z"
        fill="#ff2222"
      />
      {/* Highlight */}
      <rect x="2" y="5" width="2" height="2" fill="#ff8888" />
    </svg>
  );
}

// ── Pixel Sword (Header) ──
export function PixelSword({ className = "w-4 h-4" }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none">
      <rect x="12" y="1" width="3" height="3" fill="#e0e0e0" />
      <rect x="9" y="4" width="3" height="3" fill="#b0b0b0" />
      <rect x="6" y="7" width="3" height="3" fill="#888888" />
      <rect x="4" y="9" width="2" height="2" fill="#553311" />
      <rect x="2" y="11" width="3" height="3" fill="#885522" />
    </svg>
  );
}

// ── Pixel Chest (for Recent Card) ──
export function PixelChest({ className = "w-8 h-8" }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none">
      {/* Outer wooden body */}
      <rect x="2" y="4" width="28" height="24" fill="#8f5728" stroke="#331c07" strokeWidth="2" />
      {/* Lid line */}
      <line x1="2" y1="12" x2="30" y2="12" stroke="#2a1403" strokeWidth="2" />
      {/* Chest latch / lock */}
      <rect x="13" y="10" width="6" height="6" fill="#dedede" stroke="#444" strokeWidth="1" />
      <rect x="15" y="13" width="2" height="2" fill="#222" />
      {/* Wood planks grain */}
      <rect x="5" y="7" width="22" height="2" fill="#a46632" />
      <rect x="5" y="16" width="22" height="2" fill="#78451c" />
      <rect x="5" y="22" width="22" height="2" fill="#693c18" />
    </svg>
  );
}

// ── Fantasy Crown (for FAB) ──
export function CrownIcon({ className = "w-5 h-5 text-amber-400" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M2 19h20v2H2v-2zm1-8l4.5 4L12 6l4.5 9L21 11v6H3v-6zm3.5 2L12 9.5 17.5 13 19 12v3H5v-3l1.5 1z" />
      <circle cx="12" cy="4" r="1.5" />
      <circle cx="3" cy="9" r="1.5" />
      <circle cx="21" cy="9" r="1.5" />
    </svg>
  );
}

// ── Cyber Arcane Summoning Array Watermark ──
export function ArcaneWatermark({ className = "w-full h-full text-cyan-400/20" }) {
  return (
    <svg className={className} viewBox="0 0 200 200" fill="none" stroke="currentColor">
      <circle cx="100" cy="100" r="90" strokeWidth="1.5" />
      <circle cx="100" cy="100" r="75" strokeWidth="1" strokeDasharray="4 4" />
      <circle cx="100" cy="100" r="55" strokeWidth="1.5" />
      <polygon points="100,10 178,145 22,145" strokeWidth="1" />
      <polygon points="100,190 22,55 178,55" strokeWidth="1" />
      <circle cx="100" cy="100" r="30" strokeWidth="1" />
      <circle cx="100" cy="100" r="10" strokeWidth="1.5" />
    </svg>
  );
}
