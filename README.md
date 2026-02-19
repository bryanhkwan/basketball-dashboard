# NCAA Basketball Scouting Dashboard
A web-based scouting and player valuation tool for NCAA Men's and Women's Basketball (MBB/WBB). Built as a single-page dashboard that pulls live data from Google Sheets and runs all scoring, valuation, and analysis client-side in the browser.

#What It Does
The dashboard ingests player stat sheets (Guards and Bigs for both MBB and WBB) along with a configurable ScoringWeight table that defines which stats matter and how much. From there it:

-Normalizes and scores every player using a weighted composite formula. Each stat is normalized between a Min/Max range, scaled by its weight, and adjusted for direction (higher-is-better vs. lower-is-better like turnovers or defensive rating).
-Calculates a predicted dollar valuation using an exponential curve anchored to an average pay and a "star" target. The model asks: given a player's performance score relative to the pool, what should they be worth? A minutes-played multiplier is optionally applied to avoid inflating low-minute players.
-Assigns archetype tags (Shooter, Playmaker, Rim Protector, etc.) based on where a player's percentiles land across key stats.
-Computes a Fit Score using preset profiles (Balanced, Shooting, Defense, etc.) that weight percentile performance across different stat categories.
-Generates a full player profile on click — percentile bars, role tags with definitions, valuation breakdown, and every raw stat from the sheet.

Everything is sortable, searchable, and adjustable in real time. Weights, Min/Max bounds, valuation parameters, and fit presets can all be tweaked on the fly and the entire table recalculates instantly.

#About the "Actual $" Column
The values shown under Actual $ are fictional placeholder numbers meant for demonstration purposes only. They exist to showcase what the model is capable of — specifically, comparing model-predicted valuations against real-world salaries to surface over/undervalued players. The delta column (Δ$) highlights that gap. In a real deployment, you'd plug in actual NIL deal figures or salary data and use the model to find where the market might be mispricing talent.

#Tech
-Pure HTML/CSS/JS — no frameworks, no build step
-Pulls data from Google Sheets via the Sheets API (auto-loads on page open)
-Hosted on GitHub Pages
