# MIDAS Project Mission: Advanced Quant Lab

## Primary Objective
MIDAS is a high-precision, multi-timeframe development, optimization, and microstructure validation environment. It acts as a bridge connecting specialized AI orchestration, local data streams, and robust historical execution engines.

## Core Mandates
1. **Microstructure Validation Over Index Fakes**: Rejects raw cash index lines. All strategies must be tested against continuous raw contract archives (Dukascopy/Databento) using native asset step metrics (e.g., MNQ $2.00/point, MGC $10.00/oz).
2. **Order Book Priority Simulation**: Limit fills are not guaranteed on touch. Fills require price exhaustion or a 1-tick breach past execution targets plus realistic commission cushions.
3. **Automated Skill Pipeline**: Leverage specialized OpenClaw skills (`pinescript-mastery`, `lean-engine`, `finml-toolkit`) to enforce programmatic rule checks and multi-year backtesting validation.
4. **Zero-Bias Streaming Architecture**: Isolation-loop playback streams historical market bars one-by-one via WebSockets, eliminating lookahead leakage entirely.