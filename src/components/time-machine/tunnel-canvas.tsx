"use client";

import { useEffect, useRef, type MutableRefObject } from "react";
import { createTunnel, type Tunnel } from "./tunnel";

/** The tunnel backdrop. `apiRef` lets the player drive its speed without re-rendering; nothing runs while `running` is false. */
export function TunnelCanvas({ apiRef, running, calm }: { apiRef: MutableRefObject<Tunnel | null>; running: boolean; calm: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const runningRef = useRef(running);
  useEffect(() => {
    runningRef.current = running;
  });

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const tunnel = createTunnel(element, { coarse: window.matchMedia("(pointer: coarse)").matches });
    apiRef.current = tunnel;
    tunnel.resize();
    if (calm) tunnel.still();
    else if (runningRef.current) tunnel.start();
    const observer = new ResizeObserver(() => {
      tunnel.resize();
      if (calm || !runningRef.current) tunnel.still();
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      tunnel.dispose();
      apiRef.current = null;
    };
  }, [apiRef, calm]);

  useEffect(() => {
    if (calm) return;
    if (running) apiRef.current?.start();
    else apiRef.current?.stop();
  }, [running, calm, apiRef]);

  return <canvas ref={canvas} className="rw-tunnel" aria-hidden />;
}
