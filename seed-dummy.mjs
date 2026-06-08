import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://lmgjjufijozpcnecvcly.supabase.co',
  'sb_publishable_hxkLtJrXYH4DwOPNLsW8Ug__yYCKSKu'
)

const GROUPS = ['A','B','C','D','E','F','G','H','I','J','K','L']

// All 72 fixture IDs
const ALL_FIXTURE_IDS = GROUPS.flatMap(g => [1,2,3,4,5,6].map(n => `${g}${n}`))

// 8 dummy players
const PLAYERS = [
  { name: 'Glen Kirkham',   winner: 'England',     scorer: 'Harry Kane' },
  { name: 'Sarah Kirkham',  winner: 'France',      scorer: 'Kylian Mbappé' },
  { name: 'Dave Kirkham',   winner: 'Brazil',      scorer: 'Vinicius Jr' },
  { name: 'Emma Kirkham',   winner: 'Argentina',   scorer: 'Lionel Messi' },
  { name: 'Tom Walsh',      winner: 'Spain',       scorer: 'Lamine Yamal' },
  { name: 'Jess Walsh',     winner: 'England',     scorer: 'Jude Bellingham' },
  { name: 'Mike Patel',     winner: 'Germany',     scorer: 'Florian Wirtz' },
  { name: 'Lucy Chen',      winner: 'France',      scorer: 'Antoine Griezmann' },
]

// Random score 0-4 weighted towards low scores
function randScore() {
  const scores = [0,0,0,1,1,1,1,2,2,2,3,3,4]
  return scores[Math.floor(Math.random() * scores.length)]
}

// Clear existing data
console.log('Clearing old data...')
await supabase.from('predictions').delete().neq('id', '00000000-0000-0000-0000-000000000000')
await supabase.from('participants').delete().neq('id', '00000000-0000-0000-0000-000000000000')
await supabase.from('results').delete().neq('id', '00000000-0000-0000-0000-000000000000')

// Insert participants
console.log('Inserting participants...')
const { data: participants } = await supabase
  .from('participants')
  .insert(PLAYERS.map(p => ({ name: p.name, winner_pick: p.winner, top_scorer_pick: p.scorer })))
  .select()

// Insert predictions for each participant
console.log('Inserting predictions...')
for (const participant of participants) {
  // Pick one random joker per group
  const jokers = {}
  for (const g of GROUPS) {
    const n = Math.ceil(Math.random() * 6)
    jokers[`${g}${n}`] = true
  }

  const preds = ALL_FIXTURE_IDS.map(fixtureId => ({
    participant_id: participant.id,
    fixture_id: fixtureId,
    home_score: randScore(),
    away_score: randScore(),
    is_joker: !!jokers[fixtureId],
  }))

  await supabase.from('predictions').insert(preds)
}

// Insert some results (Group A + B matchday 1 & 2, a few from C)
const RESULTS = [
  // Group A MD1
  { fixture_id: 'A1', home_score: 2, away_score: 1 }, // Mexico 2-1 South Africa
  { fixture_id: 'A2', home_score: 0, away_score: 0 }, // South Korea 0-0 Czechia
  // Group A MD2
  { fixture_id: 'A3', home_score: 1, away_score: 1 }, // Mexico 1-1 South Korea
  { fixture_id: 'A4', home_score: 0, away_score: 2 }, // Czechia 0-2 South Africa
  // Group B MD1
  { fixture_id: 'B1', home_score: 3, away_score: 0 }, // Canada 3-0 Bosnia
  { fixture_id: 'B2', home_score: 1, away_score: 2 }, // Qatar 1-2 Switzerland
  // Group C MD1
  { fixture_id: 'C1', home_score: 4, away_score: 1 }, // Brazil 4-1 Morocco
  { fixture_id: 'C2', home_score: 0, away_score: 3 }, // Haiti 0-3 Scotland
]

console.log('Inserting results...')
await supabase.from('results').insert(RESULTS)

// Reveal predictions + keep entries open
await supabase.from('tournament_settings')
  .update({ predictions_revealed: true, entries_open: false })
  .eq('id', 1)

console.log('Done! Open /dashboard to see the live leaderboard.')
