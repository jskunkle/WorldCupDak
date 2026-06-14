// Raw shapes exactly as worldcup26.ir returns them (all values are strings).
export interface RawTeam {
  id: string;
  name_en: string;
  flag: string;
  fifa_code: string;
  iso2: string;
  groups: string;
}

export interface RawGame {
  id: string;
  home_team_id: string;
  away_team_id: string;
  home_score: string;
  away_score: string;
  group: string;
  matchday: string;
  local_date: string;
  finished: string; // "TRUE" | "FALSE"
  time_elapsed: string;
  type: string; // "group" for group-stage matches
  home_team_name_en: string;
  away_team_name_en: string;
}

// Normalized domain types used everywhere else.
export interface Team {
  id: string;
  name: string;
  code: string; // FIFA code, e.g. "MEX"
  flagUrl: string;
  group: string; // "A".."L"
}

export interface Game {
  id: string;
  homeId: string;
  awayId: string;
  homeName: string;
  awayName: string;
  homeScore: number;
  awayScore: number;
  group: string;
  matchday: number;
  kickoff: Date;
  finished: boolean;
  isGroupStage: boolean;
}

export interface StandingRow {
  rank: number;
  teamId: string;
  code: string;
  name: string;
  flagUrl: string;
  gp: number;
  w: number;
  d: number;
  l: number;
  gf: number;
  ga: number;
  gd: number;
  pts: number;
}

export interface GroupTable {
  group: string; // "A".."L"
  rows: StandingRow[];
}

export type FeedKind = "live" | "finished" | "upcoming";

export interface FeedMatch {
  id: string;
  kind: FeedKind;
  homeName: string;
  awayName: string;
  homeScore: number;
  awayScore: number;
  kickoff: Date;
}

export interface Snapshot {
  groups: GroupTable[];
  feed: FeedMatch[];
}
