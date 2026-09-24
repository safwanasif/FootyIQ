"use client";

import contract from "@/lib/shot-context.json";
import { type ShotContext, defaultContext } from "@/lib/api";

const keys = ["body_part", "technique", "shot_type", "play_pattern"] as const;
const labels = { body_part: "Body part", technique: "Technique", shot_type: "Shot type", play_pattern: "Build-up" };

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
      }}>{options.map(option => <option key={option}>{option}</option>)}</select></label>;
    })}</div>
    <p>Each offered combination appears in at least {contract.minimum_training_shots} training shots. This does not guarantee accurate estimates at every pitch position.</p>
    <button className="text-button" type="button" onClick={() => onChange(defaultContext)}>Reset context</button>
  </fieldset>;
}
