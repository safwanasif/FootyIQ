import coverage from "./distance-support.json";
import contract from "./shot-context.json";
export function distanceSupport(distanceYards: number, context = contract.defaults): string | null {
  const row = coverage.combinations.find(row => row.body_part === context.body_part && row.technique === context.technique && row.shot_type === context.shot_type && row.play_pattern === context.play_pattern);
  if (!row) return "This shot context is not supported.";
  if (distanceYards < row.min_yards - .0001 || distanceYards > row.max_yards + .0001) return `Outside training range: this context was observed from ${row.min_yards.toFixed(1)} to ${row.max_yards.toFixed(1)} yards. Move the shot or change its context; no estimate is shown beyond that range.`;
  return null;
}
