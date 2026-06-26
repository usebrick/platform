<template>
  <div class="p-4 bg-slate-500">
    <h1>{{ title }}</h1>
    <button @click="handleClick">Click me</button>
  </div>
</template>

<script setup lang="ts">
const title = 'Hello Vue';
const placeholder = 'todo: add real copy';
console.log(title);
const style = { marginTop: '12px' };
function handleClick() {
  console.log('clicked');
}
</script>
</content>