'use client';

import { CSSProperties, ReactNode, useEffect, useRef, useState } from 'react';

/* ═══════════════════════════════════════════════════════════
   Motion kit: Parallax · Reveal · SmoothScroll
   One shared rAF engine for all parallax targets.
   ═══════════════════════════════════════════════════════════ */

type ParallaxItem = {
  el: HTMLElement;
  speed: number;
  docTop: number;
  height: number;
};

const items = new Set<ParallaxItem>();
let listening = false;
let ticking = false;

function measure(item: ParallaxItem) {
  const rect = item.el.getBoundingClientRect();
  item.docTop = rect.top + window.scrollY;
  item.height = rect.height;
}

function apply() {
  const vh = window.innerHeight;
  const sy = window.scrollY;
  items.forEach((item) => {
    const center = item.docTop + item.height / 2 - sy - vh / 2;
    item.el.style.transform = `translate3d(0, ${(-center * item.speed).toFixed(2)}px, 0)`;
  });
}

function requestTick() {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    apply();
    ticking = false;
  });
}

function ensureListeners() {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  window.addEventListener('scroll', requestTick, { passive: true });
  window.addEventListener('resize', () => {
    items.forEach(measure);
    requestTick();
  });
}

export function Parallax({
  children,
  speed = 0.12,
  className = '',
  style,
}: {
  children?: ReactNode;
  speed?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    ensureListeners();
    const item: ParallaxItem = { el, speed, docTop: 0, height: 0 };
    measure(item);
    items.add(item);
    apply();
    return () => {
      items.delete(item);
    };
  }, [speed]);

  return (
    <div ref={ref} className={className} style={{ willChange: 'transform', ...style }}>
      {children}
    </div>
  );
}

/* ── Reveal: scroll-triggered entrance ─────────────────────── */

export function Reveal({
  children,
  delay = 0,
  y = 28,
  className = '',
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setVisible(true);
            obs.disconnect();
          }
        });
      },
      { threshold: 0.08, rootMargin: '0px 0px -48px 0px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translate3d(0,0,0)' : `translate3d(0, ${y}px, 0)`,
        transition: `opacity 0.8s cubic-bezier(0.16,1,0.3,1) ${delay}ms, transform 0.8s cubic-bezier(0.16,1,0.3,1) ${delay}ms`,
        willChange: 'opacity, transform',
      }}
    >
      {children}
    </div>
  );
}

/* ── SmoothScroll: lerp-based buttery wheel scrolling ──────── */

export function SmoothScroll() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if ('ontouchstart' in window && window.innerWidth < 1024) return;

    let target = window.scrollY;
    let current = target;
    let raf = 0;
    let animating = false;

    const maxScroll = () =>
      Math.max(0, document.documentElement.scrollHeight - window.innerHeight);

    const loop = () => {
      current += (target - current) * 0.105;
      if (Math.abs(target - current) < 0.5) {
        current = target;
        window.scrollTo(0, current);
        animating = false;
        return;
      }
      window.scrollTo(0, current);
      raf = requestAnimationFrame(loop);
    };

    const isScrollable = (node: Element) => {
      const style = window.getComputedStyle(node);
      return /(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 1;
    };

    const onWheel = (e: WheelEvent) => {
      if (e.deltaY === 0 || e.ctrlKey || e.defaultPrevented) return;
      let node: Element | null = e.target as Element | null;
      while (node && node !== document.body && node instanceof Element) {
        if (isScrollable(node)) return;
        node = node.parentElement;
      }
      e.preventDefault();
      target = Math.max(0, Math.min(target + e.deltaY, maxScroll()));
      if (!animating) {
        animating = true;
        current = window.scrollY;
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(loop);
      }
    };

    const onScroll = () => {
      if (!animating) target = window.scrollY;
    };

    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  return null;
}
