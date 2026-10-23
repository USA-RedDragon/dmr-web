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
import { Bike, Car, House, PersonStanding, Smartphone, Tent, Tractor, TrainFront, Truck, Van } from 'lucide-vue-next';
import { computed, type Component } from 'vue';

const props = defineProps<{ service: number }>();

const ICONS: Record<number, Component> = {
  5050: House,
  5051: TrainFront,
  5052: Tractor,
  5053: Truck,
  5054: Van,
  5055: Smartphone,
  5056: Tent,
  5057: PersonStanding,
  5058: Bike,
  5059: Car,
};

const icon = computed(() => ICONS[props.service] ?? PersonStanding);
</script>

<template>
  <component :is="icon" aria-hidden="true" />
</template>
