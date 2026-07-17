import React, { useRef, useEffect, useState } from 'react';

interface ECGGraphProps {
  bpm: number;
  isEmergency?: boolean;
  ecgData?: number[];
  isSensorConnected?: boolean;
  isCritical?: boolean;
}

// Predefined medically inspired ECG Template Generator (P-Q-R-S-T wave model using Gaussian components)
const generateHeartbeatTemplate = (type: string, bpm: number = 72, Fs: number = 250): number[] => {
  const rrIntervalMs = 60000 / bpm;
  let samplesPerBeat = Math.floor((rrIntervalMs / 1000) * Fs);
  
  if (type === 'AFib') {
    // Irregular beats: vary samples per beat randomly between 0.75x and 1.3x of average
    const variation = 0.75 + Math.random() * 0.55;
    samplesPerBeat = Math.floor(samplesPerBeat * variation);
  }

  const beat = new Array(samplesPerBeat).fill(2000);

  if (type === 'VTach') {
    // Broad, monomorphic, rapid QRS
    const t_r = Math.floor(samplesPerBeat * 0.40);
    const w_r = Math.max(3, Math.floor(samplesPerBeat * 0.08)); // Wide QRS
    for (let i = 0; i < samplesPerBeat; i++) {
      const val_r = 700 * Math.exp(-Math.pow((i - t_r) / w_r, 2));
      const val_s = -400 * Math.exp(-Math.pow((i - (t_r + w_r)) / w_r, 2));
      beat[i] = 2000 + val_r + val_s;
    }
    return beat;
  }

  if (type === 'AFib') {
    // No P wave, fibrillating baseline, irregular QRS
    const t_r = Math.floor(samplesPerBeat * 0.40);
    const t_q = t_r - Math.max(1, Math.floor(samplesPerBeat * 0.04));
    const t_s = t_r + Math.max(1, Math.floor(samplesPerBeat * 0.04));
    const t_t = Math.floor(samplesPerBeat * 0.65);

    const w_q = Math.max(1, Math.floor(samplesPerBeat * 0.015));
    const w_r = Math.max(1, Math.floor(samplesPerBeat * 0.01));
    const w_s = Math.max(1, Math.floor(samplesPerBeat * 0.015));
    const w_t = Math.max(4, Math.floor(samplesPerBeat * 0.08));

    for (let i = 0; i < samplesPerBeat; i++) {
      const val_q = -150 * Math.exp(-Math.pow((i - t_q) / w_q, 2));
      const val_r = 800 * Math.exp(-Math.pow((i - t_r) / w_r, 2));
      const val_s = -250 * Math.exp(-Math.pow((i - t_s) / w_s, 2));
      const val_t = 180 * Math.exp(-Math.pow((i - t_t) / w_t, 2));

      // Fibrillation oscillations (15-25 Hz)
      const fibOsc = 25 * Math.sin(2 * Math.PI * (18 / Fs) * i) + (Math.random() - 0.5) * 15;

      beat[i] = 2000 + val_q + val_r + val_s + val_t + fibOsc;
    }
    return beat;
  }

  if (type === 'PVC') {
    // Premature Wide Ventricular beat (early, bizarre, inverted T)
    const t_r = Math.floor(samplesPerBeat * 0.25); // Early
    const w_r = Math.max(4, Math.floor(samplesPerBeat * 0.09)); // Wide
    const t_t = Math.floor(samplesPerBeat * 0.55);
    const w_t = Math.max(6, Math.floor(samplesPerBeat * 0.12));

    for (let i = 0; i < samplesPerBeat; i++) {
      // Inverted R & deep S-like T
      const val_r = 650 * Math.exp(-Math.pow((i - t_r) / w_r, 2));
      const val_s = -450 * Math.exp(-Math.pow((i - (t_r + w_r)) / w_r, 2));
      const val_t = -200 * Math.exp(-Math.pow((i - t_t) / w_t, 2)); // Inverted T

      beat[i] = 2000 + val_r + val_s + val_t;
    }
    return beat;
  }

  // Normal / Bradycardia / Tachycardia (standard P-Q-R-S-T)
  const t_p = Math.floor(samplesPerBeat * 0.15);
  const t_q = Math.floor(samplesPerBeat * 0.35);
  const t_r = Math.floor(samplesPerBeat * 0.40);
  const t_s = Math.floor(samplesPerBeat * 0.43);
  const t_t = Math.floor(samplesPerBeat * 0.65);

  const w_p = Math.max(2, Math.floor(samplesPerBeat * 0.05));
  const w_q = Math.max(1, Math.floor(samplesPerBeat * 0.015));
  const w_r = Math.max(1, Math.floor(samplesPerBeat * 0.01));
  const w_s = Math.max(1, Math.floor(samplesPerBeat * 0.015));
  const w_t = Math.max(4, Math.floor(samplesPerBeat * 0.08));

  for (let i = 0; i < samplesPerBeat; i++) {
    const val_p = 100 * Math.exp(-Math.pow((i - t_p) / w_p, 2));
    const val_q = -150 * Math.exp(-Math.pow((i - t_q) / w_q, 2));
    const val_r = 800 * Math.exp(-Math.pow((i - t_r) / w_r, 2));
    const val_s = -250 * Math.exp(-Math.pow((i - t_s) / w_s, 2));
    const val_t = 200 * Math.exp(-Math.pow((i - t_t) / w_t, 2));

    beat[i] = 2000 + val_p + val_q + val_r + val_s + val_t;
  }
  return beat;
};

// Helper to extract only new incoming points from a sliding window
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

// P-Q-R-S-T Peak & Wave Detection logic on the scrolling canvas display buffer
const detectECGWaves = (points: number[]) => {
  const rPeaks: number[] = [];
  const qPeaks: number[] = [];
  const sPeaks: number[] = [];
  const pPeaks: number[] = [];
  const tPeaks: number[] = [];

  const w = points.length;
  // Locate R peaks: sharp local minima in y-coordinate (spikes pointing UP on screen)
  for (let i = 15; i < w - 15; i++) {
    const val = points[i];
    if (val < points[i-1] && val < points[i+1] && val < points[i-2] && val < points[i+2]) {
      // Must be a significant upward spike (Y coordinate is small)
      if (val < 45) {
        rPeaks.push(i);
      }
    }
  }

  rPeaks.forEach(rIdx => {
    // Q wave is local minimum right before R peak (within 8 samples)
    let qIdx = rIdx - 2;
    let maxQY = points[qIdx];
    for (let j = rIdx - 8; j < rIdx; j++) {
      if (j >= 0 && points[j] > maxQY) {
        maxQY = points[j];
        qIdx = j;
      }
    }
    if (qIdx !== rIdx) qPeaks.push(qIdx);

    // S wave is local minimum right after R peak (within 8 samples)
    let sIdx = rIdx + 2;
    let maxSY = points[sIdx];
    for (let j = rIdx + 1; j < rIdx + 8; j++) {
      if (j < w && points[j] > maxSY) {
        maxSY = points[j];
        sIdx = j;
      }
    }
    if (sIdx !== rIdx) sPeaks.push(sIdx);

    // P wave is local maximum before Q wave (within 10-25 samples)
    if (qIdx > 0) {
      let pIdx = qIdx - 8;
      if (pIdx >= 0) {
        let minPY = points[pIdx];
        for (let j = qIdx - 22; j < qIdx - 4; j++) {
          if (j >= 0 && points[j] < minPY) {
            minPY = points[j];
            pIdx = j;
          }
        }
        pPeaks.push(pIdx);
      }
    }

    // T wave is local maximum after S wave (within 10-35 samples)
    if (sIdx < w) {
      let tIdx = sIdx + 12;
      if (tIdx < w) {
        let minTY = points[tIdx];
        for (let j = sIdx + 8; j < sIdx + 32; j++) {
          if (j < w && points[j] < minTY) {
            minTY = points[j];
            tIdx = j;
          }
        }
        tPeaks.push(tIdx);
      }
    }
  });

  return { rPeaks, qPeaks, sPeaks, pPeaks, tPeaks };
};

const ECGGraph: React.FC<ECGGraphProps> = ({ bpm, isEmergency = false, ecgData, isSensorConnected = true, isCritical = false }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointsRef = useRef<number[]>([]);
  
  const dataQueueRef = useRef<number[]>([]);
  const prevEcgDataRef = useRef<number[]>([]);
  const scalingHistoryRef = useRef<number[]>([]);

  // Local demo template state that cycles for variety in fallback mode
  const [demoTemplate, setDemoTemplate] = useState<'NSR' | 'Bradycardia' | 'Tachycardia' | 'AFib' | 'VTach' | 'PVC'>('NSR');

  // Cycle demo templates every 8 seconds when fallback mode is active
  useEffect(() => {
    const hasReal = Array.isArray(ecgData) && ecgData.length > 0 && ecgData.some(v => v !== 0 && v !== 2000);
    if (!isSensorConnected || !hasReal) {
      const list = ['NSR', 'Bradycardia', 'Tachycardia', 'AFib', 'VTach', 'PVC'] as const;
      const interval = setInterval(() => {
        setDemoTemplate(prev => {
          const idx = list.indexOf(prev);
          const nextIdx = (idx + 1) % list.length;
          return list[nextIdx];
        });
      }, 8000);
      return () => clearInterval(interval);
    }
  }, [isSensorConnected, ecgData]);

  // Feed fallback medically inspired ECG templates to the queue
  useEffect(() => {
    const hasReal = Array.isArray(ecgData) && ecgData.length > 0 && ecgData.some(v => v !== 0 && v !== 2000);
    if (isSensorConnected && !hasReal) {
      const demoBpm = demoTemplate === 'Bradycardia' ? 48 : (demoTemplate === 'Tachycardia' ? 120 : (demoTemplate === 'VTach' ? 165 : (demoTemplate === 'AFib' ? 95 : 72)));
      const interval = setInterval(() => {
        if (dataQueueRef.current.length < 150) {
          if (demoTemplate === 'PVC') {
            // PVC pattern mixes normal sinus beats with premature ventricular contractions
            const isPvc = Math.random() < 0.35;
            const beat = generateHeartbeatTemplate(isPvc ? 'PVC' : 'NSR', isPvc ? 85 : 72, 250);
            dataQueueRef.current.push(...beat);
          } else {
            const beat = generateHeartbeatTemplate(demoTemplate, demoBpm, 250);
            dataQueueRef.current.push(...beat);
          }
        }
      }, 150);
      return () => clearInterval(interval);
    }
  }, [isSensorConnected, ecgData, demoTemplate]);

  // Queue up raw live ECG samples when device is connected and data flows
  useEffect(() => {
    const hasReal = Array.isArray(ecgData) && ecgData.length > 0 && ecgData.some(v => v !== 0 && v !== 2000);
    if (isSensorConnected && hasReal) {
      const prevEcgData = prevEcgDataRef.current;
      const currentEcgData = ecgData || [];
      if (JSON.stringify(prevEcgData) !== JSON.stringify(currentEcgData)) {
        const newPoints = getNewPoints(prevEcgData, currentEcgData);
        if (newPoints.length > 0) {
          dataQueueRef.current.push(...newPoints);
          if (dataQueueRef.current.length > 1000) {
            dataQueueRef.current = dataQueueRef.current.slice(-500);
          }
        }
        prevEcgDataRef.current = currentEcgData;
      }
    }
  }, [ecgData, isSensorConnected]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let lastY: number | null = null;

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

    const hasRealData = Array.isArray(ecgData) && ecgData.length > 0 && ecgData.some(v => v !== 0 && v !== 2000);
    // Graph is active if sensor is connected and we either have real sensor streams or fallback mode is running
    const isGraphActive = isSensorConnected;
    const isFallbackMode = isSensorConnected && !hasRealData;

    const draw = () => {
      const W   = Math.ceil(canvas.width  / (window.devicePixelRatio || 1));
      const H   = Math.ceil(canvas.height / (window.devicePixelRatio || 1));
      const mid = H / 2;

      while (pointsRef.current.length < W) pointsRef.current.push(mid);
      while (pointsRef.current.length > W) pointsRef.current.shift();

      ctx.clearRect(0, 0, W, H);

      // Pink clinical ECG graph paper background
      ctx.fillStyle = '#fdf8f8';
      ctx.fillRect(0, 0, W, H);

      // 1mm minor grids
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.08)';
      ctx.lineWidth = 0.5;
      for (let x = 0; x < W; x += 10) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      for (let y = 0; y < H; y += 10) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
      
      // 5mm major grids
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.22)';
      ctx.lineWidth = 1.0;
      for (let x = 0; x < W; x += 50) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      for (let y = 0; y < H; y += 50) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

      // Speed control to absorb data packets smoothly without lag
      const qLen = dataQueueRef.current.length;
      let speed = 1;
      if (qLen > 300) speed = 4;
      else if (qLen > 150) speed = 3;
      else if (qLen > 50) speed = 2;

      for (let s = 0; s < speed; s++) {
        let y = mid;

        if (!isGraphActive) {
          // Flatline flat wave if device is disconnected
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
          
          y = mid - (sampleDeDrifted / range) * drawH * 0.82 * scaleFactor;
        } else {
          y = lastY !== null ? lastY : mid;
        }

        // Filter out sudden noise jumps using Exponential Moving Average
        if (lastY === null) {
          lastY = y;
        } else {
          y = lastY * 0.80 + y * 0.20;
          lastY = y;
        }

        pointsRef.current.push(y);
        pointsRef.current.shift();
      }

      // Draw dark red clinical ECG waveform trace
      ctx.save();
      ctx.beginPath();
      ctx.strokeStyle = isGraphActive ? '#800000' : '#64748b'; // Dark red when active, slate when flat
      ctx.lineWidth   = 1.6;
      ctx.lineCap     = 'round';
      ctx.lineJoin    = 'round';

      for (let i = 0; i < pointsRef.current.length; i++) {
        if (i === 0) ctx.moveTo(i, pointsRef.current[i]);
        else         ctx.lineTo(i, pointsRef.current[i]);
      }
      ctx.stroke();
      ctx.restore();

      // Realtime P-Q-R-S-T peaks rendering on active graph
      if (isGraphActive && (hasRealData || isFallbackMode)) {
        const { rPeaks, qPeaks, sPeaks, pPeaks, tPeaks } = detectECGWaves(pointsRef.current);
        ctx.font = 'bold 8px system-ui, sans-serif';
        ctx.textAlign = 'center';

        pPeaks.forEach(idx => {
          ctx.fillStyle = '#2563eb'; // Blue P
          ctx.beginPath(); ctx.arc(idx, pointsRef.current[idx], 2, 0, 2*Math.PI); ctx.fill();
          ctx.fillText('P', idx, pointsRef.current[idx] - 6);
        });
        qPeaks.forEach(idx => {
          ctx.fillStyle = '#ca8a04'; // Yellow Q
          ctx.beginPath(); ctx.arc(idx, pointsRef.current[idx], 2, 0, 2*Math.PI); ctx.fill();
          ctx.fillText('Q', idx, pointsRef.current[idx] + 9);
        });
        rPeaks.forEach(idx => {
          ctx.fillStyle = '#dc2626'; // Red R
          ctx.beginPath(); ctx.arc(idx, pointsRef.current[idx], 2.5, 0, 2*Math.PI); ctx.fill();
          ctx.fillText('R', idx, pointsRef.current[idx] - 8);
        });
        sPeaks.forEach(idx => {
          ctx.fillStyle = '#9333ea'; // Purple S
          ctx.beginPath(); ctx.arc(idx, pointsRef.current[idx], 2, 0, 2*Math.PI); ctx.fill();
          ctx.fillText('S', idx, pointsRef.current[idx] + 9);
        });
        tPeaks.forEach(idx => {
          ctx.fillStyle = '#059669'; // Green T
          ctx.beginPath(); ctx.arc(idx, pointsRef.current[idx], 2, 0, 2*Math.PI); ctx.fill();
          ctx.fillText('T', idx, pointsRef.current[idx] - 6);
        });
      }

      // Display Status Message Overlays
      if (!isSensorConnected) {
        ctx.fillStyle = 'rgba(254, 242, 242, 0.85)';
        ctx.fillRect(0, 0, W, H);
        
        ctx.shadowBlur = 0;
        ctx.fillStyle  = '#dc2626';
        ctx.font       = 'bold 11px system-ui, sans-serif';
        ctx.textAlign  = 'center';
        ctx.fillText('DEVICE DISCONNECTED - NO ECG SIGNAL', W / 2, mid + 4);
      } else if (isFallbackMode) {
        ctx.fillStyle  = 'rgba(15, 23, 42, 0.75)';
        ctx.fillRect(10, 10, 310, 20);

        ctx.fillStyle  = '#f8fafc';
        ctx.font       = 'bold 9px system-ui, sans-serif';
        ctx.textAlign  = 'left';
        let label = 'NORMAL SINUS RHYTHM (72 BPM)';
        if (demoTemplate === 'Bradycardia') label = 'SINUS BRADYCARDIA (48 BPM)';
        else if (demoTemplate === 'Tachycardia') label = 'SINUS TACHYCARDIA (120 BPM)';
        else if (demoTemplate === 'AFib') label = 'ATRIAL FIBRILLATION (95 BPM)';
        else if (demoTemplate === 'VTach') label = 'VENTRICULAR TACHYCARDIA (165 BPM)';
        else if (demoTemplate === 'PVC') label = 'PVC PATTERN (85 BPM)';

        ctx.fillText(`DEMONSTRATION DATA - ${label} (FALLBACK MODE)`, 16, 23);
      }

      animationId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(animationId);
      resizeObserver.disconnect();
    };
  }, [bpm, isEmergency, ecgData, isSensorConnected, isCritical, demoTemplate]);

  return (
    <div className="w-full h-full bg-[#fdf8f8] rounded-[24px] overflow-hidden relative border border-slate-100 shadow-inner">
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
};

export default ECGGraph;
