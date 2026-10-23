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

export type VocoderChoice = 'auto' | 'codec2' | 'ambe';

export type RadioConfig = {
  hub: string;
  hotspot: number;
  radioId: number;
  password: string;
  callsign: string;
  options: string;
  jitterMs: number;
  vocoder: VocoderChoice;
  ars: boolean;
};

export type RadioEventKind =
  | 'up'
  | 'down'
  | 'callStart'
  | 'callEnd'
  | 'talkerAlias'
  | 'position'
  | 'transmitStart'
  | 'transmitEnd'
  | 'error'
  | 'text'
  | 'textStatus'
  | 'check'
  | 'callAlert'
  | 'request'
  | 'registered'
  | 'stats'
  | 'fix'
  | 'locationRequest'
  | 'data';

export type RadioEvent = {
  kind: RadioEventKind;
  slot: number;
  group: boolean;
  target: number;
  source: number;
  fid: number;
  vocoder: string;
  text: string;
  latitude: number;
  longitude: number;
  reason: string;
  id: number;
  format: string;
  elapsedMs: number;
  error?: string;
  stats?: RadioStats;
  fix?: FixDetail;
};

export type FixDetail = {
  format: string;
  valid: boolean;
  accuracy?: number;
  speed?: number;
  heading?: number;
  altitude?: number;
  at?: number;
  result?: number;
};

export type Here = { latitude: number; longitude: number; accuracy: number; speed: number | null; heading: number | null; at: number };

export type RadioStats = {
  roundTripMs: number;
  bursts: number;
  lost: number;
  late: number;
  frameErrors: number;
  concealed: number;
  codecs: number;
};

export type TextFormat = 'tms' | 'ip' | 'anytone' | 'dd' | 'hytera';

export type DataSap = 'proprietary' | 'ip' | 'short';

export type DataRate = '1/2' | '3/4' | '1';

export type CheckKind = 'radioCheck' | 'callAlert' | 'presence';

export type LinkState = 'idle' | 'connecting' | 'up' | 'reconnecting' | 'failed';

export type ToWorker =
  | { type: 'connect'; config: RadioConfig }
  | { type: 'disconnect' }
  | { type: 'ptt'; on: boolean; slot: number; group: boolean; target: number }
  | { type: 'ambe'; bytes: Uint8Array }
  | { type: 'ambeRemove' }
  | { type: 'vocoder'; value: VocoderChoice }
  | { type: 'sendText'; id: number; slot: number; group: boolean; target: number; format: TextFormat; text: string }
  | { type: 'check'; id: number; slot: number; kind: CheckKind; target: number }
  | { type: 'requestLocation'; id: number; slot: number; target: number }
  | { type: 'setLocation'; here: Here | null; share: boolean }
  | { type: 'sendData'; id: number; slot: number; group: boolean; target: number; confirmed: boolean; sap: DataSap; rate: DataRate; payload: Uint8Array }
  | { type: 'capturePort'; port: MessagePort }
  | { type: 'playbackPort'; port: MessagePort };

export type FromWorker =
  | { type: 'ready' }
  | { type: 'event'; event: RadioEvent }
  | { type: 'link'; state: LinkState; detail: string; attempt: number; retryInMs: number }
  | { type: 'ambe'; ok: boolean; error?: string; version?: number }
  | { type: 'vocoder'; transmit: string }
  | { type: 'endpoint'; url: string }
  | { type: 'ptt'; ok: boolean; error?: string }
  | { type: 'sendText'; id: number; ok: boolean; error?: string }
  | { type: 'check'; id: number; ok: boolean; error?: string }
  | { type: 'requestLocation'; id: number; ok: boolean; error?: string }
  | { type: 'sendData'; id: number; ok: boolean; error?: string }
  | { type: 'fatal'; error: string };

export type PlaybackMessage = { slot: number; samples: Int16Array };
