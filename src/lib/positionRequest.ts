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
import { useIntervalFn } from '@vueuse/core';
import { computed, ref, type Ref } from 'vue';

import { usePositions, type LocationRequest, type Position } from '@/store/positions';
import { useRadio } from '@/store/radio';

/** ASK_MS is how long a request waits for an answer before it shows as unanswered. */
export const ASK_MS = 60_000;

/** SHOW_MS is how long the outcome of a request stays shown. */
export const SHOW_MS = 10 * 60_000;

/** Phase is where asking a station for its position stands. */
export type Phase = 'none' | 'asking' | 'answered' | 'noPosition' | 'noAnswer' | 'failed';

/** phaseOf tells where asking for a position stands at now, from the station's latest position and request. */
export function phaseOf(position: Position | null, request: LocationRequest | undefined, now: number): Phase {
  if (request?.status === 'asking' && now - request.startedAt < ASK_MS) {
    return 'asking';
  }
  if (position && (!request || position.at >= request.startedAt)) {
    return 'answered';
  }
  if (request && now - request.startedAt < SHOW_MS) {
    switch (request.status) {
      case 'noPosition':
        return 'noPosition';
      case 'failed':
        return 'failed';
      case 'asking':
        return 'noAnswer';
    }
  }
  return position ? 'answered' : 'none';
}

/** failedReason says why a request was not sent. */
export function failedReason(reason: string): string {
  switch (reason) {
    case 'notConnected':
      return 'Not connected to the hub';
    case 'noAnswer':
      return 'No answer from the radio';
    case 'refused':
      return 'The radio refused it';
    default:
      return reason ? `Not sent: ${reason}` : 'Not sent';
  }
}

/** usePositionRequest asks the station id for its position on slot, and tells how that stands. */
export function usePositionRequest(id: Ref<number>, slot: Ref<number>) {
  const positions = usePositions();
  const radio = useRadio();
  const now = ref(Date.now());
  useIntervalFn(() => (now.value = Date.now()), 5000);

  const position = computed(() => positions.positions.find((p) => p.id === id.value) ?? null);
  const request = computed(() => positions.latestRequest(id.value));
  const phase = computed(() => phaseOf(position.value, request.value, now.value));

  function ask(): void {
    now.value = Date.now();
    radio.requestLocation(id.value, slot.value);
  }

  return { position, request, phase, now, ask };
}
