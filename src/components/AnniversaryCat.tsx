import { useRef, useState } from "react";

export type AnniversaryCatKind = "orange" | "black" | "siamese" | "tuxedo";

export const CAT_KINDS: AnniversaryCatKind[] = ["black", "siamese", "orange", "tuxedo"];

export function playCatAudio(kind: AnniversaryCatKind, reaction: "meow" | "purr") {
  const source = reaction === "purr" ? "/audio/purr-normalized.m4a" : `/audio/meow-${kind}.m4a`;
  const audio = new Audio(source);
  audio.volume = reaction === "purr" ? 0.55 : 0.72;
  void audio.play().catch(() => {
    // Some browsers still block audio despite the tap; the visual reaction remains.
  });
}

export function AnniversaryCat({
  kind,
  label,
  className = "",
  onReaction,
}: {
  kind: AnniversaryCatKind;
  label: string;
  className?: string;
  onReaction?: (reaction: "meow" | "purr") => void;
}) {
  const [reaction, setReaction] = useState<"meow" | "purr" | null>(null);
  const tapTimer = useRef<number | null>(null);

  function reactToTap(event: React.MouseEvent<SVGSVGElement>) {
    if (event.detail > 1) {
      if (tapTimer.current !== null) window.clearTimeout(tapTimer.current);
      tapTimer.current = null;
      triggerCatReaction("purr");
      return;
    }

    tapTimer.current = window.setTimeout(() => {
      triggerCatReaction("meow");
      tapTimer.current = null;
    }, 240);
  }

  function triggerCatReaction(nextReaction: "meow" | "purr") {
    setReaction(nextReaction);
    playCatAudio(kind, nextReaction);
    onReaction?.(nextReaction);
    window.setTimeout(() => setReaction((current) => (current === nextReaction ? null : current)), nextReaction === "purr" ? 1300 : 900);
  }

  return (
    <svg
      className={`anniversary-cat ${kind} ${className}${reaction ? ` ${reaction}` : ""}`}
      viewBox="0 0 180 180"
      role="button"
      tabIndex={0}
      aria-label={`${label}. Un toque para maullar, dos para ronronear.`}
      onClick={reactToTap}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        triggerCatReaction("meow");
      }}
    >
      <path className="cat-tail" d="M137 122c34 2 37-34 13-38-18-3-19 17-7 22" fill="none" strokeWidth="13" strokeLinecap="round" />
      <ellipse className="cat-body" cx="92" cy="120" rx="50" ry="43" />
      {kind === "siamese" ? <ellipse className="cat-chest" cx="91" cy="128" rx="25" ry="30" /> : null}
      {kind === "tuxedo" ? <ellipse className="tuxedo-chest" cx="91" cy="128" rx="28" ry="32" /> : null}
      <path className="cat-head" d="M48 71 42 29l30 19a58 58 0 0 1 39 0l29-19-6 43c5 10 7 20 5 31-4 25-25 40-50 39-25 0-45-16-48-40-2-11 1-22 7-31Z" />
      {kind === "tuxedo" ? (
        <>
          <path className="tuxedo-face" d="M85 47c-5 13-7 27-3 40l10 13 10-13c4-13 2-27-3-40l-7 14Z" />
          <ellipse className="tuxedo-muzzle" cx="92" cy="108" rx="27" ry="20" />
        </>
      ) : null}
      {kind === "siamese" ? (
        <>
          <path className="cat-ear-patches" d="M49 65 45 36l23 15Zm83 0 4-29-23 15Z" />
          <path className="cat-mask" d="M62 67c15-17 46-17 61 0 9 11 10 32 2 45-11 18-51 18-64 0-9-13-8-34 1-45Z" />
          <g className="lynx-stripes" fill="none" strokeWidth="4" strokeLinecap="round">
            <path d="m74 55 6 13" />
            <path d="m92 51 1 16" />
            <path d="m110 55-6 13" />
            <path d="m59 78 16 5" />
            <path d="m125 78-16 5" />
            <path d="m56 94 17 2" />
            <path d="m128 94-17 2" />
            <path d="m64 132-12 8" />
            <path d="m119 132 13 8" />
          </g>
        </>
      ) : null}
      {kind === "orange" ? (
        <g className="cat-stripes" fill="none" strokeWidth="6" strokeLinecap="round">
          <path d="m72 48 5 15" />
          <path d="m92 43 1 17" />
          <path d="m113 49-5 14" />
          <path d="m53 83 16 4" />
          <path d="m130 83-15 4" />
        </g>
      ) : null}
      <ellipse className="cat-eye" cx="74" cy="89" rx="6" ry="8" />
      <ellipse className="cat-eye" cx="109" cy="89" rx="6" ry="8" />
      <path className="cat-nose" d="m87 105 5 4 5-4-5-4Z" />
      <path className="cat-paw" d="M51 124c-13-2-24 2-32 11" fill="none" strokeWidth="12" strokeLinecap="round" />
      <path className="cat-smile" d="M92 109c-1 8-9 9-13 5m13-5c1 8 9 9 13 5" fill="none" strokeWidth="3" strokeLinecap="round" />
      <g className="cat-whiskers" fill="none" strokeWidth="2" strokeLinecap="round">
        <path d="M73 108 40 101" />
        <path d="M73 115 38 117" />
        <path d="m110 108 34-7" />
        <path d="m110 115 35 2" />
      </g>
      <text className={`cat-tap-paw ${kind}`} x="92" y="43" textAnchor="middle" aria-hidden="true">🐾</text>
    </svg>
  );
}
