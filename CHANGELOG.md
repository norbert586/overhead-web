# Changelog

All notable changes to Overhead are tracked here.
Entries are appended automatically when a pull request is merged into `main`.

## 2026-05-09

- Quote-safe alias for the admin overview unique-aircraft count ([#39](https://github.com/norbert586/overhead-web/pull/39))
- Add admin dashboard with overview, users, and changelog ([#38](https://github.com/norbert586/overhead-web/pull/38))

## 2026-05-08

- Stabilize Overhead tab so it stays populated across refetches ([#37](https://github.com/norbert586/overhead-web/pull/37))

## 2026-05-07

- Replace broken aircraft-photo Tier 3 with same-model DB surrogate ([#36](https://github.com/norbert586/overhead-web/pull/36))
- Fix Endeavor Air (Delta Connection) misclassified as government ([#35](https://github.com/norbert586/overhead-web/pull/35))

## 2026-05-06

- Fix Overhead pane sliding off-screen entirely ([#34](https://github.com/norbert586/overhead-web/pull/34))
- Add Overhead flight tab with live device location ([#33](https://github.com/norbert586/overhead-web/pull/33))

## 2026-05-02

- Deduplicate country achievements — one per country, keep newer content ([#32](https://github.com/norbert586/overhead-web/pull/32))
- Add 99 new country achievements; expand COUNTRY_META for all 137 entries ([#31](https://github.com/norbert586/overhead-web/pull/31))

## 2026-04-29

- feat: show flag emoji and country name on country achievements ([#30](https://github.com/norbert586/overhead-web/pull/30))
- feat: harder ranks, score explainer, badge fix, 38 country achievements ([#29](https://github.com/norbert586/overhead-web/pull/29))
- fix: replace JSX.Element with ReactElement for React 19 compatibility ([#28](https://github.com/norbert586/overhead-web/pull/28))
- feat: add achievement system and rank progression to profile screen ([#27](https://github.com/norbert586/overhead-web/pull/27))
- Improve date range filter UX: draft state, presets, styled inputs ([#26](https://github.com/norbert586/overhead-web/pull/26))
- Redesign log page: date range filter, nested tabs, mobile layout ([#24](https://github.com/norbert586/overhead-web/pull/24))

## 2026-04-28

- Add server-side background scanner — record all aircraft continuously ([#23](https://github.com/norbert586/overhead-web/pull/23))
- Fix photo cascade bug and add per-source attribution tag ([#22](https://github.com/norbert586/overhead-web/pull/22))

## 2026-04-27

- Replace notable activity list with swipable card carousel ([#21](https://github.com/norbert586/overhead-web/pull/21))
- Deep-dive fix: enrichment resilience, null safety, classifier overhaul ([#20](https://github.com/norbert586/overhead-web/pull/20))
- Fix image waterfall, add expandable route details, clean mobile expanded rows ([#19](https://github.com/norbert586/overhead-web/pull/19))

## 2026-04-25

- Persist user settings server-side across sessions and devices ([#18](https://github.com/norbert586/overhead-web/pull/18))

## 2026-04-24

- Fix stats page 2x overflow: Recharts min-width grid inflation ([#17](https://github.com/norbert586/overhead-web/pull/17))
- Fix mobile horizontal overflow and map not rendering ([#16](https://github.com/norbert586/overhead-web/pull/16))
- Fix mobile layout overflow causing stats cards to be cut off ([#15](https://github.com/norbert586/overhead-web/pull/15))

## 2026-04-23

- Mobile UI improvements: fix overflow, log/stats touch targets and layout ([#14](https://github.com/norbert586/overhead-web/pull/14))

## 2026-04-22

- Add README ([#13](https://github.com/norbert586/overhead-web/pull/13))
- Polish: on-brand favicon, theme-color, apple-touch-icon, meta description ([#12](https://github.com/norbert586/overhead-web/pull/12))
- Fix Leaflet map on mobile: set explicit px height on leaflet-container ([#11](https://github.com/norbert586/overhead-web/pull/11))
- Fix Leaflet map on mobile and Intel value clipping ([#10](https://github.com/norbert586/overhead-web/pull/10))
- Fix mobile: show coordinates in top bar, fix Leaflet map blank on mobile ([#9](https://github.com/norbert586/overhead-web/pull/9))
- Fix mobile layout: unlock scrolling and improve flight screen on small screens ([#8](https://github.com/norbert586/overhead-web/pull/8))
- Claude/plan app deployment bv mwl ([#7](https://github.com/norbert586/overhead-web/pull/7))
- Add error logging to enrichment catch blocks for production debugging ([#6](https://github.com/norbert586/overhead-web/pull/6))

## 2026-04-21

- Fix API base URL to use relative paths in production ([#5](https://github.com/norbert586/overhead-web/pull/5))
- Fix TypeScript types and remove unused variable in StatsScreen ([#4](https://github.com/norbert586/overhead-web/pull/4))

## 2026-04-12

- Fix mobile/LAN access: expose servers on all network interfaces ([#2](https://github.com/norbert586/overhead-web/pull/2))

## 2026-04-02

- Feature/multi user auth ([#1](https://github.com/norbert586/overhead-web/pull/1))
