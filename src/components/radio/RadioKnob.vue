<!--
  SPDX-License-Identifier: AGPL-3.0-or-later
  dmr-web - A DMR radio in the browser
  Copyright (C) 2026 Jacob McSwain

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU Affero General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.

  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU Affero General Public License for more details.

  You should have received a copy of the GNU Affero General Public License
  along with this program. If not, see <https://www.gnu.org/licenses/>.

  The source code is available at <https://github.com/USA-RedDragon/dmr-web>
-->

<script setup lang="ts">
import { computed, ref } from 'vue';

const props = withDefaults(
  defineProps<{
    position: number;
    count: number;
    label: string;
    spoken: string;
    size?: number | string;
    disabled?: boolean;
    ticks?: boolean;
    /** The widest label this knob shows, so a label change does not shift the layout. */
    sizer?: string;
  }>(),
  { size: 96, disabled: false, ticks: false },
);

const emit = defineEmits<{ step: [delta: number] }>();

const WHEEL_DETENT = 80;
const DRAG_DETENT = 18;
const SWEEP = 270;

const wheelAcc = ref(0);
const dragY = ref<number | null>(null);

const dim = computed(() => (typeof props.size === 'number' ? `${props.size}px` : props.size));

const angle = computed(() => {
  if (props.count <= 1) {
    return -SWEEP / 2;
  }
  return -SWEEP / 2 + (SWEEP * Math.min(props.position, props.count - 1)) / (props.count - 1);
});

function step(d: number): void {
  if (props.disabled) {
    return;
  }
  const next = props.position + d;
  if (next < 0 || next > props.count - 1) {
    return;
  }
  emit('step', d);
}

function onWheel(e: WheelEvent): void {
  if (props.disabled) {
    return;
  }
  e.preventDefault();
  wheelAcc.value += e.deltaY;
  if (Math.abs(wheelAcc.value) < WHEEL_DETENT) {
    return;
  }
  const d = wheelAcc.value > 0 ? -1 : 1;
  wheelAcc.value = 0;
  step(d);
}

function onPointerDown(e: PointerEvent): void {
  if (props.disabled) {
    return;
  }
  dragY.value = e.clientY;
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}

function onPointerMove(e: PointerEvent): void {
  if (dragY.value === null) {
    return;
  }
  const d = dragY.value - e.clientY;
  if (Math.abs(d) < DRAG_DETENT) {
    return;
  }
  dragY.value = e.clientY;
  step(d > 0 ? 1 : -1);
}

function onPointerUp(): void {
  dragY.value = null;
}

function onKey(e: KeyboardEvent): void {
  if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
    e.preventDefault();
    step(1);
  } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
    e.preventDefault();
    step(-1);
  }
}
</script>

<template>
  <div class="flex shrink-0 flex-col items-center gap-2">
    <button
      type="button"
      role="slider"
      :aria-label="spoken"
      :aria-valuemin="0"
      :aria-valuemax="count - 1"
      :aria-valuenow="position"
      :disabled="disabled"
      class="knob relative rounded-full border border-radio-chassis-line bg-radio-knob shadow-[inset_0_2px_0_rgba(255,255,255,0.08),0_6px_14px_rgba(0,0,0,0.35)] transition-[transform,border-color,box-shadow] duration-100 ease-out hover:border-radio-amber focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-radio-amber disabled:cursor-not-allowed disabled:opacity-55"
      :style="{ width: dim, height: dim, transform: `rotate(${angle}deg)`, touchAction: 'none', cursor: disabled ? 'not-allowed' : 'ns-resize' }"
      @wheel="onWheel"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @keydown="onKey"
    >
      <span
        class="absolute left-1/2 rounded-sm"
        :class="ticks ? 'bg-radio-amber' : 'bg-radio-muted'"
        :style="{ width: '4px', height: '22%', top: '9%', marginLeft: '-2px' }"
      />
    </button>
    <span class="grid whitespace-nowrap text-center text-[11px] font-semibold tracking-[0.14em] text-radio-muted">
      <span class="col-start-1 row-start-1">{{ label }}</span>
      <span v-if="sizer" aria-hidden="true" class="invisible col-start-1 row-start-1">{{ sizer }}</span>
    </span>
  </div>
</template>
