<script lang="ts">
  import { keyParts } from '../lib/keys';
  let { accel }: { accel: string } = $props();
</script>

<span class="keys">
  {#each keyParts(accel) as k}<kbd>{k}</kbd>{/each}
</span>

<style>
  .keys {
    display: inline-flex;
    gap: 3px;
    align-items: center;
  }
</style>
