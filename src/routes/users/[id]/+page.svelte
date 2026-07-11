<script lang="ts">
  import { onMount } from 'svelte';
  import { liveUpdates } from '$lib/live';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  // This profile only cares about its own user's new best plays.
  onMount(() => liveUpdates((userId) => userId === data.profile.id));

  const fmtPp = (n: number) => Math.round(n).toLocaleString('en-US');
  const fmtAcc = (a: number | null) => (a == null ? '' : `${(a * 100).toFixed(2)}%`);

  function modAcronyms(mods: string[]): string[] {
    // Feed mods are objects like { acronym: "HD" }; be tolerant of shapes.
    return (mods ?? [])
      .map((m) => (typeof m === 'string' ? m : ((m as { acronym?: string })?.acronym ?? '')))
      .filter(Boolean);
  }
</script>

<section class="profile-head card">
  {#if data.profile.avatar_url}
    <img src={data.profile.avatar_url} alt="" class="avatar" />
  {/if}
  <div class="who">
    <h1>{data.profile.username}</h1>
    {#if data.profile.country_code}
      <span class="muted">{data.profile.country_code}</span>
    {/if}
  </div>
  <div class="total-box">
    <div class="total-pp">{fmtPp(data.totalPp)}<span class="unit">pp</span></div>
    <div class="muted total-label">total weighted pp</div>
  </div>
</section>

{#if data.isOwner}
  <div class="owner-actions">
    <form
      method="POST"
      action={`/users/${data.profile.id}/reset`}
      onsubmit={(e) => {
        if (!confirm('Delete all of your tracked scores? This cannot be undone.')) {
          e.preventDefault();
        }
      }}
    >
      <button class="btn btn-danger" type="submit">Reset my scores</button>
    </form>
  </div>
{/if}

<h2 class="section-title">Best plays</h2>

{#if data.scores.length === 0}
  <div class="card empty">
    No tracked plays yet. Set some scores in osu!standard and they'll appear here within seconds.
  </div>
{:else}
  <ol class="plays">
    {#each data.scores as s, i (s.beatmap_id)}
      <li class="card play">
        <span class="idx muted">#{i + 1}</span>
        <div class="map">
          <div class="title">
            {s.artist ? `${s.artist} — ` : ''}{s.title ?? `Beatmap ${s.beatmap_id}`}
          </div>
          <div class="sub muted">
            {#if s.version}<span class="ver">[{s.version}]</span>{/if}
            {#if s.difficulty_rating != null}<span class="stars"
                >★ {s.difficulty_rating.toFixed(2)}</span
              >{/if}
            {#each modAcronyms(s.mods) as mod (mod)}<span class="mod">{mod}</span>{/each}
          </div>
        </div>
        <div class="stats">
          {#if s.rank}<span class="rank rank-{s.rank}">{s.rank}</span>{/if}
          {#if s.accuracy != null}<span class="acc muted">{fmtAcc(s.accuracy)}</span>{/if}
        </div>
        <span class="pp play-pp">{fmtPp(s.pp)}pp</span>
      </li>
    {/each}
  </ol>
{/if}

<style>
  .profile-head {
    display: flex;
    align-items: center;
    gap: 1.25rem;
    padding: 1.5rem;
    margin: 2rem 0 1.25rem;
  }

  .avatar {
    width: 88px;
    height: 88px;
    border-radius: 16px;
    object-fit: cover;
    border: 1px solid var(--border);
  }

  .who {
    flex: 1;
  }

  .who h1 {
    margin: 0;
    font-size: 1.9rem;
  }

  .total-box {
    text-align: right;
  }

  .total-pp {
    font-size: 2rem;
    font-weight: 800;
    color: var(--pink-bright);
    line-height: 1;
  }

  .total-pp .unit {
    font-size: 1rem;
    margin-left: 0.15rem;
    color: var(--purple);
  }

  .total-label {
    font-size: 0.8rem;
    margin-top: 0.35rem;
  }

  .owner-actions {
    display: flex;
    justify-content: flex-end;
    margin-bottom: 1.5rem;
  }

  .section-title {
    margin: 0 0 1rem;
  }

  .empty {
    padding: 1.5rem;
    text-align: center;
  }

  .plays {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
  }

  .play {
    display: grid;
    grid-template-columns: 2.5rem 1fr auto auto;
    align-items: center;
    gap: 1rem;
    padding: 0.7rem 1.1rem;
    transition: border-color 0.15s ease;
  }

  .play:hover {
    border-color: var(--pink);
  }

  .idx {
    font-weight: 700;
  }

  .title {
    font-weight: 600;
  }

  .sub {
    font-size: 0.85rem;
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
    margin-top: 0.15rem;
  }

  .ver {
    color: var(--purple);
  }

  .mod {
    background: rgba(201, 160, 255, 0.15);
    color: var(--purple);
    border-radius: 5px;
    padding: 0 0.35rem;
    font-weight: 700;
    font-size: 0.75rem;
  }

  .stats {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }

  .rank {
    font-weight: 800;
    font-size: 0.9rem;
  }

  .rank-X,
  .rank-XH {
    color: var(--gold);
  }

  .rank-S,
  .rank-SH {
    color: var(--purple);
  }

  .rank-A {
    color: #7ce07c;
  }

  .play-pp {
    font-size: 1.05rem;
    min-width: 5rem;
    text-align: right;
  }
</style>
