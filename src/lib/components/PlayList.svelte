<script lang="ts">
  export interface PlayListItem {
    beatmap_id: number;
    pp: number;
    accuracy: number | null;
    mods: string[];
    rank: string | null;
    title: string | null;
    artist: string | null;
    version: string | null;
    difficulty_rating: number | null;
    // Present when a list spans multiple users (e.g. a lobby-wide best-plays
    // pane) so each row can show + link to whose play it is. Absent for a
    // single user's own play list.
    user_id?: number;
    username?: string;
    avatar_url?: string | null;
  }

  let {
    scores,
    lobbyId,
    emptyMessage = 'No tracked plays yet.',
  }: {
    scores: PlayListItem[];
    lobbyId?: number;
    emptyMessage?: string;
  } = $props();

  const fmtPp = (n: number) => Math.round(n).toLocaleString('en-US');
  const fmtAcc = (a: number | null) => (a == null ? '' : `${(a * 100).toFixed(2)}%`);

  function modAcronyms(mods: string[]): string[] {
    // Feed mods are objects like { acronym: "HD" }; be tolerant of shapes.
    return (mods ?? [])
      .map((m) => (typeof m === 'string' ? m : ((m as { acronym?: string })?.acronym ?? '')))
      .filter(Boolean);
  }
</script>

{#if scores.length === 0}
  <div class="card empty">{emptyMessage}</div>
{:else}
  <ol class="plays">
    {#each scores as s, i (s.user_id != null ? `${s.user_id}-${s.beatmap_id}` : s.beatmap_id)}
      <li class="card play" class:with-user={s.user_id != null}>
        <span class="idx muted">#{i + 1}</span>
        {#if s.user_id != null}
          <a class="who" href={`/lobbies/${lobbyId}/users/${s.user_id}`}>
            {#if s.avatar_url}
              <img src={s.avatar_url} alt="" class="who-avatar" />
            {/if}
            <span class="who-name">{s.username}</span>
          </a>
        {/if}
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

  .play.with-user {
    grid-template-columns: 2.5rem auto 1fr auto auto;
  }

  .play:hover {
    border-color: var(--pink);
  }

  .idx {
    font-weight: 700;
  }

  .who {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--text);
    font-weight: 600;
  }

  .who-avatar {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    object-fit: cover;
    border: 1px solid var(--border);
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
