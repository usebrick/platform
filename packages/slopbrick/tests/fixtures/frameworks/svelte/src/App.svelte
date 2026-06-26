<script lang="ts">
  const title = 'Hello Svelte';
  console.log(title);
  const style = { marginTop: '12px' };
  const placeholder = 'todo: real copy';
  function handleClick() {
    console.log('clicked');
  }
</script>

<div class="p-4 bg-gray-300">
  <h1>{title}</h1>
  <button on:click={handleClick}>Click me</button>
</div>