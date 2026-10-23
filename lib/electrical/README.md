# Vivid Electrical: calculation library

Formulas implemented from first principles (Ohm's law, power, the AWG definition, trigonometry). Every result returns the value, its unit, and the working, step by step, for display.

**Content rules**
- No text, tables or diagrams from Ugly's Electrical References, the NEC or any other copyrighted reference.
- NEC values (ampacity, conduit fill, derating, grounding) are never pre-filled. Callers pass values from the user's own code book through the company table.
- `LICENSED_REFERENCE_PACK=false` until a licensed content pack exists.
- Every result carries this disclaimer: *Calculation aid only. Verify against the NEC edition adopted by your jurisdiction. Electrical work must be performed by a licensed electrician.*

| Area | Functions |
|---|---|
| Ohm's law and power | `ohmsLaw` (any two of V, I, R, P), `threePhasePower`, `threePhaseKVA` |
| Conductors | `awgToCircularMils` (from d = 0.005·92^((36−n)/39)), `kcmilToCircularMils`, `awgToMm2` |
| Voltage drop | `voltageDrop`: 1φ 2·K·I·L/CM, 3φ √3·K·I·L/CM, % drop vs target, voltage at the load. K defaults 12.9 Cu / 21.2 Al (editable) |
| Transformers and motors | `transformerFullLoadCurrent`, `turnsRatio`, `motorCurrent` (user's FLA and multiplier) |
| Conduit bending | `offset`, `bendingTable` (computed, not hardcoded), `rollingOffset`, `threePointSaddle`, `fourPointSaddle`, `stubUp`, `backToBack` |
| Fill | `fill` (user's allowances and limits) |
| Conversions | ft↔m, HP↔kW, °F↔°C, AWG→mm² |

```
npm test    # 10 tests, each checked against a hand calculation to 4 significant figures
```
