# Product scope

## Customer and core job

Initial buyer: independent gym owner. Users: owner, manager, receptionist, optional accountant and trainer. The owner needs to know who can enter, who needs renewal, who owes fees, and what was collected/spent.

Success is a real workflow: register member → select membership → issue invoice → record payment → print receipt → activate/check in → renew. A second gym uses the same product with isolated data, staff, and configuration.

## Release A — first operating release

Staff login/logout, controlled provisioning/invitation, recovery, roles; organization isolation and one default branch; gym settings/branding/time zone/currency; staff permissions and audit; member directory/profile/contact/notes/archive; versioned plans; enrollment/renewal/freeze/cancellation; invoices/partial payments/receipts/refunds/credits; manual/scanner check-in and checkout; real dashboard; expenses; basic reports; previewed CSV import/scoped export; private attachments; backups and restore rehearsal.

Every enabled page needs usable loading/empty/error/permission states and laptop/tablet support. Important phone workflows must remain usable.

## Release B — expanded reference suite

Trainers and assignments/PT schedules; classes, capacity and booking; enquiry pipeline, trials and follow-ups; fuller multi-branch workflows; recurring expense jobs and scheduled reminders when explicitly implemented.

The 13 images describe the eventual consistent suite. Feature-gate unfinished modules rather than presenting broken navigation or fabricated data as completed features.

## Separate later scope

Member portal/native apps, biometric/turnstile integrations, offline synchronization, online gateways, full payroll, POS/inventory, medical records, workout/nutrition prescription, AI assistants, automatic external messaging, and self-service SaaS subscription billing.

Recording a cash/bank-transfer payment is not a payment-gateway integration. Do not store card numbers, bank passwords, biometric templates, or national identity numbers for this MVP.

## Product packaging

One codebase, organization-specific configuration and optional modules. Avoid a new code fork per customer. Start with owner-assisted gym provisioning. The gym's invoices to members are separate from Hanova's subscription invoices to gym owners; Settings > Billing is deferred SaaS scope.

Default currency PKR/time zone Asia/Karachi, configurable per organization. Do not combine currencies in organization totals. No fixed sale price, tax handling, compliance guarantee, uptime promise, or delivery date is established by this pack.

Localhost serves the developer's machine. Shared reception devices require deliberate LAN/hosted setup; local-first does not mean offline synchronization. Confirm actual registration/payment/refund policies with a pilot gym before live use.
