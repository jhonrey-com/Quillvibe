import type { AlarmRingtoneId } from './types';

export interface AlarmRingtoneSpec {
  id: AlarmRingtoneId;
  label: string;
  description: string;
}

export const ALARM_RINGTONES: readonly AlarmRingtoneSpec[] = [
  {
    id: 'warm-chime',
    label: 'Warm Studio Chime',
    description: 'Soft fifth-interval bell triad that fades out smoothly without jarring.',
  },
  {
    id: 'brass-bell',
    label: 'Desk Brass Bell',
    description: 'Clear warm desk bell strike with gentle harmonic shimmer.',
  },
  {
    id: 'wood-marimba',
    label: 'Rosewood Marimba',
    description: 'Rounded four-note wooden cadence suited for focused drafting sessions.',
  },
  {
    id: 'harbor-gong',
    label: 'Harbor Sanctuary Bell',
    description: 'Deep bronze resonance with a calm overtone sustain.',
  },
  {
    id: 'acoustic-arp',
    label: 'Dawn Guitar Arpeggio',
    description: 'Plucked four-string ascending chord with warm nylon envelope.',
  },
];

export interface AlarmSnapshot {
  armed: boolean;
  ringing: boolean;
  mode: 'clock' | 'countdown';
  label: string;
  targetTimestamp: number | null;
  remainingSeconds: number;
  ringtone: AlarmRingtoneId;
}

interface NoteEvent {
  freq: number;
  delay: number;
  duration: number;
  type: OscillatorType;
  gain: number;
  harmonicRatio?: number;
  harmonicGain?: number;
}

const RINGTONE_PATTERNS: Record<AlarmRingtoneId, NoteEvent[]> = {
  'warm-chime': [
    { freq: 523.25, delay: 0, duration: 0.9, type: 'sine', gain: 0.28, harmonicRatio: 2, harmonicGain: 0.08 },
    { freq: 659.25, delay: 0.24, duration: 0.9, type: 'sine', gain: 0.25, harmonicRatio: 2, harmonicGain: 0.06 },
    { freq: 783.99, delay: 0.48, duration: 1.25, type: 'sine', gain: 0.28, harmonicRatio: 2, harmonicGain: 0.08 },
    { freq: 1046.5, delay: 0.8, duration: 1.5, type: 'triangle', gain: 0.16 },
  ],
  'brass-bell': [
    { freq: 698.46, delay: 0, duration: 1.2, type: 'triangle', gain: 0.3, harmonicRatio: 2.4, harmonicGain: 0.12 },
    { freq: 698.46, delay: 0.55, duration: 1.35, type: 'triangle', gain: 0.28, harmonicRatio: 2.4, harmonicGain: 0.1 },
  ],
  'wood-marimba': [
    { freq: 392.0, delay: 0, duration: 0.35, type: 'sine', gain: 0.32 },
    { freq: 493.88, delay: 0.16, duration: 0.35, type: 'sine', gain: 0.3 },
    { freq: 587.33, delay: 0.32, duration: 0.38, type: 'sine', gain: 0.3 },
    { freq: 783.99, delay: 0.48, duration: 0.55, type: 'sine', gain: 0.28 },
  ],
  'harbor-gong': [
    { freq: 196.0, delay: 0, duration: 2.2, type: 'sine', gain: 0.36, harmonicRatio: 1.5, harmonicGain: 0.14 },
    { freq: 293.66, delay: 0.08, duration: 1.9, type: 'triangle', gain: 0.15 },
    { freq: 392.0, delay: 0.9, duration: 1.8, type: 'sine', gain: 0.18 },
  ],
  'acoustic-arp': [
    { freq: 293.66, delay: 0, duration: 0.75, type: 'triangle', gain: 0.24 },
    { freq: 440.0, delay: 0.18, duration: 0.75, type: 'triangle', gain: 0.22 },
    { freq: 554.37, delay: 0.36, duration: 0.85, type: 'triangle', gain: 0.22 },
    { freq: 659.25, delay: 0.54, duration: 1.15, type: 'sine', gain: 0.24 },
  ],
};

let sharedAudioCtx: AudioContext | null = null;
const activeGainNodes = new Set<GainNode>();

function getOrCreateAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
    sharedAudioCtx = new Ctor();
  }
  if (sharedAudioCtx.state === 'suspended') {
    void sharedAudioCtx.resume().catch(() => undefined);
  }
  return sharedAudioCtx;
}

export function stopActiveRingtone(): void {
  if (!sharedAudioCtx) return;
  const now = sharedAudioCtx.currentTime;
  for (const gain of activeGainNodes) {
    try {
      gain.gain.cancelScheduledValues(now);
      gain.gain.setTargetAtTime(0.0001, now, 0.04);
    } catch {
      // Ignore already stopped nodes
    }
  }
  activeGainNodes.clear();
}

export function playRingtonePreview(id: AlarmRingtoneId, volume = 0.65): void {
  const ctx = getOrCreateAudioContext();
  if (!ctx) return;

  const vol = Math.max(0.05, Math.min(1, volume));
  const pattern = RINGTONE_PATTERNS[id] ?? RINGTONE_PATTERNS['warm-chime'];
  const baseTime = ctx.currentTime + 0.02;

  for (const note of pattern) {
    const start = baseTime + note.delay;
    const end = start + note.duration;

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.0001, start);
    masterGain.gain.exponentialRampToValueAtTime(Math.max(0.001, note.gain * vol), start + 0.025);
    masterGain.gain.exponentialRampToValueAtTime(0.0001, end);
    masterGain.connect(ctx.destination);
    activeGainNodes.add(masterGain);

    const osc = ctx.createOscillator();
    osc.type = note.type;
    osc.frequency.setValueAtTime(note.freq, start);
    osc.connect(masterGain);
    osc.start(start);
    osc.stop(end + 0.05);
    osc.onended = () => {
      activeGainNodes.delete(masterGain);
      masterGain.disconnect();
    };

    if (note.harmonicRatio && note.harmonicGain) {
      const overtone = ctx.createOscillator();
      const overtoneGain = ctx.createGain();
      overtone.type = 'sine';
      overtone.frequency.setValueAtTime(note.freq * note.harmonicRatio, start);
      overtoneGain.gain.setValueAtTime(0.0001, start);
      overtoneGain.gain.exponentialRampToValueAtTime(Math.max(0.001, note.harmonicGain * vol), start + 0.02);
      overtoneGain.gain.exponentialRampToValueAtTime(0.0001, end);
      overtone.connect(overtoneGain);
      overtoneGain.connect(ctx.destination);
      overtone.start(start);
      overtone.stop(end + 0.05);
    }
  }
}

export function formatRemainingClock(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(clamped / 3600);
  const mins = Math.floor((clamped % 3600) / 60);
  const secs = clamped % 60;
  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export class AlarmController {
  private armed = false;
  private ringing = false;
  private mode: 'clock' | 'countdown' = 'countdown';
  private label = 'Writing Break';
  private targetTimestamp: number | null = null;
  private tickTimer: number | null = null;
  private chimeLoopTimer: number | null = null;
  private readonly listeners = new Set<(snap: AlarmSnapshot) => void>();
  private readonly getConfig: () => { ringtone: AlarmRingtoneId; volume: number };
  private readonly onTrigger: (snap: AlarmSnapshot) => void;

  constructor(options: {
    getConfig: () => { ringtone: AlarmRingtoneId; volume: number };
    onTrigger: (snap: AlarmSnapshot) => void;
  }) {
    this.getConfig = options.getConfig;
    this.onTrigger = options.onTrigger;
  }

  subscribe(fn: (snap: AlarmSnapshot) => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private emit(): void {
    const snap = this.getSnapshot();
    for (const fn of this.listeners) {
      fn(snap);
    }
  }

  getSnapshot(): AlarmSnapshot {
    const cfg = this.getConfig();
    const now = Date.now();
    const remSec =
      this.armed && this.targetTimestamp !== null
        ? Math.max(0, Math.ceil((this.targetTimestamp - now) / 1000))
        : 0;
    return {
      armed: this.armed,
      ringing: this.ringing,
      mode: this.mode,
      label: this.label,
      targetTimestamp: this.targetTimestamp,
      remainingSeconds: remSec,
      ringtone: cfg.ringtone,
    };
  }

  setCountdownAlarm(minutes: number, label = 'Writing Session Complete'): void {
    const cleanMins = Math.max(1, Math.min(720, Math.round(minutes)));
    this.stopLoops();
    this.armed = true;
    this.ringing = false;
    this.mode = 'countdown';
    this.label = label.trim() || 'Writing Session Complete';
    this.targetTimestamp = Date.now() + cleanMins * 60 * 1000;
    this.startTick();
    this.emit();
  }

  setClockAlarm(hhmm: string, label = 'Scheduled Writing Alarm'): boolean {
    const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
    if (!match) return false;
    const hours = Number(match[1]);
    const mins = Number(match[2]);
    if (hours < 0 || hours > 23 || mins < 0 || mins > 59) return false;

    const now = new Date();
    const target = new Date(now);
    target.setHours(hours, mins, 0, 0);
    if (target.getTime() <= now.getTime()) {
      target.setDate(target.getDate() + 1);
    }

    this.stopLoops();
    this.armed = true;
    this.ringing = false;
    this.mode = 'clock';
    this.label = label.trim() || 'Scheduled Writing Alarm';
    this.targetTimestamp = target.getTime();
    this.startTick();
    this.emit();
    return true;
  }

  snooze(minutes = 5): void {
    const prevLabel = this.label;
    this.dismiss();
    this.setCountdownAlarm(minutes, `${prevLabel} (Snoozed)`);
  }

  dismiss(): void {
    this.stopLoops();
    this.armed = false;
    this.ringing = false;
    this.targetTimestamp = null;
    stopActiveRingtone();
    this.emit();
  }

  destroy(): void {
    this.stopLoops();
    stopActiveRingtone();
    this.listeners.clear();
  }

  private startTick(): void {
    if (typeof window === 'undefined') return;
    if (this.tickTimer !== null) window.clearInterval(this.tickTimer);
    this.tickTimer = window.setInterval(() => {
      if (!this.armed || this.targetTimestamp === null) return;
      if (Date.now() >= this.targetTimestamp) {
        this.triggerNow();
        return;
      }
      this.emit();
    }, 1000);
  }

  private triggerNow(): void {
    if (this.tickTimer !== null) {
      window.clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    this.armed = false;
    this.ringing = true;
    const snap = this.getSnapshot();
    const playOnce = () => {
      if (!this.ringing) return;
      const cfg = this.getConfig();
      playRingtonePreview(cfg.ringtone, cfg.volume);
    };
    playOnce();
    if (typeof window !== 'undefined') {
      if (this.chimeLoopTimer !== null) window.clearInterval(this.chimeLoopTimer);
      this.chimeLoopTimer = window.setInterval(playOnce, 4500);
    }
    this.emit();
    this.onTrigger(snap);
  }

  private stopLoops(): void {
    if (typeof window === 'undefined') return;
    if (this.tickTimer !== null) {
      window.clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    if (this.chimeLoopTimer !== null) {
      window.clearInterval(this.chimeLoopTimer);
      this.chimeLoopTimer = null;
    }
  }
}
