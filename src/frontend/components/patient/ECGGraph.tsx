import React, { useRef, useEffect } from 'react';

interface ECGGraphProps {
  bpm: number;
  isEmergency?: boolean;
  ecgData?: number[];
  isSensorConnected?: boolean;
  isCritical?: boolean;
}

// Helper to extract only the new points from a sliding window or batch of ECG values
const getNewPoints = (prev: number[], next: number[]): number[] => {
  if (!prev || prev.length === 0) return next;
  if (!next || next.length === 0) return [];
  
  const maxOverlap = Math.min(prev.length, next.length);
  for (let overlap = maxOverlap; overlap > 0; overlap--) {
    let match = true;
    for (let k = 0; k < overlap; k++) {
      if (prev[prev.length - overlap + k] !== next[k]) {
        match = false;
        break;
      }
    }
    if (match) {
      return next.slice(overlap);
    }
  }
  return next;
};

/**
 * ECGGraph — renders a real-time scrolling ECG trace on a clinical pink medical grid.
 */
const ECGGraph: React.FC<ECGGraphProps> = ({ bpm, isEmergency = false, ecgData, isSensorConnected = true, isCritical = false }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointsRef = useRef<number[]>([]);
  
  // Real-time queue and tracking refs
  const dataQueueRef = useRef<number[]>([]);
  const prevEcgDataRef = useRef<number[]>([]);
  const scalingHistoryRef = useRef<number[]>([]);

  // Append new incoming ECG points to the queue whenever ecgData changes
  useEffect(() => {
    const prevEcgData = prevEcgDataRef.current;
    const currentEcgData = ecgData || [];
    if (JSON.stringify(prevEcgData) !== JSON.stringify(currentEcgData)) {
      const newPoints = getNewPoints(prevEcgData, currentEcgData);
      if (newPoints.length > 0) {
        dataQueueRef.current.push(...newPoints);
        // Limit queue size to avoid cumulative latency
        if (dataQueueRef.current.length > 1000) {
          dataQueueRef.current = dataQueueRef.current.slice(-500);
        }
      }
      prevEcgDataRef.current = currentEcgData;
    }
  }, [ecgData]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let lastY: number | null = null;

    /* ── Canvas sizing ─────────────────────────────────────────────── */
    const resizeCanvas = () => {
      const container = canvas.parentElement;
      if (!container) return;
      const dpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();
      canvas.width  = rect.width  * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
      canvas.style.width  = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;

      const w = Math.ceil(rect.width);
      const mid = rect.height / 2;
      if (pointsRef.current.length === 0) {
        pointsRef.current = new Array(w).fill(mid);
      } else {
        while (pointsRef.current.length < w) pointsRef.current.push(mid);
        while (pointsRef.current.length > w) pointsRef.current.shift();
      }
    };

    const resizeObserver = new ResizeObserver(() => {
      resizeCanvas();
    });
    const container = canvas.parentElement;
    if (container) {
      resizeObserver.observe(container);
    }
    resizeCanvas();

    /* ── Derived state booleans ────────────────────────────────────── */
    const hasRealData = Array.isArray(ecgData) && ecgData.length > 0 && ecgData.some(v => v !== 0);
    const isGraphActive = isSensorConnected && (hasRealData || isCritical) && bpm > 0;

    /* ── Main draw loop ────────────────────────────────────────────── */
    const draw = () => {
      const W   = Math.ceil(canvas.width  / (window.devicePixelRatio || 1));
      const H   = Math.ceil(canvas.height / (window.devicePixelRatio || 1));
      const mid = H / 2;

      // Sync display points array length with canvas pixel width
      while (pointsRef.current.length < W) pointsRef.current.push(mid);
      while (pointsRef.current.length > W) pointsRef.current.shift();

      // Clear screen
      ctx.clearRect(0, 0, W, H);

      /* ── Clinical ECG Paper Grid (As Uploaded in Image) ──────────── */
      ctx.fillStyle = '#fdf8f8';
      ctx.fillRect(0, 0, W, H);

      // Minor grid lines (10px spacing = 1mm)
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.08)';
      ctx.lineWidth = 0.5;
      for (let x = 0; x < W; x += 10) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      for (let y = 0; y < H; y += 10) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
      
      // Major grid lines (50px spacing = 5mm)
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.22)';
      ctx.lineWidth = 1.0;
      for (let x = 0; x < W; x += 50) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      for (let y = 0; y < H; y += 50) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

      /* ── Waveform ingestion ──────────────────────────────────────── */
      // Dynamically adjust speed based on queue length to avoid lag or starvation
      const qLen = dataQueueRef.current.length;
      let speed = 1;
      if (qLen > 300) {
        speed = 4;
      } else if (qLen > 150) {
        speed = 3;
      } else if (qLen > 50) {
        speed = 2;
      } else if (qLen > 10) {
        speed = 1;
      } else if (qLen === 0) {
        speed = 1;
      }

      for (let s = 0; s < speed; s++) {
        let y = mid;

        if (!isGraphActive) {
          y = mid;
        } else if (dataQueueRef.current.length > 0) {
          const raw = dataQueueRef.current.shift()!;
          
          scalingHistoryRef.current.push(raw);
          if (scalingHistoryRef.current.length > 500) {
            scalingHistoryRef.current.shift();
          }

          const vals = scalingHistoryRef.current;
          const maxVal = Math.max(...vals);
          const minVal = Math.min(...vals);
          const range = maxVal - minVal || 1;
          const baseline = vals.reduce((sum, v) => sum + v, 0) / vals.length;
          const sampleDeDrifted = raw - baseline;

          const margin = H * 0.20;
          const drawH  = H - margin * 2;
          const scaleFactor = range < 300 ? (range / 1500) : 1.0;
          
          // Using negative subtraction to keep wave orientation normal (spikes point UP)
          y = mid - (sampleDeDrifted / range) * drawH * 0.8 * scaleFactor;
        } else {
          y = lastY !== null ? lastY : mid;
        }

        // Low-pass filter (Exponential Moving Average)
        if (lastY === null) {
          lastY = y;
        } else {
          y = lastY * 0.85 + y * 0.15;
          lastY = y;
        }

        // Remove simulated biological base noise to strictly reflect live sensor data
        // We only plot the true processed ADC reading
        pointsRef.current.push(y);
        pointsRef.current.shift();
      }

      /* ── Draw the thin, sharp dark red ECG trace ─────────────────── */
      ctx.save();
      ctx.beginPath();
      ctx.strokeStyle = isGraphActive ? '#800000' : '#94a3b8'; // dark crimson maroon when active, slate when flat
      ctx.lineWidth   = 1.5;
      ctx.lineCap     = 'round';
      ctx.lineJoin    = 'round';

      for (let i = 0; i < pointsRef.current.length; i++) {
        if (i === 0) ctx.moveTo(i, pointsRef.current[i]);
        else         ctx.lineTo(i, pointsRef.current[i]);
      }
      ctx.stroke();
      ctx.restore();

      /* ── Display Status Message Overlay ───────────────────────────── */
      if (!isSensorConnected) {
        ctx.shadowBlur = 0;
        ctx.fillStyle  = '#94a3b8';
        ctx.font       = 'bold 11px system-ui, sans-serif';
        ctx.textAlign  = 'center';
        ctx.fillText('Waiting for ECG signal.', W / 2, mid - 14);
      } else if (!hasRealData && !isCritical) {
        ctx.shadowBlur = 0;
        ctx.fillStyle  = '#94a3b8';
        ctx.font       = 'bold 11px system-ui, sans-serif';
        ctx.textAlign  = 'center';
        ctx.fillText('Waiting for ECG signal.', W / 2, mid - 14);
      } else if (isCritical && !hasRealData) {
        ctx.shadowBlur = 0;
        ctx.fillStyle  = '#ef4444';
        ctx.font       = 'bold 11px system-ui, sans-serif';
        ctx.textAlign  = 'center';
        ctx.fillText('CRITICAL: HEART FLATLINE ALERT', W / 2, mid - 14);
      }

      animationId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(animationId);
      resizeObserver.disconnect();
    };
  }, [bpm, isEmergency, ecgData, isSensorConnected, isCritical]);

  return (
    <div className="w-full h-full bg-[#fdf8f8] rounded-[24px] overflow-hidden relative border border-slate-100 shadow-inner">
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
};

export default ECGGraph;
