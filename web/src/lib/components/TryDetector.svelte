<script lang="ts">
  // The close: the same question detector as the hero (and the app), on the visitor's own words.
  // It runs locally in the browser; nothing typed here is sent anywhere.
  import { extractQuestion } from '$lib/question';

  const EXAMPLES = [
    'Great, thanks. So, why do you want to leave your current job? No rush.',
    'Right, makes sense. Can you explain the difference between a process and a thread',
    'Honestly your competitor is cheaper. Why should we pick you?',
    'Okay perfect. Walk me through the last project you shipped'
  ];

  let text = $state('Okay, thanks for that. So, what is a website? Take your time.');
  const q = $derived(extractQuestion(text));
</script>

<div class="try card">
  <label for="try-input" class="lbl">Type anything an interviewer might say</label>
  <textarea id="try-input" rows="2" maxlength="400" bind:value={text} spellcheck="false"></textarea>
  <div class="out" aria-live="polite">
    <span class="who">Them</span>
    <p class="cap">
      {#if q}{text.slice(0, q.start)}<mark>{text.slice(q.start, q.end)}</mark>{text.slice(q.end)}{:else}{text || '…'}{/if}
    </p>
    {#if q}
      <p class="found"><span>Glint answers</span>{q.text}</p>
    {:else}
      <p class="none">No question yet. Glint stays quiet until someone asks one.</p>
    {/if}
  </div>
  <div class="examples">
    {#each EXAMPLES as e (e)}
      <button type="button" onclick={() => (text = e)}>{e.length > 46 ? e.slice(0, 44) + '…' : e}</button>
    {/each}
  </div>
  <p class="note">Runs in your browser, the same detector the app uses. Nothing you type is sent anywhere.</p>
</div>

<style>
  .try {
    padding: clamp(20px, 3vw, 32px);
    text-align: left;
    display: grid;
    gap: 14px;
  }
  .lbl {
    font-size: 14px;
    font-weight: 600;
  }
  textarea {
    width: 100%;
    resize: vertical;
    font: inherit;
    font-size: 16px;
    line-height: 1.5;
    color: var(--text);
    background: var(--bg);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    padding: 12px 14px;
  }
  textarea:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .out {
    padding: 14px 16px;
    border-radius: var(--radius-sm);
    background: #0e0f14;
    border: 1px solid var(--border);
  }
  .who {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: #ffd27a;
  }
  .cap {
    margin-top: 4px;
    font-size: 16px;
    line-height: 1.55;
    overflow-wrap: anywhere;
  }
  mark {
    color: #ffe14d;
    background: rgba(255, 225, 77, 0.16);
    font-weight: 600;
    border-radius: 4px;
    padding: 0 3px;
  }
  .found {
    margin-top: 12px;
    padding: 8px 12px;
    border-radius: 8px;
    background: rgba(255, 225, 77, 0.14);
    color: #ffe14d;
    font-weight: 600;
  }
  .found span {
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.04em;
    opacity: 0.8;
    margin-right: 10px;
  }
  .none {
    margin-top: 12px;
    color: var(--muted);
    font-size: 14px;
  }
  .examples {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .examples button {
    font: inherit;
    font-size: 13px;
    color: var(--muted);
    background: transparent;
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 6px 12px;
    min-height: 36px;
    cursor: pointer;
    text-align: left;
  }
  .examples button:hover {
    color: var(--text);
    border-color: var(--border-strong);
  }
  .examples button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .note {
    font-size: 12.5px;
    color: var(--faint);
  }
</style>
