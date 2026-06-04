import type { Fixture, Group } from '../types'

// 2026 FIFA World Cup Group Stage — 12 groups of 4 teams, 6 fixtures each = 72 total
// Schedule derived from the official draw (Dec 2024) and published fixture list

const TEAM_ORDER: Record<Group, [string, string, string, string]> = {
  A: ['Mexico', 'South Africa', 'South Korea', 'Czechia'],
  B: ['Canada', 'Bosnia and Herzegovina', 'Qatar', 'Switzerland'],
  C: ['Brazil', 'Morocco', 'Haiti', 'Scotland'],
  D: ['USA', 'Paraguay', 'Australia', 'Türkiye'],
  E: ['Germany', 'Curaçao', "Côte d'Ivoire", 'Ecuador'],
  F: ['Netherlands', 'Japan', 'Sweden', 'Tunisia'],
  G: ['Belgium', 'Egypt', 'IR Iran', 'New Zealand'],
  H: ['Spain', 'Cabo Verde', 'Saudi Arabia', 'Uruguay'],
  I: ['France', 'Senegal', 'Iraq', 'Norway'],
  J: ['Argentina', 'Algeria', 'Austria', 'Jordan'],
  K: ['Portugal', 'DR Congo', 'Uzbekistan', 'Colombia'],
  L: ['England', 'Croatia', 'Ghana', 'Panama'],
}

// MD1 dates for each group's two games [game1date, game2date]
const MD1_DATES: Record<Group, [string, string]> = {
  A: ['2026-06-11', '2026-06-11'],
  B: ['2026-06-12', '2026-06-13'],
  C: ['2026-06-13', '2026-06-13'],
  D: ['2026-06-12', '2026-06-13'],
  E: ['2026-06-14', '2026-06-14'],
  F: ['2026-06-14', '2026-06-14'],
  G: ['2026-06-15', '2026-06-15'],
  H: ['2026-06-15', '2026-06-15'],
  I: ['2026-06-16', '2026-06-16'],
  J: ['2026-06-16', '2026-06-17'],
  K: ['2026-06-17', '2026-06-17'],
  L: ['2026-06-17', '2026-06-17'],
}

const MD2_DATES: Record<Group, [string, string]> = {
  A: ['2026-06-18', '2026-06-18'],
  B: ['2026-06-18', '2026-06-18'],
  C: ['2026-06-19', '2026-06-19'],
  D: ['2026-06-19', '2026-06-20'],
  E: ['2026-06-20', '2026-06-20'],
  F: ['2026-06-20', '2026-06-21'],
  G: ['2026-06-21', '2026-06-21'],
  H: ['2026-06-21', '2026-06-21'],
  I: ['2026-06-22', '2026-06-22'],
  J: ['2026-06-22', '2026-06-22'],
  K: ['2026-06-23', '2026-06-23'],
  L: ['2026-06-23', '2026-06-23'],
}

const MD3_DATES: Record<Group, [string, string]> = {
  A: ['2026-06-22', '2026-06-22'],
  B: ['2026-06-22', '2026-06-22'],
  C: ['2026-06-23', '2026-06-23'],
  D: ['2026-06-23', '2026-06-23'],
  E: ['2026-06-24', '2026-06-24'],
  F: ['2026-06-24', '2026-06-24'],
  G: ['2026-06-25', '2026-06-25'],
  H: ['2026-06-25', '2026-06-25'],
  I: ['2026-06-26', '2026-06-26'],
  J: ['2026-06-26', '2026-06-26'],
  K: ['2026-06-27', '2026-06-27'],
  L: ['2026-06-27', '2026-06-27'],
}

function buildGroup(group: Group): Fixture[] {
  const [t1, t2, t3, t4] = TEAM_ORDER[group]
  const [d1a, d1b] = MD1_DATES[group]
  const [d2a, d2b] = MD2_DATES[group]
  const [d3a, d3b] = MD3_DATES[group]
  return [
    { id: `${group}1`, homeTeam: t1, awayTeam: t2, group, matchday: 1, date: d1a },
    { id: `${group}2`, homeTeam: t3, awayTeam: t4, group, matchday: 1, date: d1b },
    { id: `${group}3`, homeTeam: t1, awayTeam: t3, group, matchday: 2, date: d2a },
    { id: `${group}4`, homeTeam: t4, awayTeam: t2, group, matchday: 2, date: d2b },
    { id: `${group}5`, homeTeam: t1, awayTeam: t4, group, matchday: 3, date: d3a },
    { id: `${group}6`, homeTeam: t2, awayTeam: t3, group, matchday: 3, date: d3b },
  ]
}

export const FIXTURES: Fixture[] = (
  ['A','B','C','D','E','F','G','H','I','J','K','L'] as Group[]
).flatMap(buildGroup)

export const FIXTURES_BY_GROUP: Record<Group, Fixture[]> = {} as Record<Group, Fixture[]>
for (const g of ['A','B','C','D','E','F','G','H','I','J','K','L'] as Group[]) {
  FIXTURES_BY_GROUP[g] = FIXTURES.filter(f => f.group === g)
}

export const GROUP_TEAMS: Record<Group, string[]> = {} as Record<Group, string[]>
for (const [g, teams] of Object.entries(TEAM_ORDER) as [Group, string[]][]) {
  GROUP_TEAMS[g] = teams
}

export const TEAM_FLAGS: Record<string, string> = {
  'Mexico': '🇲🇽',
  'South Africa': '🇿🇦',
  'South Korea': '🇰🇷',
  'Czechia': '🇨🇿',
  'Canada': '🇨🇦',
  'Bosnia and Herzegovina': '🇧🇦',
  'Qatar': '🇶🇦',
  'Switzerland': '🇨🇭',
  'Brazil': '🇧🇷',
  'Morocco': '🇲🇦',
  'Haiti': '🇭🇹',
  'Scotland': '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
  'USA': '🇺🇸',
  'Paraguay': '🇵🇾',
  'Australia': '🇦🇺',
  'Türkiye': '🇹🇷',
  'Germany': '🇩🇪',
  'Curaçao': '🇨🇼',
  "Côte d'Ivoire": '🇨🇮',
  'Ecuador': '🇪🇨',
  'Netherlands': '🇳🇱',
  'Japan': '🇯🇵',
  'Sweden': '🇸🇪',
  'Tunisia': '🇹🇳',
  'Belgium': '🇧🇪',
  'Egypt': '🇪🇬',
  'IR Iran': '🇮🇷',
  'New Zealand': '🇳🇿',
  'Spain': '🇪🇸',
  'Cabo Verde': '🇨🇻',
  'Saudi Arabia': '🇸🇦',
  'Uruguay': '🇺🇾',
  'France': '🇫🇷',
  'Senegal': '🇸🇳',
  'Iraq': '🇮🇶',
  'Norway': '🇳🇴',
  'Argentina': '🇦🇷',
  'Algeria': '🇩🇿',
  'Austria': '🇦🇹',
  'Jordan': '🇯🇴',
  'Portugal': '🇵🇹',
  'DR Congo': '🇨🇩',
  'Uzbekistan': '🇺🇿',
  'Colombia': '🇨🇴',
  'England': '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  'Croatia': '🇭🇷',
  'Ghana': '🇬🇭',
  'Panama': '🇵🇦',
}

export const ALL_TEAMS = Object.keys(TEAM_FLAGS).sort()
