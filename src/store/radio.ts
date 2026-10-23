// SPDX-License-Identifier: AGPL-3.0-or-later
// dmr-web - A DMR radio in the browser
// Copyright (C) 2026 Jacob McSwain
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
// The source code is available at <https://github.com/USA-RedDragon/dmr-web>

import { defineStore } from 'pinia';
import { computed, reactive, ref, shallowRef } from 'vue';

import { loadModule, removeModule, saveModule, sha256Hex } from '@/lib/ambeStore';
import { RadioClient } from '@/radio/client';
import type { FromWorker, LinkState, RadioEvent } from '@/radio/protocol';
import { webTransportSupported } from '@/radio/transport';

import { useMessages } from './messages';
import { rptoOptions, useSettings, type Slot } from './settings';
import type { Peer } from '@/lib/threads';
import type { CheckKind, TextFormat } from '@/radio/protocol';

export type SlotCall = {
  active: boolean;
  source: number;
  target: number;
  group: boolean;
  vocoder: string;
  alias: string;
  latitude: number | null;
  longitude: number | null;
  startedAt: number;
};

export type HeardEntry = {
  source: number;
  target: number;
  group: boolean;
  slot: number;
  vocoder: string;
  alias: string;
  at: number;
  seconds: number;
  self: boolean;
};

export type LogEntry = { at: number; text: string };

export type AmbeState = {
  status: 'none' | 'checking' | 'loaded' | 'refused';
  name: string;
  sha256: string;
  version: number;
  error: string;
};

const MAX_HEARD = 50;
const MAX_LOG = 200;

function emptyCall(): SlotCall {
  return { active: false, source: 0, target: 0, group: true, vocoder: '', alias: '', latitude: null, longitude: null, startedAt: 0 };
}

export const useRadio = defineStore('radio', () => {
  const settingsStore = useSettings();
  const messagesStore = useMessages();
  const link = ref<LinkState>('idle');
  const linkDetail = ref('');
  const attempt = ref(0);
  const retryInMs = ref(0);
  const ready = ref(false);
  const fatal = ref('');
  const calls = reactive<Record<Slot, SlotCall>>({ 1: emptyCall(), 2: emptyCall() });
  const heard = ref<HeardEntry[]>([]);
  const log = ref<LogEntry[]>([]);
  const tx = reactive({ active: false, slot: 0 as number, target: 0, group: true, startedAt: 0, error: '' });
  const privateCall = ref<{ id: number; slot: number; startedAt: number } | null>(null);
  const incoming = ref<{ source: number; slot: number } | null>(null);
  const transmitVocoder = ref('codec2');
  const endpoint = ref('');
  const ars = reactive({ status: 'none' as 'none' | 'registered' | 'failed', at: 0, reason: '' });
  const micLevel = ref(0);
  const micPermission = ref<'unknown' | 'granted' | 'denied'>('unknown');
  const micPrompt = ref(false);
  const ambe = reactive<AmbeState>({ status: 'none', name: '', sha256: '', version: 0, error: '' });
  const upSince = ref(0);
  const client = shallowRef<RadioClient | null>(null);
  let pendingAmbe: { bytes: Uint8Array; name: string; sha256: string } | null = null;

  const supported = webTransportSupported();
  const connected = computed(() => link.value === 'up');

  function addLog(text: string): void {
    log.value.unshift({ at: Date.now(), text });
    if (log.value.length > MAX_LOG) {
      log.value.length = MAX_LOG;
    }
  }

  function remember(entry: HeardEntry): void {
    heard.value.unshift(entry);
    if (heard.value.length > MAX_HEARD) {
      heard.value.length = MAX_HEARD;
    }
  }

  function onEvent(e: RadioEvent): void {
    const slot = (e.slot === 1 ? 1 : 2) as Slot;
    switch (e.kind) {
      case 'up':
        upSince.value = Date.now();
        addLog('Session up');
        break;
      case 'down':
        addLog(`Session down: ${e.reason}`);
        break;
      case 'callStart':
        Object.assign(calls[slot], {
          active: true,
          source: e.source,
          target: e.target,
          group: e.group,
          vocoder: e.vocoder,
          alias: '',
          latitude: null,
          longitude: null,
          startedAt: Date.now(),
        });
        addLog(`RX call start, TS${slot}, ${e.group ? 'TG' : 'to'} ${e.target}, from ${e.source}, ${e.vocoder}`);
        if (!e.group && e.target === settingsStore.radioId && privateCall.value?.id !== e.source) {
          incoming.value = { source: e.source, slot };
        }
        break;
      case 'callEnd': {
        const c = calls[slot];
        if (c.active) {
          remember({
            source: c.source,
            target: c.target,
            group: c.group,
            slot,
            vocoder: c.vocoder,
            alias: c.alias,
            at: Date.now(),
            seconds: Math.round((Date.now() - c.startedAt) / 1000),
            self: false,
          });
        }
        c.active = false;
        addLog(`RX call end, TS${slot}: ${e.reason}`);
        break;
      }
      case 'talkerAlias':
        calls[slot].alias = e.text;
        break;
      case 'position':
        calls[slot].latitude = e.latitude;
        calls[slot].longitude = e.longitude;
        break;
      case 'transmitStart':
        Object.assign(tx, { active: true, slot: e.slot, target: e.target, group: e.group, startedAt: Date.now(), error: '' });
        transmitVocoder.value = e.vocoder;
        addLog(`TX start, TS${e.slot}, ${e.group ? 'TG' : 'to'} ${e.target}, ${e.vocoder}`);
        break;
      case 'transmitEnd':
        if (tx.active) {
          remember({
            source: settingsStore.radioId,
            target: tx.target,
            group: tx.group,
            slot: tx.slot,
            vocoder: transmitVocoder.value,
            alias: '',
            at: Date.now(),
            seconds: Math.round((Date.now() - tx.startedAt) / 1000),
            self: true,
          });
        }
        tx.active = false;
        addLog(`TX end: ${e.reason}`);
        break;
      case 'error':
        addLog(`Error: ${e.error ?? 'unknown'}`);
        break;
      case 'text':
        addLog(`Text from ${e.source} to ${e.group ? 'TG ' : ''}${e.target}, TS${slot}, ${e.format}`);
        messagesStore.onEvent(e, settingsStore.radioId);
        break;
      case 'textStatus':
        addLog(`Text ${e.id}: ${e.reason}`);
        messagesStore.onEvent(e, settingsStore.radioId);
        break;
      case 'check':
        addLog(`Check ${e.id} to ${e.target}: ${e.reason} after ${Math.round(e.elapsedMs)} ms`);
        messagesStore.onEvent(e, settingsStore.radioId);
        break;
      case 'callAlert':
        addLog(`Call alert from ${e.source}, TS${slot}`);
        messagesStore.onEvent(e, settingsStore.radioId);
        break;
      case 'request':
        addLog(`Answered ${e.text} from ${e.source}, TS${slot}`);
        break;
      case 'registered':
        Object.assign(ars, { status: e.reason === 'sent' ? 'registered' : 'failed', at: Date.now(), reason: e.reason });
        addLog(`ARS registration: ${e.reason}`);
        break;
    }
  }

  function sendText(peer: Peer, text: string, format: TextFormat | 'auto', slot: number): void {
    const m = messagesStore.compose(peer, text, format, slot);
    if (!client.value || link.value !== 'up') {
      messagesStore.status(m.id, 'notConnected');
      return;
    }
    client.value.sendText({ id: m.id, slot, group: peer.group, target: peer.id, format: m.format, text });
  }

  function check(kind: CheckKind, target: number, slot: number): number {
    const c = messagesStore.startCheck(kind, target, slot);
    if (!client.value || link.value !== 'up') {
      messagesStore.failCheck(c.id, 'notConnected');
      return c.id;
    }
    client.value.check({ id: c.id, slot, kind, target });
    return c.id;
  }

  function onMessage(msg: FromWorker): void {
    switch (msg.type) {
      case 'ready':
        ready.value = true;
        break;
      case 'event':
        onEvent(msg.event);
        break;
      case 'link':
        link.value = msg.state;
        linkDetail.value = msg.detail;
        attempt.value = msg.attempt;
        retryInMs.value = msg.retryInMs;
        if (msg.state !== 'up') {
          calls[1].active = false;
          calls[2].active = false;
          tx.active = false;
        }
        addLog(`Link ${msg.state}${msg.detail ? `: ${msg.detail}` : ''}`);
        break;
      case 'ambe':
        if (msg.ok && pendingAmbe) {
          const p = pendingAmbe;
          pendingAmbe = null;
          void saveModule(p.bytes, p.name);
          Object.assign(ambe, { status: 'loaded', name: p.name, sha256: p.sha256, version: msg.version ?? 1, error: '' });
          addLog('AMBE module self-test passed');
        } else if (!msg.ok) {
          pendingAmbe = null;
          Object.assign(ambe, { status: 'refused', version: 0, error: msg.error ?? 'refused' });
          addLog(`AMBE module refused: ${msg.error ?? ''}`);
        }
        client.value?.setVocoder(settingsStore.settings.vocoder);
        break;
      case 'vocoder':
        transmitVocoder.value = msg.transmit;
        break;
      case 'endpoint':
        endpoint.value = msg.url;
        break;
      case 'ptt':
        if (!msg.ok) {
          tx.error = msg.error ?? 'could not transmit';
          addLog(`PTT refused: ${tx.error}`);
        }
        break;
      case 'sendText':
        if (!msg.ok) {
          addLog(`Text ${msg.id} refused: ${msg.error ?? ''}`);
          messagesStore.status(msg.id, msg.error ?? 'refused');
        }
        break;
      case 'check':
        if (!msg.ok) {
          addLog(`Check ${msg.id} refused: ${msg.error ?? ''}`);
          messagesStore.failCheck(msg.id, msg.error ?? 'refused');
        }
        break;
      case 'fatal':
        fatal.value = msg.error;
        addLog(`Fatal: ${msg.error}`);
        break;
    }
  }

  function init(): void {
    if (client.value) {
      return;
    }
    client.value = new RadioClient(onMessage, (level) => {
      micLevel.value = level;
    });
    const a = settingsStore.settings.audio;
    client.value.setVolume(a.volume);
    client.value.setMicGain(a.micGainDb);
    void loadModule().then((m) => {
      if (m) {
        checkAmbe(m.bytes, m.name, m.sha256);
      }
    });
  }

  function checkAmbe(bytes: Uint8Array, name: string, sha256: string): void {
    pendingAmbe = { bytes, name, sha256 };
    Object.assign(ambe, { status: 'checking', name, sha256, version: 0, error: '' });
    client.value?.loadAmbe(bytes);
  }

  async function uploadAmbe(file: File): Promise<void> {
    const bytes = new Uint8Array(await file.arrayBuffer());
    checkAmbe(bytes, file.name, await sha256Hex(bytes));
  }

  async function forgetAmbe(): Promise<void> {
    client.value?.removeAmbe();
    await removeModule();
    Object.assign(ambe, { status: 'none', name: '', sha256: '', version: 0, error: '' });
    client.value?.setVocoder(settingsStore.settings.vocoder);
  }

  function connect(): void {
    const s = settingsStore.settings;
    if (!client.value || !settingsStore.configured) {
      return;
    }
    void client.value.audio().catch(() => undefined);
    client.value.connect({
      hub: s.hub.host,
      hotspot: s.hotspot.id,
      radioId: settingsStore.radioId,
      password: s.hotspot.password,
      callsign: s.hotspot.callsign,
      options: rptoOptions(s.talkgroups),
      jitterMs: s.jitterMs,
      vocoder: s.vocoder,
      ars: s.ars,
    });
  }

  function disconnect(): void {
    client.value?.disconnect();
  }

  async function checkMicPermission(): Promise<void> {
    try {
      const status = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      micPermission.value = status.state === 'granted' ? 'granted' : status.state === 'denied' ? 'denied' : 'unknown';
    } catch {
      micPermission.value = 'unknown';
    }
  }

  async function enableMic(): Promise<boolean> {
    micPrompt.value = false;
    try {
      await client.value?.microphone();
      micPermission.value = 'granted';
      return true;
    } catch (err) {
      micPermission.value = err instanceof DOMException && err.name === 'NotAllowedError' ? 'denied' : 'unknown';
      tx.error = err instanceof Error ? err.message : String(err);
      return false;
    }
  }

  function startPrivateCall(id: number, slot: number): void {
    privateCall.value = { id, slot, startedAt: Date.now() };
    incoming.value = null;
    addLog(`Private call with ${id} on TS${slot}`);
  }

  function endPrivateCall(): void {
    if (privateCall.value) {
      addLog(`Private call with ${privateCall.value.id} ended`);
    }
    privateCall.value = null;
  }

  async function pttDown(): Promise<void> {
    const pc = privateCall.value;
    const slot = pc ? (pc.slot as Slot) : settingsStore.settings.selected.slot;
    const target = pc ? pc.id : settingsStore.target(slot);
    if (!client.value || !connected.value || !target) {
      return;
    }
    if (micPermission.value !== 'granted') {
      await checkMicPermission();
    }
    if (micPermission.value === 'unknown') {
      micPrompt.value = true;
      return;
    }
    if (micPermission.value === 'denied') {
      return;
    }
    try {
      await client.value.ptt(true, slot, !pc, target);
      micPermission.value = 'granted';
    } catch (err) {
      micPermission.value = err instanceof DOMException && err.name === 'NotAllowedError' ? 'denied' : micPermission.value;
      tx.error = err instanceof Error ? err.message : String(err);
    }
  }

  function pttUp(): void {
    if (!client.value) {
      return;
    }
    const slot = settingsStore.settings.selected.slot;
    void client.value.ptt(false, slot, true, settingsStore.target(slot) ?? 0);
  }

  function setVocoder(): void {
    client.value?.setVocoder(settingsStore.settings.vocoder);
  }

  function applyAudio(): void {
    const a = settingsStore.settings.audio;
    client.value?.setVolume(a.volume);
    client.value?.setMicGain(a.micGainDb);
    void client.value?.setMicOptions({
      echoCancellation: a.echoCancellation,
      noiseSuppression: a.noiseSuppression,
      autoGainControl: a.autoGainControl,
    });
  }

  return {
    link,
    linkDetail,
    attempt,
    retryInMs,
    ready,
    fatal,
    calls,
    heard,
    log,
    tx,
    transmitVocoder,
    endpoint,
    ars,
    micLevel,
    micPermission,
    micPrompt,
    enableMic,
    checkMicPermission,
    ambe,
    upSince,
    supported,
    connected,
    init,
    connect,
    disconnect,
    pttDown,
    sendText,
    check,
    privateCall,
    incoming,
    startPrivateCall,
    endPrivateCall,
    pttUp,
    uploadAmbe,
    forgetAmbe,
    setVocoder,
    applyAudio,
  };
});
