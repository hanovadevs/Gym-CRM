# Business rules

Defaults enable development. Record policy changes before changing code. Pilot-owner questions appear in the risks file.

## Membership and access

Store [inclusive start, exclusive end) in gym-local calendar dates. Display 1–30 Nov from [2026-11-01, 2026-12-01). Expiry occurs at the start of 1 Dec in the gym's zone.

Calendar-month plans add months and clamp to a valid target date. Example: 31 Jan 2027 + one month ends exclusively 28 Feb, so access is through 27 Feb. Show exact dates before confirmation. Fixed 30-day plans add 30 calendar days instead. Test leap years/month ends.

Renewal defaults to current exclusive end, or today when already expired. Reject overlapping/pending duplicates; used plan versions retain price/duration/access snapshots. Lifecycle pending/active/cancelled is stored; upcoming/expired/frozen/expiring-soon are derived. Expiring soon means an otherwise active period ending within seven local days.

Freeze defaults to prospective dates, denies access during freeze and extends end once. Reject extension conflicts with future renewal. Reversal is audited and revalidates ranges. Cancellation stops access at its effective date; it does not automatically refund or erase debt.

Default initial activation requires invoice payment. Owner/manager may activate with debt using a recorded reason. Default expiry grace zero; screenshot three-day value is illustrative. Configure debt blocking separately. Return allowed plus reason: no_membership, not_started, expired, frozen, wrong_branch, debt_blocked, archived. Only authorized overrides with reasons.

## Attendance

One open visit per member/org, across branches. Duplicate scan returns existing visit; repeated checkout is safe. Highlight stale open visits for correction, never invent visit duration. Denied scans do not become successful visits.

## Finance

Money is exact minor units: Rs.4,500 = 450000 PKR minor units. Parse decimal input safely; reject negative/malformed/unsafe/cross-currency/over-balance payments.

Manual cash/bank transfer/Other initially; Card label only if actually accepted, with no card data storage. Invoice records charge; receipt records a committed payment. Partial payments each have receipts and remaining balance. Numbers are org-unique, atomic, never reused; gaps are acceptable.

Balance = issued invoice total − issued credits − (payment allocations − refund allocations).

Lock involved invoices/payments to enforce aggregate caps under concurrency. Payment is fully allocated in MVP; one invoice initially. Refund references original payment/allocation and cannot exceed refundable amount. Refund without credit reopens debt; service cancellation may pair explicit credit+refund atomically. A credit alone cannot create a negative balance on an already settled charge.

Record cash date, reason, approving actor and reference. Do not edit old amounts to correct errors. Membership cancellation is distinct from financial adjustment. No tax regime is assumed; validate tax/discount requirements separately.

Draft invoices may be edited before issue. Void an issued invoice only with authorized reason and no payment allocations or credit history; otherwise use explicit credit/refund corrections. Never reuse its number. For MVP discounts, record a validated fixed minor-unit amount per line, bounded by the pre-discount line total; calculate totals on the server.

## Metric definitions

| Metric | Meaning |
| --- | --- |
| Active members | Distinct non-archived members with active effective period today, excluding frozen/cancelled; debt eligibility separate |
| Today's check-ins | Successful visit openings in org-local day; repeated visits count; unique visitors separate |
| Currently inside | Open visits, stale visits flagged |
| Collected this month | Payments minus refunds by each cash date within local month |
| Expenses | Posted cash expenses minus reversals within period |
| Net cash flow | Collections minus expenses; do not call accounting profit |
| Outstanding | Sum of positive issued-invoice balances |
| Overdue invoices | Positive balance and due date before local today |
| Renewal rate | Eligible members whose period ended and renewed within seven days / ended-member cohort; show denominator |

Renewal rate is provisional until its seven-day observation window closes, N/A for zero denominator. Date filters translate local boundaries into UTC instants.

Branch attribution: memberships to home branch; visits to visit branch; invoice-linked payments/refunds to originating invoice branch snapshot; expenses to posted branch. Never duplicate a payment across branches.

## Release B

Booking validates eligibility, uniqueness and capacity while locking session. Reopening cancellation rechecks capacity. Trainer/room overlaps rejected under concurrency; adjacent intervals valid. Cancellation frees a seat; no waitlist initially. Enquiry converts to at most one member and retains history. Follow-ups remain internal tasks until external messaging is separately implemented/authorized.
