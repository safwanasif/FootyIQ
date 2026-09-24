"use client";

import contract from "@/lib/shot-context.json";
import { type ShotContext, defaultContext } from "@/lib/api";

const keys = ["body_part", "technique", "shot_type", "play_pattern"] as const;
const optionLabel = (key: string, value: string) => key === "shot_type" ? ({ "Free Kick": "Direct free-kick shot", "Open Play": "In-play shot" }[value] ?? value) : key === "play_pattern" ? ({ "From Free Kick": "Attack from a free kick", "Regular Play": "Regular play" }[value] ?? value) : value;
const labels = { body_part: "Body part", technique: "Technique", shot_type: "How the shot is taken", play_pattern: "How the attack started" };

export default function ContextControls({ value, onChange }: { value: ShotContext; onChange: (value: ShotContext) => void }) {
  return <fieldset className="context-controls"><legend>Describe the chance</legend>
    <p>Defaults: right foot, normal technique, open play, regular build-up. Linked choices show supported combinations; changing an earlier choice may adjust later choices.</p>
    <div>{keys.map((key, index) => {
      const prefix = keys.slice(0, index);
      const available = contract.combinations.filter(row => prefix.every(k => row[k] === value[k]));
      const options = [...new Set(available.map(row => row[key]))];
      return <label key={key}>{labels[key]}<select aria-label={labels[key]} value={value[key]} onChange={event => {
        const matches = available.filter(row => row[key] === event.target.value);
        const chosen = matches.find(row => keys.slice(index + 1).every(k => row[k] === value[k])) ?? matches[0];
        onChange(Object.fromEntries(keys.map(k => [k, chosen[k]])) as ShotContext);
      }}>{options.map(option => <option key={option} value={option}>{optionLabel(key, option)}</option>)}</select></label>;
    })}</div>
    <details className="model-disclosure"><summary>What do these choices mean?</summary><p>How the shot is taken describes the shot itself: a direct free-kick shot is taken straight at goal from the restart. An in-play shot can happen later in an attack that started with a free kick, such as a header from a free-kick cross. How the attack started describes that possession sequence, so both free-kick fields can legitimately apply.</p><p>Left and right foot describe the foot used, not the player’s strong or weak foot. Small model differences are associations in this sample, not evidence that one foot is inherently better. Linked choices may change other fields, so check all four before comparing.</p></details>
    <p>Each offered combination appears in at least {contract.minimum_training_shots} training shots. This does not guarantee accurate estimates at every pitch position.</p>
    <button className="text-button" type="button" onClick={() => onChange(defaultContext)}>Reset context</button>
  </fieldset>;
}
