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
import 'maplibre-gl/dist/maplibre-gl.css';

import type { LngLatBoundsLike, Map as MapLibre, StyleSpecification } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { PMTiles, Protocol } from 'pmtiles';
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';

import SymbolIcon from '@/components/map/SymbolIcon.vue';
import { archiveSource, clearOldArchives, latestKey, TILES_BASE } from '@/map/archive';
import { basemapStyle, circleImage, withTerrain } from '@/map/style';
import { TERRAIN_PROTOCOL, terrainTile } from '@/map/terrain';
import type { Here } from '@/radio/protocol';
import { LOCATION_SERVICES, type Position } from '@/store/positions';

const props = withDefaults(
  defineProps<{
    positions: Position[];
    selected: number | null;
    here: Here | null;
    symbol?: number | null;
    dark: boolean;
    label: (id: number) => string;
    attribution?: 'bottom-left' | 'top-left';
  }>(),
  { symbol: null, attribution: 'bottom-left' },
);
const emit = defineEmits<{ select: [id: number | null]; ready: [] }>();

const el = ref<HTMLDivElement | null>(null);
const map = shallowRef<MapLibre | null>(null);
const failure = ref('');
const points = ref<{ id: number; x: number; y: number }[]>([]);
const herePoint = ref<{ x: number; y: number } | null>(null);
let archive = '';

const symbolName = computed(() => LOCATION_SERVICES.find((s) => s.id === props.symbol)?.symbol ?? '');

const TONES = ['bg-radio-cyan', 'bg-radio-text/80', 'bg-radio-green'];

function tone(id: number): string {
  return TONES[id % TONES.length]!;
}

async function styleFor(dark: boolean): Promise<StyleSpecification> {
  const raw = (dark ? await import('@/map/styles/dark.json') : await import('@/map/styles/light.json')).default as unknown as StyleSpecification;
  return withTerrain(basemapStyle(raw, archive, `${location.origin}/glyphs/{fontstack}/{range}.pbf`), dark);
}

function project(): void {
  const m = map.value;
  if (!m) {
    return;
  }
  points.value = props.positions.map((p) => {
    const at = m.project([p.longitude, p.latitude]);
    return { id: p.id, x: at.x, y: at.y };
  });
  herePoint.value = props.here ? m.project([props.here.longitude, props.here.latitude]) : null;
}

function bounds(): LngLatBoundsLike | null {
  const pts = props.positions.map((p) => [p.longitude, p.latitude] as [number, number]);
  if (props.here) {
    pts.push([props.here.longitude, props.here.latitude]);
  }
  if (!pts.length) {
    return null;
  }
  const lons = pts.map((p) => p[0]);
  const lats = pts.map((p) => p[1]);
  return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
}

function fit(): void {
  const b = bounds();
  if (map.value && b) {
    map.value.fitBounds(b, { padding: 80, maxZoom: 14, duration: 400 });
  }
}

function center(lat: number, lon: number, zoom?: number): void {
  map.value?.easeTo({ center: [lon, lat], zoom: zoom ?? Math.max(map.value.getZoom(), 12), duration: 400 });
}

function zoomBy(d: number): void {
  if (d > 0) {
    map.value?.zoomIn();
  } else {
    map.value?.zoomOut();
  }
}

defineExpose({ fit, center, zoomBy });

onMounted(async () => {
  try {
    const maplibregl = await import('maplibre-gl');
    maplibregl.setWorkerUrl(workerUrl);
    const { key, partBytes } = await latestKey(TILES_BASE);
    const url = `${TILES_BASE}/${key}`;
    const protocol = new Protocol();
    protocol.add(new PMTiles(await archiveSource(url, partBytes)));
    maplibregl.addProtocol('pmtiles', protocol.tile);
    maplibregl.addProtocol(TERRAIN_PROTOCOL, terrainTile);
    void clearOldArchives(url).catch(() => undefined);
    archive = url;
    if (!el.value) {
      return;
    }
    const b = bounds();
    const m = new maplibregl.Map({
      container: el.value,
      style: await styleFor(props.dark),
      center: [-96, 38],
      zoom: 3,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
    });
    m.touchZoomRotate.disableRotation();
    m.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: '© OpenMapTiles © OpenStreetMap contributors' }), props.attribution);
    m.setMissingStyleImageResolver((id) => {
      if (id === 'circle-11' && !m.hasImage(id)) {
        m.addImage(id, circleImage(props.dark ? '#c9cbd1' : '#5a5f68'));
      }
    });
    m.on('move', project);
    m.on('resize', project);
    m.on('click', () => emit('select', null));
    map.value = m;
    m.once('load', () => {
      el.value?.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
      if (b) {
        m.fitBounds(b, { padding: 80, maxZoom: 13, duration: 0 });
      }
      project();
      emit('ready');
    });
  } catch (err) {
    failure.value = err instanceof Error ? err.message : String(err);
  }
});

onBeforeUnmount(() => {
  map.value?.remove();
  map.value = null;
});

watch(
  () => props.dark,
  async (dark) => {
    if (map.value && archive) {
      map.value.setStyle(await styleFor(dark));
    }
  },
);
watch(() => [props.positions, props.here], project, { deep: true });
</script>

<template>
  <div class="relative min-h-0 overflow-hidden bg-radio-page">
    <div ref="el" style="position: absolute; inset: 0" />
    <div class="pointer-events-none absolute inset-0">
      <span
        v-if="herePoint"
        class="absolute flex -translate-y-1/2 items-center gap-1.5"
        :class="symbol ? '-translate-x-4' : '-translate-x-2'"
        :style="{ left: `${herePoint.x}px`, top: `${herePoint.y}px` }"
      >
        <span
          v-if="symbol"
          role="img"
          :aria-label="`You, ${symbolName}`"
          class="box-border flex size-8 items-center justify-center rounded-full border-2 border-radio-green bg-[color-mix(in_oklab,var(--radio-green)_14%,var(--radio-page))] shadow-[0_2px_8px_rgba(0,0,0,0.45)]"
        >
          <SymbolIcon :service="symbol" class="size-[17px] text-radio-green" />
        </span>
        <span v-else role="img" aria-label="You, not shared" class="box-border block size-4 rounded-full border-2 border-radio-green bg-radio-green/25" />
        <span class="rounded-[5px] border border-radio-green bg-radio-page px-1.5 py-0.5 font-mono text-xs font-semibold">You</span>
      </span>
      <button
        v-for="p in points"
        :key="p.id"
        type="button"
        class="pointer-events-auto absolute flex -translate-y-1/2 items-center gap-1.5"
        :class="p.id === selected ? '-translate-x-1/2' : '-translate-x-2'"
        :style="{ left: `${p.x}px`, top: `${p.y}px` }"
        :aria-label="`${label(p.id)} on the map`"
        :aria-pressed="p.id === selected"
        @click.stop="emit('select', p.id)"
      >
        <span
          v-if="p.id === selected"
          class="block size-[22px] rounded-full border-[3px] border-radio-amber-ink bg-radio-amber shadow-[0_0_0_6px_color-mix(in_oklab,var(--radio-amber)_25%,transparent)]"
        />
        <template v-else>
          <span class="block size-4 rounded-full border-[3px] border-radio-page" :class="tone(p.id)" />
          <span class="rounded-[5px] border border-radio-line bg-radio-page px-1.5 py-0.5 font-mono text-xs">{{ label(p.id) }}</span>
        </template>
      </button>
      <slot name="popup" :point="points.find((p) => p.id === selected) ?? null" />
    </div>
    <slot name="controls" />
    <p v-if="failure" role="alert" class="absolute inset-x-4 top-4 m-0 rounded-xl border border-radio-red/50 bg-radio-surface p-3 text-sm text-radio-red">
      The map could not load: {{ failure }}
    </p>
  </div>
</template>

<style>
.maplibregl-ctrl-attrib.maplibregl-compact,
.maplibregl-ctrl-attrib.maplibregl-compact-show {
  background: var(--radio-raised);
  color: var(--radio-muted);
  border: 1px solid var(--radio-line);
}
.maplibregl-ctrl-attrib a {
  color: var(--radio-muted);
}
.maplibregl-ctrl-attrib-button {
  background-color: #f4f5f6;
  border-radius: 9999px;
  box-shadow: 0 0 0 1px var(--radio-line);
}
</style>
