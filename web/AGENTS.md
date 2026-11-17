# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

The audience catalogue keeps the warm dark screening-room palette. Its featured row is a centered carousel: the active film stays centered, clicking left/right advances one film, side cards shrink and fade, touch swipe and keyboard arrows are supported. No hover-driven selection. Keep the searchable catalogue grid below.

Do not show a progress/footer row beneath the featured-film description: the user removed the film counter, pagination dots and “左右切换” hint. Use the side arrows/cards, keyboard and swipe for navigation.

The shared header uses an elegant calligraphic 映场 SVG wordmark with a small seal. Both viewers and administrators log in or register. Display account/avatar and logout controls; do not restore a role-switching entry. Administrator registration uses a single-use invitation from an existing administrator.

The user wants a richer real-documentary catalogue and substantial introductions researched from the web. Prefer official programme or publisher sources; retain source links, distinguish editions/seasons, and label synthetic demo reviews and illustrative artwork clearly. Preserve existing film ids and reviews when adding researched content.

The shared catalogue defaults to all films with a single 全部影片 control alongside the category filters. Label demo films in the list and retain their original review associations. The complete admin editor owns the same rich fields shown on film details. Preserve search, category and scroll when returning from details. Statistics and dimension averages must be supplied by C++; frontend charts only format those returned numbers.

Viewer preferences, history and favorites belong to the current account and are stored by C++ in users.txt. Administrators have no viewer activity access. Discard private page state on account changes and preserve the role-specific review response fields.

The only normal operation entry is the website. Node.js owns HTTP, sessions and the persistent C++ subprocess bridge. C++ owns all catalogue/review validation, search, mutations, scoring, ranking, distribution and business file writes. Never reintroduce a JavaScript business store or browser scoring fallback. Runtime data lives only in project-root data/documentaries.txt, data/reviews.txt and data/users.txt (accounts and invitation hashes). The debug terminal shares those files and the directory lock. resources/catalog-seed.json is initialization/legacy compatibility input, not an active database. Preserve migration backups and film ids.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.
