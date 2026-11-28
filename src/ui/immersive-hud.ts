import {
  ALARM_RINGTONES,
  AlarmController,
  formatRemainingClock,
  playRingtonePreview,
} from '../core/alarm';
import type { AppActions } from '../core/app-context';
import { getProjectWordCount } from '../core/manuscript';
import type { AlarmRingtoneId } from '../core/types';
import { el, icon, svgEl } from './dom';

export interface ImmersiveHudHandle {
  sync(): void;
  openAlarmPopover(): void;
  showRingingModal(label: string): void;
  destroy(): void;
}

function createGripSvg(): SVGSVGElement {
  const svg = svgEl('svg', {
    width: 10,
    height: 14,
    viewBox: '0 0 10 14',
    fill: 'currentColor',
    'aria-hidden': 'true',
  });
  for (const cy of [3, 7, 11]) {
    for (const cx of [3, 7]) {
      svg.appendChild(svgEl('circle', { cx, cy, r: 1.15 }));
    }
  }
  return svg;
}

function createHudMicroIcon(kind: 'play' | 'pause' | 'reset' | 'minus' | 'plus'): SVGSVGElement {
  const svg = svgEl('svg', {
    width: 12,
    height: 12,
    viewBox: '0 0 24 24',
    fill: kind === 'play' || kind === 'pause' ? 'currentColor' : 'none',
    stroke: kind === 'play' || kind === 'pause' ? 'none' : 'currentColor',
    'stroke-width': '2',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
  });
  if (kind === 'play') {
    svg.appendChild(svgEl('path', { d: 'M7 5l12 7-12 7V5z' }));
  } else if (kind === 'pause') {
    svg.append(
      svgEl('rect', { x: 6, y: 5, width: 4, height: 14, rx: 1 }),
      svgEl('rect', { x: 14, y: 5, width: 4, height: 14, rx: 1 }),
    );
  } else if (kind === 'reset') {
    svg.append(
      svgEl('path', { d: 'M3 12a9 9 0 1 0 3-6.7L3 8' }),
      svgEl('path', { d: 'M3 3v5h5' }),
    );
  } else if (kind === 'minus') {
    svg.appendChild(svgEl('path', { d: 'M5 12h14' }));
  } else {
    svg.append(svgEl('path', { d: 'M12 5v14' }), svgEl('path', { d: 'M5 12h14' }));
  }
  return svg;
}

function formatWallClock(): string {
  const now = new Date();
  return now.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface BatteryLike {
  level: number;
  charging: boolean;
  addEventListener?(type: string, listener: () => void): void;
  removeEventListener?(type: string, listener: () => void): void;
}

function formatWallDate(): string {
  return new Date().toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function resolveBackgroundMediaTitle(): string {
  if (typeof navigator === 'undefined') return '';
  const meta = (navigator as Navigator & { mediaSession?: { metadata?: { title?: string; artist?: string } | null } })
    .mediaSession?.metadata;
  if (!meta?.title) return '';
  const cleanTitle = meta.title.trim();
  if (!cleanTitle) return '';
  return cleanTitle.length > 22 ? `${cleanTitle.slice(0, 21)}…` : cleanTitle;
}

export function mountImmersiveHud(
  actions: AppActions,
  alarm: AlarmController,
  sprintControls: { toggleSprint(): void; resetSprint(): void },
): ImmersiveHudHandle {
  const hudEl = el('aside', {
    className: 'qv-immersive-hud',
    attrs: { role: 'region', 'aria-label': 'Immersive Focus Controls' },
  });
  document.body.appendChild(hudEl);

  let batteryState: { pct: number; charging: boolean } | null = null;
  let batteryHandle: BatteryLike | null = null;
  const syncBattery = () => {
    if (!batteryHandle) return;
    batteryState = {
      pct: Math.max(0, Math.min(100, Math.round(batteryHandle.level * 100))),
      charging: Boolean(batteryHandle.charging),
    };
  };
  if (typeof navigator !== 'undefined') {
    const getBat = (navigator as Navigator & { getBattery?: () => Promise<BatteryLike> }).getBattery;
    if (typeof getBat === 'function') {
      void getBat
        .call(navigator)
        .then((bat) => {
          batteryHandle = bat;
          syncBattery();
          bat.addEventListener?.('levelchange', () => {
            syncBattery();
            if (actions.getState().immersiveMode) syncHudContents();
          });
          bat.addEventListener?.('chargingchange', () => {
            syncBattery();
            if (actions.getState().immersiveMode) syncHudContents();
          });
          if (actions.getState().immersiveMode) syncHudContents();
        })
        .catch(() => {
          batteryState = null;
        });
    }
  }

  // Top-edge mouse hover dropdown bar (Windows Virtual Desktop style)
  let topDropPinned = false;
  let hudHiddenByUser = false;
  const topStripHoverZone = el('div', {
    className: 'qv-imm-top-sensor',
    attrs: { 'aria-hidden': 'true' },
  });
  const topStripDrawer = el('div', {
    className: 'qv-imm-top-dropdown',
    attrs: { role: 'toolbar', 'aria-label': 'Immersive Screen Top Controls' },
  });
  document.body.append(topStripHoverZone, topStripDrawer);

  const showTopDropdown = () => {
    if (!actions.getState().immersiveMode) return;
    topStripDrawer.classList.add('is-open');
  };
  let topHideTimer: number | null = null;
  const scheduleHideTopDropdown = () => {
    if (topDropPinned) return;
    if (topHideTimer) window.clearTimeout(topHideTimer);
    topHideTimer = window.setTimeout(() => {
      if (!topStripDrawer.matches(':hover') && !topStripHoverZone.matches(':hover')) {
        topStripDrawer.classList.remove('is-open');
      }
    }, 240);
  };
  topStripHoverZone.addEventListener('mouseenter', showTopDropdown);
  topStripDrawer.addEventListener('mouseenter', () => {
    if (topHideTimer) window.clearTimeout(topHideTimer);
    showTopDropdown();
  });
  topStripHoverZone.addEventListener('mouseleave', scheduleHideTopDropdown);
  topStripDrawer.addEventListener('mouseleave', scheduleHideTopDropdown);

  const onWindowMouseMove = (e: MouseEvent) => {
    if (!actions.getState().immersiveMode) return;
    if (e.clientY <= 12) {
      if (topHideTimer) window.clearTimeout(topHideTimer);
      showTopDropdown();
    }
  };
  window.addEventListener('mousemove', onWindowMouseMove, { passive: true });

  const applyHudPosition = () => {
    const s = actions.getState().settings;
    const hudW = Math.max(160, hudEl.offsetWidth);
    const hudH = Math.max(34, hudEl.offsetHeight);
    if (s.immersiveHudX >= 0) {
      const maxX = Math.max(8, window.innerWidth - hudW - 8);
      const maxY = Math.max(8, window.innerHeight - hudH - 8);
      hudEl.style.left = `${Math.min(maxX, Math.max(8, s.immersiveHudX))}px`;
      hudEl.style.top = `${Math.min(maxY, Math.max(8, s.immersiveHudY))}px`;
      hudEl.style.transform = 'translate3d(0, 0, 0)';
    } else {
      const maxY = Math.max(8, window.innerHeight - hudH - 8);
      hudEl.style.left = '50%';
      hudEl.style.top = `${Math.min(maxY, Math.max(10, s.immersiveHudY || 12))}px`;
      hudEl.style.transform = 'translate3d(-50%, 0, 0)';
    }
  };

  let draggingHud = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;
  const startHudDrag = (e: PointerEvent) => {
    if (e.button !== 0) return;
    draggingHud = true;
    const rect = hudEl.getBoundingClientRect();
    dragOffsetX = e.clientX - rect.left;
    dragOffsetY = e.clientY - rect.top;
    hudEl.classList.add('is-dragging');
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    e.preventDefault();
  };
  window.addEventListener('pointermove', (e) => {
    if (!draggingHud) return;
    const maxX = Math.max(8, window.innerWidth - Math.max(160, hudEl.offsetWidth) - 8);
    const maxY = Math.max(8, window.innerHeight - Math.max(34, hudEl.offsetHeight) - 8);
    const nextX = Math.round(Math.min(maxX, Math.max(8, e.clientX - dragOffsetX)));
    const nextY = Math.round(Math.min(maxY, Math.max(8, e.clientY - dragOffsetY)));
    hudEl.style.left = `${nextX}px`;
    hudEl.style.top = `${nextY}px`;
    hudEl.style.transform = 'translate3d(0, 0, 0)';
  });
  window.addEventListener('pointerup', () => {
    if (!draggingHud) return;
    draggingHud = false;
    hudEl.classList.remove('is-dragging');
    const rect = hudEl.getBoundingClientRect();
    actions.updateSettings({
      immersiveHudX: Math.round(rect.left),
      immersiveHudY: Math.round(rect.top),
    });
  });

  const wallClockEl = el('span', { className: 'qv-imm-clock', text: formatWallClock() });
  const wallDateEl = el('span', { className: 'qv-imm-metric', text: formatWallDate() });
  const targetPctEl = el('span', { className: 'qv-imm-metric', text: '' });
  const batteryTextEl = el('span', { className: 'qv-imm-metric', text: '' });
  const mediaTextEl = el('span', { className: 'qv-imm-metric', text: '' });
  const sprintTextEl = el('span', { className: 'qv-imm-metric', text: '' });
  const sprintBtnEl = el('button', {
    className: 'qv-imm-icon-btn',
    attrs: { type: 'button', 'aria-label': 'Start writing sprint', title: 'Start writing sprint' },
    on: { click: () => sprintControls.toggleSprint() },
  });
  const wordsEl = el('span', { className: 'qv-imm-metric', text: '' });
  const alarmBtnLabel = el('span', { className: 'qv-imm-metric', text: '' });
  const alarmBtn = el(
    'button',
    {
      className: 'qv-imm-icon-btn qv-imm-alarm-btn',
      attrs: { type: 'button', 'aria-label': 'Configure writing alarm clock', title: 'Writing alarm' },
      on: { click: () => openAlarmPopover() },
    },
    icon('alarm', 13),
    alarmBtnLabel,
  );

  const renderTopStripControls = () => {
    const state = actions.getState();
    topStripDrawer.replaceChildren(
      el('span', { className: 'qv-imm-top-label', text: state.project.title || 'Quillvibe' }),
      el('span', { className: 'qv-imm-sep', attrs: { 'aria-hidden': 'true' } }),
      el(
        'div',
        { className: 'qv-imm-actions' },
        el('button', {
          className: `qv-imm-pill-btn${!hudHiddenByUser ? ' is-active' : ''}`,
          text: hudHiddenByUser ? 'Show Bar' : 'Hide Bar',
          attrs: { type: 'button' },
          on: {
            click: () => {
              hudHiddenByUser = !hudHiddenByUser;
              syncHudContents();
            },
          },
        }),
        el('button', {
          className: 'qv-imm-pill-btn',
          text: state.settings.immersiveHudCollapsed ? 'Expand' : 'Collapse',
          attrs: { type: 'button' },
          on: {
            click: () => {
              actions.updateSettings({ immersiveHudCollapsed: !state.settings.immersiveHudCollapsed });
              syncHudContents();
            },
          },
        }),
        el('button', {
          className: 'qv-imm-pill-btn',
          text: 'Center',
          attrs: { type: 'button' },
          on: {
            click: () => {
              hudHiddenByUser = false;
              actions.updateSettings({ immersiveHudX: -1, immersiveHudY: 12 });
              syncHudContents();
            },
          },
        }),
        el('button', {
          className: 'qv-imm-pill-btn',
          text: 'Alarm',
          attrs: { type: 'button' },
          on: { click: () => openAlarmPopover() },
        }),
        el('span', { className: 'qv-imm-sep', attrs: { 'aria-hidden': 'true' } }),
        el(
          'button',
          {
            className: 'qv-imm-exit-btn',
            attrs: { type: 'button', title: 'Exit Fullscreen (F11)' },
            on: { click: () => void actions.toggleImmersiveMode(false) },
          },
          icon('fullscreen-exit', 12),
          el('span', { text: 'Exit F11' }),
        ),
      ),
    );
  };

  const syncHudContents = () => {
    const state = actions.getState();
    const { settings, immersiveMode, project } = state;
    topStripHoverZone.classList.toggle('is-visible', immersiveMode);
    if (!immersiveMode) {
      topStripDrawer.classList.remove('is-open');
      hudEl.classList.remove('is-visible');
      return;
    }

    renderTopStripControls();
    hudEl.classList.toggle('is-visible', !hudHiddenByUser);
    hudEl.classList.toggle('is-collapsed', settings.immersiveHudCollapsed);
    if (hudHiddenByUser) return;

    hudEl.replaceChildren();
    wallClockEl.textContent = formatWallClock();

    const dragHandle = el(
      'button',
      {
        className: 'qv-imm-grip',
        attrs: { type: 'button', 'aria-label': 'Drag to move Immersive Bar', title: 'Drag to move Focus Bar' },
        on: { pointerdown: startHudDrag },
      },
      createGripSvg(),
    );

    const collapseBtn = el(
      'button',
      {
        className: 'qv-imm-icon-btn',
        attrs: {
          type: 'button',
          'aria-label': settings.immersiveHudCollapsed ? 'Expand focus bar' : 'Collapse focus bar',
          title: settings.immersiveHudCollapsed ? 'Expand bar' : 'Collapse bar',
        },
        on: {
          click: () => {
            actions.updateSettings({ immersiveHudCollapsed: !settings.immersiveHudCollapsed });
            syncHudContents();
          },
        },
      },
      createHudMicroIcon(settings.immersiveHudCollapsed ? 'plus' : 'minus'),
    );

    hudEl.appendChild(dragHandle);

    if (settings.immersiveHudCollapsed) {
      const compactParts: HTMLElement[] = [];
      if (settings.immersiveShowClock) {
        compactParts.push(
          el('div', { className: 'qv-imm-group' }, icon('clock', 12), wallClockEl),
          el('span', { className: 'qv-imm-sep', attrs: { 'aria-hidden': 'true' } }),
        );
      }
      hudEl.append(
        ...compactParts,
        el(
          'div',
          { className: 'qv-imm-actions' },
          collapseBtn,
          el(
            'button',
            {
              className: 'qv-imm-exit-btn is-compact',
              attrs: { type: 'button', 'aria-label': 'Exit Immersive Mode (F11)', title: 'Exit Fullscreen (F11)' },
              on: { click: () => void actions.toggleImmersiveMode(false) },
            },
            icon('fullscreen-exit', 12),
          ),
        ),
      );
      requestAnimationFrame(applyHudPosition);
      return;
    }

    const metricGroups: HTMLElement[] = [];

    if (settings.immersiveShowClock) {
      metricGroups.push(
        el(
          'div',
          { className: 'qv-imm-group', attrs: { title: 'Current local time' } },
          icon('clock', 12),
          wallClockEl,
        ),
      );
    }

    if (settings.immersiveShowDate) {
      wallDateEl.textContent = formatWallDate();
      metricGroups.push(
        el(
          'div',
          { className: 'qv-imm-group', attrs: { title: 'Today' } },
          icon('calendar', 12),
          wallDateEl,
        ),
      );
    }

    if (settings.immersiveShowTimer) {
      const total = getProjectWordCount(project);
      const delta = total - state.sprintStartWords;
      const sign = delta >= 0 ? `+${delta}w` : `${delta}w`;
      sprintTextEl.textContent = `${formatRemainingClock(state.sprintRemainingSec)} (${sign})`;
      sprintBtnEl.replaceChildren(createHudMicroIcon(state.sprintRunning ? 'pause' : 'play'));
      sprintBtnEl.setAttribute('aria-label', state.sprintRunning ? 'Pause writing sprint' : 'Start writing sprint');
      sprintBtnEl.setAttribute('title', state.sprintRunning ? 'Pause sprint' : 'Start sprint');
      sprintBtnEl.classList.toggle('is-active', state.sprintRunning);
      metricGroups.push(
        el(
          'div',
          { className: 'qv-imm-group qv-imm-sprint', attrs: { title: 'Writing sprint timer and net words' } },
          sprintTextEl,
          sprintBtnEl,
          el(
            'button',
            {
              className: 'qv-imm-icon-btn',
              attrs: { type: 'button', 'aria-label': 'Reset writing sprint', title: 'Reset sprint' },
              on: { click: () => sprintControls.resetSprint() },
            },
            createHudMicroIcon('reset'),
          ),
        ),
      );
    }

    if (settings.immersiveShowWords || settings.immersiveShowTarget) {
      const total = getProjectWordCount(project);
      const pct = project.wordTarget > 0 ? Math.min(999, Math.round((total / project.wordTarget) * 100)) : 0;
      if (settings.immersiveShowWords) {
        wordsEl.textContent = `${total.toLocaleString()} / ${project.wordTarget.toLocaleString()}`;
        metricGroups.push(
          el(
            'div',
            {
              className: 'qv-imm-group',
              attrs: { title: `${total.toLocaleString()} of ${project.wordTarget.toLocaleString()} words` },
            },
            icon('quill', 12),
            wordsEl,
          ),
        );
      }
      if (settings.immersiveShowTarget) {
        targetPctEl.textContent = `${pct}%`;
        metricGroups.push(
          el(
            'div',
            {
              className: 'qv-imm-group',
              attrs: { title: `Word target progress: ${pct}%` },
            },
            icon('target', 12),
            targetPctEl,
          ),
        );
      }
    }

    if (settings.immersiveShowBattery && batteryState) {
      batteryTextEl.textContent = batteryState.charging ? `${batteryState.pct}%⚡` : `${batteryState.pct}%`;
      metricGroups.push(
        el(
          'div',
          {
            className: 'qv-imm-group',
            attrs: { title: batteryState.charging ? `Battery ${batteryState.pct}% (Charging)` : `Battery ${batteryState.pct}%` },
          },
          icon('battery', 12),
          batteryTextEl,
        ),
      );
    }

    if (settings.immersiveShowMedia) {
      const trackTitle = resolveBackgroundMediaTitle();
      const volPct = Math.round(settings.alarmVolume * 100);
      mediaTextEl.textContent = trackTitle ? `${trackTitle} (${volPct}%)` : `${volPct}%`;
      metricGroups.push(
        el(
          'button',
          {
            className: 'qv-imm-group qv-imm-media-btn',
            attrs: {
              type: 'button',
              title: trackTitle ? `Playing: ${trackTitle} (Click to adjust audio volume)` : `Audio volume ${volPct}% (Click to cycle)`,
            },
            on: {
              click: () => {
                const steps = [0.25, 0.5, 0.75, 1.0];
                const cur = actions.getState().settings.alarmVolume;
                const next = steps.find((v) => v > cur + 0.05) ?? steps[0];
                actions.updateSettings({ alarmVolume: next });
                syncHudContents();
              },
            },
          },
          icon(trackTitle ? 'music' : 'volume', 12),
          mediaTextEl,
        ),
      );
    }

    if (metricGroups.length > 0) {
      const metricsWrap = el('div', { className: 'qv-imm-metrics' });
      metricGroups.forEach((grp, idx) => {
        if (idx > 0) {
          metricsWrap.appendChild(el('span', { className: 'qv-imm-sep', attrs: { 'aria-hidden': 'true' } }));
        }
        metricsWrap.appendChild(grp);
      });
      hudEl.append(
        metricsWrap,
        el('span', { className: 'qv-imm-sep qv-imm-sep-major', attrs: { 'aria-hidden': 'true' } }),
      );
    }

    const actionsWrap = el('div', { className: 'qv-imm-actions' });

    if (settings.immersiveShowAlarm) {
      const snap = alarm.getSnapshot();
      alarmBtnLabel.textContent = snap.armed ? formatRemainingClock(snap.remainingSeconds) : '';
      alarmBtnLabel.style.display = snap.armed ? '' : 'none';
      alarmBtn.classList.toggle('is-active', snap.armed || snap.ringing);
      alarmBtn.setAttribute('title', snap.armed ? `Alarm armed (${formatRemainingClock(snap.remainingSeconds)})` : 'Set writing alarm');
      actionsWrap.appendChild(alarmBtn);
    }

    const openHudCustomizePopover = () => {
      const existingPop = document.getElementById('qv-imm-customize-pop');
      if (existingPop) {
        existingPop.remove();
        return;
      }
      const st = actions.getState().settings;
      const toggles: Array<{ key: keyof typeof st; label: string }> = [
        { key: 'immersiveShowClock', label: 'Clock' },
        { key: 'immersiveShowDate', label: 'Date' },
        { key: 'immersiveShowTimer', label: 'Sprint Timer' },
        { key: 'immersiveShowWords', label: 'Word Count' },
        { key: 'immersiveShowTarget', label: 'Target %' },
        { key: 'immersiveShowBattery', label: 'Device Battery' },
        { key: 'immersiveShowMedia', label: 'Media & Volume' },
        { key: 'immersiveShowAlarm', label: 'Alarm' },
      ];
      const pop = el(
        'div',
        { className: 'qv-imm-customize-pop', id: 'qv-imm-customize-pop', attrs: { role: 'dialog', 'aria-label': 'Customize Immersive Bar' } },
        el(
          'div',
          { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' } },
          el('strong', { text: 'Customize Bar', style: { fontSize: '12px' } }),
          el('button', {
            className: 'bv-mini-btn',
            text: 'Done',
            attrs: { type: 'button' },
            on: { click: () => pop.remove() },
          }),
        ),
        ...toggles.map((t) => {
          const chk = el('input', {
            className: 'bv-lever',
            attrs: { type: 'checkbox', role: 'switch', checked: Boolean(actions.getState().settings[t.key]) },
            on: {
              change: () => {
                actions.updateSettings({ [t.key]: chk.checked });
                syncHudContents();
              },
            },
          });
          return el('label', { className: 'bv-check-row', style: { fontSize: '12px' } }, chk, el('span', { text: t.label }));
        }),
      );
      const r = hudEl.getBoundingClientRect();
      pop.style.left = `${Math.round(Math.max(12, Math.min(window.innerWidth - 240, r.right - 224)))}px`;
      pop.style.top = `${Math.round(Math.min(window.innerHeight - 280, r.bottom + 8))}px`;
      document.body.appendChild(pop);
    };

    actionsWrap.append(
      el(
        'button',
        {
          className: 'qv-imm-icon-btn',
          attrs: { type: 'button', 'aria-label': 'Customize immersive widgets', title: 'Customize Immersive Bar' },
          on: { click: openHudCustomizePopover },
        },
        icon('settings', 13),
      ),
      collapseBtn,
      el(
        'button',
        {
          className: 'qv-imm-icon-btn',
          attrs: { type: 'button', 'aria-label': 'Hide focus bar', title: 'Hide bar (move mouse to top edge to restore)' },
          on: {
            click: () => {
              hudHiddenByUser = true;
              syncHudContents();
            },
          },
        },
        icon('eye-off', 13),
      ),
      el(
        'button',
        {
          className: 'qv-imm-exit-btn',
          attrs: { type: 'button', 'aria-label': 'Exit Immersive Mode (F11)', title: 'Exit Fullscreen (F11)' },
          on: { click: () => void actions.toggleImmersiveMode(false) },
        },
        icon('fullscreen-exit', 12),
        el('span', { text: 'Exit' }),
      ),
    );

    hudEl.appendChild(actionsWrap);
    requestAnimationFrame(applyHudPosition);
  };

  const clockInterval = window.setInterval(() => {
    if (actions.getState().immersiveMode) {
      wallClockEl.textContent = formatWallClock();
      if (actions.getState().settings.immersiveShowTimer) {
        const s = actions.getState();
        const delta = getProjectWordCount(s.project) - s.sprintStartWords;
        sprintTextEl.textContent = `${formatRemainingClock(s.sprintRemainingSec)} (${delta >= 0 ? '+' : ''}${delta}w)`;
      }
    }
  }, 1000);

  const openAlarmPopover = () => {
    const existing = document.getElementById('qv-alarm-popover-modal');
    if (existing) {
      existing.remove();
      return;
    }

    const state = actions.getState();
    const snap = alarm.getSnapshot();
    const defaultTime = new Date(Date.now() + 30 * 60 * 1000);
    const defaultHHMM = `${String(defaultTime.getHours()).padStart(2, '0')}:${String(defaultTime.getMinutes()).padStart(2, '0')}`;

    const labelIn = el('input', {
      className: 'bv-input',
      attrs: {
        type: 'text',
        value: snap.armed ? snap.label : 'Chapter Break',
        placeholder: 'Alarm note…',
      },
    });
    const timeIn = el('input', {
      className: 'bv-input',
      attrs: { type: 'time', value: defaultHHMM },
    });
    const minsIn = el('input', {
      className: 'bv-input',
      attrs: { type: 'number', min: 1, max: 720, value: 25 },
    });
    const toneSel = el(
      'select',
      {
        className: 'bv-input',
        on: {
          change: () => {
            const id = toneSel.value as AlarmRingtoneId;
            actions.updateSettings({ alarmRingtone: id });
            playRingtonePreview(id, actions.getState().settings.alarmVolume);
          },
        },
      },
      ...ALARM_RINGTONES.map((rt) =>
        el('option', {
          text: rt.label,
          attrs: { value: rt.id, selected: state.settings.alarmRingtone === rt.id },
        }),
      ),
    );

    const closePop = () => backdrop.remove();
    const backdrop = el(
      'div',
      {
        className: 'bv-modal-backdrop',
        id: 'qv-alarm-popover-modal',
        on: {
          click: (e) => {
            if (e.target === backdrop) closePop();
          },
        },
      },
      el(
        'div',
        {
          className: 'bv-modal qv-alarm-modal',
          attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Writing Alarm Clock' },
        },
        el(
          'div',
          { className: 'bv-panel-head' },
          el('span', { className: 'bv-panel-title', text: 'Writing Alarm Clock & Ringtones' }),
          el('button', {
            className: 'bv-mini-btn',
            text: 'Close',
            attrs: { type: 'button' },
            on: { click: closePop },
          }),
        ),
        el(
          'div',
          { className: 'bv-modal-body', style: { gap: '10px' } },
          el(
            'div',
            { className: 'bv-field' },
            el('label', { className: 'bv-label', text: 'Alarm Label' }),
            labelIn,
          ),
          el(
            'div',
            { className: 'bv-two-col' },
            el(
              'section',
              { className: 'bv-cork-card' },
              el('span', { className: 'bv-panel-title', text: 'Quick Countdown (Minutes)' }),
              el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
                ...[15, 25, 45, 60].map((m) =>
                  el('button', {
                    className: 'bv-mini-btn',
                    text: `${m}m`,
                    attrs: { type: 'button' },
                    on: {
                      click: () => {
                        alarm.setCountdownAlarm(m, labelIn.value);
                        actions.notify(`Alarm set for ${m} minutes`);
                        closePop();
                      },
                    },
                  }),
                ),
              ),
              el(
                'div',
                { style: { display: 'flex', gap: '6px', marginTop: '6px' } },
                minsIn,
                el('button', {
                  className: 'bv-btn bv-btn-primary',
                  text: 'Start Countdown',
                  attrs: { type: 'button' },
                  on: {
                    click: () => {
                      const mins = Number(minsIn.value) || 25;
                      alarm.setCountdownAlarm(mins, labelIn.value);
                      actions.notify(`Alarm set for ${mins} minutes`);
                      closePop();
                    },
                  },
                }),
              ),
            ),
            el(
              'section',
              { className: 'bv-cork-card' },
              el('span', { className: 'bv-panel-title', text: 'Wall-Clock Time' }),
              timeIn,
              el('button', {
                className: 'bv-btn bv-btn-primary',
                text: 'Set Clock Alarm',
                attrs: { type: 'button' },
                on: {
                  click: () => {
                    if (alarm.setClockAlarm(timeIn.value, labelIn.value)) {
                      actions.notify(`Alarm armed for ${timeIn.value}`);
                      closePop();
                    } else {
                      actions.notify('Enter a valid HH:MM time.');
                    }
                  },
                },
              }),
            ),
          ),
          el(
            'section',
            { className: 'bv-cork-card' },
            el('span', { className: 'bv-panel-title', text: 'Ringtone Sound' }),
            el(
              'div',
              { style: { display: 'flex', gap: '8px', alignItems: 'center' } },
              toneSel,
              el('button', {
                className: 'bv-btn',
                text: 'Preview Ringtone',
                attrs: { type: 'button' },
                on: {
                  click: () => {
                    const s = actions.getState().settings;
                    playRingtonePreview(s.alarmRingtone, s.alarmVolume);
                  },
                },
              }),
              snap.armed
                ? el('button', {
                    className: 'bv-btn',
                    text: 'Cancel Active Alarm',
                    attrs: { type: 'button' },
                    on: {
                      click: () => {
                        alarm.dismiss();
                        actions.notify('Active alarm cancelled.');
                        closePop();
                      },
                    },
                  })
                : null,
            ),
          ),
        ),
      ),
    );
    document.body.appendChild(backdrop);
  };

  const showRingingModal = (label: string) => {
    const existing = document.getElementById('qv-alarm-ring-modal');
    if (existing) existing.remove();

    const closeRing = () => backdrop.remove();
    const backdrop = el(
      'div',
      {
        className: 'bv-modal-backdrop',
        id: 'qv-alarm-ring-modal',
      },
      el(
        'div',
        {
          className: 'bv-modal qv-alarm-ring-modal',
          attrs: { role: 'alertdialog', 'aria-modal': 'true', 'aria-label': 'Writing Alarm Ringing' },
        },
        el(
          'div',
          { className: 'qv-alarm-ring-body' },
          el('div', { className: 'qv-alarm-ring-icon' }, icon('bell', 28)),
          el('h3', { text: label || 'Writing Alarm' }),
          el('p', { className: 'bv-label', text: `Local time: ${formatWallClock()}` }),
          el(
            'div',
            { style: { display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '8px' } },
            el('button', {
              className: 'bv-btn',
              text: 'Snooze 5 min',
              attrs: { type: 'button' },
              on: {
                click: () => {
                  alarm.snooze(5);
                  closeRing();
                  actions.notify('Alarm snoozed for 5 minutes');
                },
              },
            }),
            el('button', {
              className: 'bv-btn bv-btn-primary',
              text: 'Dismiss Alarm',
              attrs: { type: 'button' },
              on: {
                click: () => {
                  alarm.dismiss();
                  closeRing();
                },
              },
            }),
          ),
        ),
      ),
    );
    document.body.appendChild(backdrop);
  };

  const unsub = alarm.subscribe(() => syncHudContents());

  return {
    sync: syncHudContents,
    openAlarmPopover,
    showRingingModal,
    destroy: () => {
      window.clearInterval(clockInterval);
      window.removeEventListener('mousemove', onWindowMouseMove);
      unsub();
      hudEl.remove();
      topStripHoverZone.remove();
      topStripDrawer.remove();
    },
  };
}
