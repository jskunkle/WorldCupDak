import type { Team, Game } from "../../src/types";

export interface SourceSnapshot {
  teams: Team[];
  games: Game[];
}

export interface Source {
  name: string;
  fetchSnapshot(): Promise<SourceSnapshot>;
}
