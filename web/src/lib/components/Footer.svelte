<script lang="ts">
  import Logo from './Logo.svelte';
  import { BRAND, SUPPORT_EMAIL } from '$lib/config';

  const year = new Date().getFullYear();
</script>

<footer class="footer">
  <div class="container grid">
    <div class="about">
      <Logo size={20} />
      <p class="muted">Real-time AI copilot for calls, meetings and prep. Built for Windows.</p>
    </div>
    <nav class="cols" aria-label="Footer">
      <div>
        <h4>Product</h4>
        <a href="/#features">Features</a>
        <a href="/#pricing">Pricing</a>
        <a href="/#download">Download</a>
        <a href="/dashboard">Dashboard</a>
      </div>
      <div>
        <h4>Company</h4>
        <a href="/contact">Contact</a>
        <a href="mailto:{SUPPORT_EMAIL}">{SUPPORT_EMAIL}</a>
      </div>
      <div>
        <h4>Legal</h4>
        <a href="/privacy">Privacy</a>
        <a href="/terms">Terms</a>
        <a href="/refunds">Refunds</a>
      </div>
    </nav>
  </div>
  <div class="container legal muted">© {year} {BRAND}. All rights reserved.</div>
</footer>

<style>
  .footer {
    margin-top: 120px;
    border-top: 1px solid var(--border);
    padding: 48px 0 32px;
    font-size: 14px;
  }
  .grid {
    display: grid;
    gap: 32px;
  }
  .about p {
    margin-top: 12px;
    max-width: 300px;
  }
  .cols {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 24px;
  }
  .cols div {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
  }
  .cols a {
    color: var(--muted);
    overflow-wrap: anywhere;
  }
  .cols a:hover {
    color: var(--text);
  }
  h4 {
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
    margin-bottom: 4px;
  }
  .legal {
    margin-top: 40px;
    font-size: 13px;
  }
  @media (min-width: 720px) {
    .grid {
      grid-template-columns: 1fr 1.4fr;
    }
    .cols {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }
</style>
