<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { liveUpdates } from '$lib/live';
  import PlayList from '$lib/components/PlayList.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  const user = $derived(page.data.user);
  const fmtPp = (n: number) => Math.round(n).toLocaleString('en-US');

  let now = $state(Date.now());

  onMount(() => {
    const stop = liveUpdates((e) => e.lobbyId === data.lobby.id);
    const iv = setInterval(() => (now = Date.now()), 1000);
    return () => {
      stop();
      clearInterval(iv);
    };
  });

  const remainingMs = $derived(
    data.lobby.ends_at ? new Date(data.lobby.ends_at).getTime() - now : null,
  );

  function fmtRemaining(ms: number): string {
    if (ms <= 0) return 'ending…';
    const s = Math.floor(ms / 1000);
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m ${sec}s`;
    return `${m}m ${sec}s`;
  }

  const conditionText = $derived.by(() => {
    const l = data.lobby;
    if (l.end_condition === 'pp_limit') return `🎯 first to ${fmtPp(l.pp_limit ?? 0)}pp`;
    if (l.state === 'active' && remainingMs != null) return `⏱ ${fmtRemaining(remainingMs)} left`;
    if (l.end_condition === 'end_date' && l.ends_at)
      return `📅 ends ${new Date(l.ends_at).toLocaleString()}`;
    if (l.end_condition === 'time_limit' && l.duration_seconds) {
      const mins = Math.round(l.duration_seconds / 60);
      return `⏱ ${mins}-minute run once started`;
    }
    return '';
  });

  const canJoin = $derived(user && !data.member && data.lobby.state !== 'finished');
  const winner = $derived(
    data.lobby.state === 'finished' && data.leaderboard[0]?.play_count > 0
      ? data.leaderboard[0]
      : null,
  );
</script>

<section class="lobby-head card">
  <div class="head-main">
    <div class="title-row">
      <h1>{data.lobby.name}</h1>
      <span class="badge badge-{data.lobby.state}">{data.lobby.state}</span>
    </div>
    <div class="muted sub">
      by {data.lobby.creator} · {conditionText}
    </div>
  </div>
  <div class="head-actions">
    {#if data.isCreator && data.lobby.state === 'pending'}
      <form method="POST" action="?/start">
        <button class="btn" type="submit">Start lobby</button>
      </form>
    {/if}
    {#if canJoin}
      <form method="POST" action="?/join">
        <button class="btn" type="submit">Join</button>
      </form>
    {:else if data.member}
      <span class="joined muted">✓ joined</span>
    {/if}
  </div>
</section>

{#if data.lobby.state === 'pending'}
  <div class="card notice">
    Waiting to start — scores aren't recorded yet. {#if data.isCreator}Start the lobby when everyone
      has joined.{:else}The host will start it soon.{/if}
  </div>
{:else if winner}
  <div class="card notice winner">🏆 {winner.username} wins with {fmtPp(winner.total_pp)}pp!</div>
{/if}

<h2 class="section-title">Leaderboard</h2>

{#if data.leaderboard.length === 0}
  <div class="card empty">No players have joined yet.</div>
{:else}
  <ol class="board">
    {#each data.leaderboard as row, i (row.id)}
      <li class="card board-row">
        <span class="rank" class:top={i === 0 && row.play_count > 0}>#{i + 1}</span>
        <a class="player" href={`/lobbies/${data.lobby.id}/users/${row.id}`}>
          {#if row.avatar_url}
            <img src={row.avatar_url} alt="" class="avatar" />
          {/if}
          <span class="name">{row.username}</span>
        </a>
        <span class="count muted">{row.play_count} plays</span>
        <span class="pp total">{fmtPp(row.total_pp)}pp</span>
      </li>
    {/each}
  </ol>
{/if}

<h2 class="section-title">Best plays</h2>
<PlayList
  scores={data.bestScores}
  lobbyId={data.lobby.id}
  emptyMessage="No plays tracked in this lobby yet."
/>

<style>
  .lobby-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 1.5rem;
    margin: 2rem 0 1.25rem;
  }

  .title-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .title-row h1 {
    margin: 0;
    font-size: 1.8rem;
  }

  .sub {
    margin-top: 0.35rem;
    font-size: 0.9rem;
  }

  .head-actions {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .joined {
    font-weight: 600;
    color: #7ce07c;
  }

  .notice {
    padding: 1rem 1.25rem;
    margin-bottom: 1.25rem;
  }

  .winner {
    color: var(--gold);
    font-weight: 700;
  }

  .section-title {
    margin: 0 0 1rem;
  }

  .empty {
    padding: 1.5rem;
    text-align: center;
  }

  .board {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .board-row {
    display: grid;
    grid-template-columns: 3rem 1fr auto auto;
    align-items: center;
    gap: 1rem;
    padding: 0.75rem 1.1rem;
    transition: border-color 0.15s ease;
  }

  .board-row:hover {
    border-color: var(--pink);
  }

  .rank {
    font-weight: 800;
    color: var(--text-muted);
    font-size: 1.05rem;
  }

  .rank.top {
    color: var(--gold);
  }

  .player {
    display: inline-flex;
    align-items: center;
    gap: 0.7rem;
    color: var(--text);
    font-weight: 600;
  }

  .avatar {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    object-fit: cover;
    border: 1px solid var(--border);
  }

  .total {
    font-size: 1.05rem;
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
