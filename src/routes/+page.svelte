<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { liveUpdates } from '$lib/live';
  import type { PageData, ActionData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  const user = $derived(page.data.user);

  let endCondition = $state<'time_limit' | 'end_date' | 'pp_limit'>('time_limit');

  // Refresh the lobby list on any lobby change (create / join / start / finish).
  onMount(() => liveUpdates((e) => e.type === 'lobby'));

  const fmtDuration = (secs: number | null) => {
    if (!secs) return '';
    if (secs % 86400 === 0) return `${secs / 86400}d`;
    if (secs % 3600 === 0) return `${secs / 3600}h`;
    return `${Math.round(secs / 60)}m`;
  };
  const fmtDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString() : '';

  function conditionSummary(l: PageData['lobbies'][number]): string {
    if (l.end_condition === 'time_limit') return `⏱ ${fmtDuration(l.duration_seconds)} run`;
    if (l.end_condition === 'end_date') return `📅 ends ${fmtDate(l.ends_at)}`;
    return `🎯 first to ${Math.round(l.pp_limit ?? 0)}pp`;
  }
</script>

<section class="hero">
  <h1>sPPeedrun</h1>
  <p class="muted">
    Create a lobby, invite your friends, and race to the top of its leaderboard — highest total pp
    when the clock (or pp goal) runs out wins.
  </p>
</section>

<section class="create">
  <h2>Create a lobby</h2>
  {#if user}
    <form method="POST" action="?/create" class="card create-form">
      {#if form?.error}
        <p class="error">{form.error}</p>
      {/if}
      <div class="row">
        <label class="field grow">
          <span>Name</span>
          <input name="name" placeholder="Friday night speedrun" maxlength="100" required />
        </label>
      </div>
      <div class="row">
        <label class="field">
          <span>End condition</span>
          <select name="end_condition" bind:value={endCondition}>
            <option value="time_limit">Time limit</option>
            <option value="end_date">End date</option>
            <option value="pp_limit">PP limit</option>
          </select>
        </label>

        {#if endCondition === 'time_limit'}
          <label class="field">
            <span>Duration</span>
            <div class="inline">
              <input name="duration_amount" type="number" min="1" value="30" required />
              <select name="duration_unit">
                <option value="minutes">minutes</option>
                <option value="hours">hours</option>
                <option value="days">days</option>
              </select>
            </div>
          </label>
        {:else if endCondition === 'end_date'}
          <label class="field">
            <span>Ends at</span>
            <input name="end_date" type="datetime-local" required />
          </label>
        {:else}
          <label class="field">
            <span>PP goal</span>
            <input name="pp_limit" type="number" min="1" step="1" value="1000" required />
          </label>
        {/if}
      </div>
      <div class="row">
        <button class="btn" type="submit">Create lobby</button>
      </div>
    </form>
  {:else}
    <div class="card empty">
      <a href="/login">Sign in with osu!</a> to create a lobby.
    </div>
  {/if}
</section>

<section>
  <h2>Lobbies</h2>
  {#if data.lobbies.length === 0}
    <div class="card empty">No lobbies yet. Create the first one!</div>
  {:else}
    <ul class="lobbies">
      {#each data.lobbies as l (l.id)}
        <li class="card lobby-row">
          <a class="lobby-main" href={`/lobbies/${l.id}`}>
            <span class="lobby-name">{l.name}</span>
            <span class="muted lobby-meta">
              by {l.creator} · {l.member_count} player{l.member_count === 1 ? '' : 's'} · {conditionSummary(l)}
            </span>
          </a>
          <span class="badge badge-{l.state}">{l.state}</span>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .hero {
    padding: 2.5rem 0 1rem;
  }

  .hero h1 {
    font-size: 2.6rem;
    margin: 0 0 0.5rem;
    background: linear-gradient(135deg, var(--pink) 0%, var(--purple) 100%);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }

  .hero p {
    max-width: 34rem;
    font-size: 1.05rem;
  }

  .create {
    margin-bottom: 2rem;
  }

  .create-form {
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .row {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
    align-items: flex-end;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    font-size: 0.85rem;
  }

  .field.grow {
    flex: 1;
  }

  .field > span {
    color: var(--text-muted);
    font-weight: 600;
  }

  .inline {
    display: flex;
    gap: 0.5rem;
  }

  input,
  select {
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--text);
    padding: 0.5rem 0.65rem;
    font-size: 0.95rem;
    font-family: inherit;
  }

  input:focus,
  select:focus {
    outline: none;
    border-color: var(--pink);
  }

  .field.grow input {
    width: 100%;
  }

  .error {
    margin: 0;
    color: #ff8ab0;
    font-size: 0.9rem;
  }

  .empty {
    padding: 1.5rem;
    text-align: center;
  }

  .lobbies {
    list-style: none;
    margin: 1rem 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .lobby-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.85rem 1.1rem;
    transition: border-color 0.15s ease;
  }

  .lobby-row:hover {
    border-color: var(--pink);
  }

  .lobby-main {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    color: var(--text);
    flex: 1;
  }

  .lobby-name {
    font-weight: 700;
    font-size: 1.05rem;
  }

  .lobby-meta {
    font-size: 0.85rem;
  }

  .badge {
    text-transform: uppercase;
    font-size: 0.7rem;
    font-weight: 800;
    letter-spacing: 0.03em;
    padding: 0.25rem 0.6rem;
    border-radius: 999px;
    border: 1px solid var(--border);
  }

  .badge-pending {
    color: var(--gold);
    border-color: color-mix(in srgb, var(--gold) 40%, transparent);
  }

  .badge-active {
    color: #7ce07c;
    border-color: color-mix(in srgb, #7ce07c 40%, transparent);
  }

  .badge-finished {
    color: var(--text-muted);
  }
</style>
