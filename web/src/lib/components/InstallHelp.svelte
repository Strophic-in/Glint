<script lang="ts">
  import { BRAND, DOWNLOAD_URL } from '$lib/config';

  // Under the Store button: the direct installer for anyone who can't use the Store. That installer
  // isn't code-signed yet, so browsers and SmartScreen flag it as "uncommon"; this explains why.
  let { align = 'center' }: { align?: 'center' | 'left' } = $props();
</script>

{#if DOWNLOAD_URL}
<details class="help" class:left={align === 'left'}>
  <summary>Can't use the Microsoft Store? Download the installer</summary>
  <div class="body">
    <p><a class="direct" href={DOWNLOAD_URL}>Download Glint-Setup.exe</a> (about 5 MB). The Store version updates itself through the Store; this one updates itself from inside Glint.</p>
    <p>
      {BRAND} is new, so Chrome, Edge and Windows haven't seen many downloads of it yet and flag it as uncommon. It's a
      reputation check, not a detected threat.
    </p>
    <ul>
      <li><b>Chrome</b>: open Downloads (<kbd>Ctrl</kbd> <kbd>J</kbd>) and choose <b>Keep</b> (or <b>Download suspicious file</b>).</li>
      <li><b>Edge</b>: on the download, choose <b>⋯ → Keep</b>, then <b>Show more → Keep anyway</b>.</li>
      <li><b>"Windows protected your PC"</b>: click <b>More info</b>, then <b>Run anyway</b>.</li>
    </ul>
  </div>
</details>
{/if}

<style>
  .direct {
    color: var(--accent);
    font-weight: 600;
    text-decoration: underline;
  }
  .help {
    margin: 14px auto 0;
    max-width: 520px;
    font-size: 13.5px;
    color: var(--muted);
    text-align: center;
  }
  .help.left {
    margin-left: 0;
    text-align: left;
  }
  summary {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    list-style: none;
    color: var(--muted);
    text-decoration: underline;
    text-decoration-color: var(--border-strong);
    text-underline-offset: 3px;
  }
  summary::-webkit-details-marker {
    display: none;
  }
  summary::before {
    content: 'ⓘ';
    text-decoration: none;
    color: var(--accent);
  }
  summary:hover {
    color: var(--text);
  }
  .body {
    margin-top: 10px;
    padding: 12px 14px;
    text-align: left;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    line-height: 1.55;
  }
  ul {
    margin: 8px 0 0;
    padding-left: 18px;
  }
  li + li {
    margin-top: 4px;
  }
  b {
    color: var(--text);
    font-weight: 600;
  }
  kbd {
    font-family: var(--mono);
    font-size: 11.5px;
    padding: 1px 5px;
    border: 1px solid var(--border-strong);
    border-radius: 5px;
    background: var(--surface-3);
    color: var(--text);
  }
</style>
