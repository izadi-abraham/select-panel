<template>
    <SelectPanel :individual-options="options" />
</template>

<script setup lang="ts">
import SelectPanel from '../components/SelectPanel.vue'
const options = [
    {
        label: 'one',
        id: 1
    },
    {
        label: 'two',
        id: 2
    },
    {
        label: 'three',
        id: 3
    }
]
</script>