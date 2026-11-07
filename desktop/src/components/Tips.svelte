<script lang="ts">
  import { settings } from '../lib/settings.svelte';
  import Keys from './Keys.svelte';

  const rows = [
    { key: 'listen', text: 'Start a session. Glint hears both sides of the call and captions them live.' },
    { key: 'answer', text: 'Answer now, using what was said and your screen.' },
    { key: 'screen', text: 'Solve what is on screen: code, MCQs, errors, docs.' },
    { key: 'type', text: 'Type a question.' },
    { key: 'toggle', text: 'Collapse to a floating bubble. Tap the bubble to open.' },
    { key: 'shortcuts', text: 'See every shortcut.' },
  ];
</script>

<section class="tips">
  <div class="head">
    <strong>Glint is ready.</strong>
    <span>It never takes your focus, and it is invisible in screen shares and recordings.</span>
  </div>
  <ul>
    {#each rows as r}
      <li><span class="k"><Keys accel={settings.bindings[r.key]} /></span>{r.text}</li>
    {/each}
  </ul>
  <p class="foot">
    Tip: add your company, role and resume from the chip at the top left, and set see-through opacity from the ⋮ menu.
    <button onclick={() => (settings.tipsSeen = true)}>Got it</button>
  </p>
</section>

<style>
  .tips {
    padding: 14px 16px 12px;
  }
  .head {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-bottom: 10px;
  }
  .head span,
  .foot {
    color: var(--muted);
    font-size: 12.5px;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 6px;
  }
  li {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 13px;
  }
  .k {
    min-width: 132px;
  }
  .foot {
    margin: 12px 0 0;
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .foot button {
    margin-left: auto;
    background: var(--accent);
    color: var(--accent-ink);
    font-weight: 650;
    font-size: 12px;
    padding: 5px 14px;
    border-radius: 8px;
    flex: none;
  }
</style>
