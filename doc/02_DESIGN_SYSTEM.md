# Design system and UX

Use `references/01_dashboard.png` as the visual anchor. Implement the flat application, not the original laptop/desk scene. Generated images can disagree on names, dates, labels and numbers; written rules and consistent fixtures override those details.

## Initial tokens

| Token | Value | Use |
| --- | --- | --- |
| Canvas | #F7F8F7 | Main background |
| Surface | #FFFFFF | Panels/forms/tables |
| Primary text | #202725 | Main content |
| Secondary text | #68716D | Supporting content |
| Accent | #416658 | Main actions/chart emphasis |
| Selected | #DCE5E0 | Navigation/tabs |
| Border | #E7EBE8 | Necessary boundaries |
| Success | #E7F1E9 / #2F6844 | Labeled positive status |
| Warning | #FFF1DE / #8A571F | Labeled due/expiring |
| Danger | #FBE8E7 / #983F3A | Error/denial |

Check contrast in the real UI and adjust text colors if needed. Light theme, no gradients, glass blur, blinking dots, emojis, thick borders, ornamental lines, saturated green flooding, or clutter. Sidebar text needs no icon for each item.

Use Inter or similar clean sans-serif, preferably bundled locally. Heading approximately 28px/600; body 14–16px; labels 13–14px; tabular numerals for money. Spacing 4/8/12/16/24/32/40px. Panels radius 16px, controls 10px, very soft shadow. Tables around 56–64px row height; readable first.

## Shell

Sidebar 210–240px, main padding 28–32px, header about 72px. Navigation: Dashboard, Members, Plans, Attendance, Payments, Classes, Trainers, Enquiries, Expenses, Reports; Settings bottom. Hide unauthorized/disabled modules. An extremely faint bottom weights illustration is optional and must not compete with text.

Header contains organization/branch context, working search and avatar menu. Hide branch picker for one branch. Start global search with authorized member lookup rather than a fake universal search box. Page header has title, short subtitle, one main action. Avoid unnecessary KPI rows on every list.

## Shared workflows

- Tables: server pagination, allowlisted sort/filter, debounced search, readable columns, row-level text actions. Preserve non-sensitive filters in URL.
- Registration: focused drawer/page with personal details → membership → payment summary. Minimum contact data; show charge/dates before confirmation.
- Payment drawer: member/invoice, remaining balance, amount, method, cash date, optional reference. Preserve inputs after failure.
- Renewal: prefill next valid period and rate snapshot; show exact dates; never overwrite current history.
- Check-in: prominent search/scanner focus, clear allowed/denied text and reason, explicit authorized override.
- Corrections: archive/cancel/reverse with real effect explained. Do not delete finance to make the table look clean.
- Feedback: restrained inline errors/status/toasts, meaningful retry, no celebration effects.

All pages need loading, no records, no search matches, validation failure, request failure/retry, forbidden, expired session, and successful save states. Never replace database failure with demo rows. Fixture mode displays a persistent small `Demo data` label and is disabled in production.

## Responsive/accessibility gate

Review 1440px and 1280px desktop, 768px tablet, and 390px essentials. Collapse navigation; stack panels; allow table scrolling inside a container. Do not shrink text to fit. Essential lookup/check-in/payment flows stay usable on phone.

Use semantic labels/headings, visible focus, keyboard support, adequate contrast, usable touch targets, and status text beyond color. Drawers trap focus, restore trigger focus, and handle Escape safely. Respect reduced motion. Capture actual running UI and compare spacing, typography, density and icon restraint; screenshots do not prove backend correctness.
