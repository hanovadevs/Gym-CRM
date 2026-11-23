# How to use Mojym

Website guide content and implementation brief for the Hanova Devs website agent. Checked against implemented Mojym workflows on 23 November 2026.

## Instructions for the website agent

Create a **How to use Mojym** page alongside the Mojym product page, using the website's existing page structure and visual language. Link to it from the product detail page and include a return link to the product. Use the site's normal route conventions rather than inventing a separate documentation system.

The guide below supplies the content. Organize it with an accessible contents navigation, clear sections and numbered instructions. Collapsible sections may help on mobile, but essential instructions must remain readable and searchable. Follow the website's existing component patterns. Include reviewed interface images where they clarify a step; sanitize visible personal and financial information.

Keep the main guide focused on gym teams. The platform administration section is explicitly for Hanova's product operators and may belong in a separate administrator subsection if that better fits the site. Do not suggest ordinary gym owners can open cross-gym administration.

Do not publish this opening implementation brief as customer-facing text. The following sections are the guide content. Keep the feature limitations, payment explanations and permission notes with the relevant steps.

## Run your gym with connected records

Mojym brings member records, memberships, fees, attendance and coaching into one workspace. Start with your gym settings and plans, then register members and connect their memberships, invoices and payments. Daily work builds on those saved records.

Open the application at **https://mojym.hanovadevs.com**. Access is provided by your gym administrator or the Hanova Devs team. There is no public self-service account registration in the current product.

### A first member journey

1. Sign in and confirm that you are working in the correct gym and branch.
2. Check your gym settings and create an appropriate membership plan.
3. Add a member and review their contact details and joining date.
4. Set an individual monthly subscription during registration if you are the owner, or enroll the saved member in a plan from their profile.
5. Review the issued invoice and collect the payment outside Mojym using your gym's usual method.
6. Record the amount actually received in Mojym and download the paid receipt.
7. Check the member in through Attendance when their membership and access rules allow it.
8. Use the dashboard and fee schedule to follow upcoming renewals and unpaid balances.

Recording a payment in Mojym records money your gym has already received. It does not charge a card, debit a bank account or verify a transfer automatically.

## Sign in and understand your account

### Gym login and staff login

The primary gym account uses the **gym login ID** and password supplied during setup. The login ID looks like an email address, but it may only be an identifier for signing in to Mojym. It does not need to be a working mailbox.

The gym's **real owner email** is recorded separately for owner recovery and notifications. Staff members use their own provisioned email accounts. Do not exchange these identifiers or assume the gym login ID can receive mail.

1. Open Mojym and enter your login email or gym login ID.
2. Enter your password and choose **Sign in**.
3. If your account can access more than one gym, select the intended workspace when prompted.
4. Confirm the gym and any branch selection before making a change.

Dashboard is the normal landing page for permitted gym users. A role with different access may be directed to its permitted workspace instead.

### Reset a forgotten password

1. Select **Forgot password?** on the sign-in screen.
2. Enter the real owner email for a primary gym account, or your own email for a staff account, in **Recovery email**.
3. If the same owner email is associated with several gyms, also enter the intended **Gym login ID**.
4. Submit the request and check the relevant inbox and spam folder.
5. Open the recovery link and choose a new password that satisfies the form's requirements.
6. Sign in using the original gym login ID or staff email and your new password.

Recovery responses are deliberately neutral and do not confirm whether an account exists. If a link has expired or has already been used, request a new one. If the real owner email is incorrect, contact the product administrator; changing the gym's public contact email is not the same as changing its recovery destination.

### Navigation and section help

Desktop users have a collapsible sidebar. On phones and tablets, the main navigation is fixed at the bottom; open **More** for secondary sections. The available routes depend on your role and branch permissions.

Small information icons beside section headings explain the data or the effect of an action. Use them when a balance, date or status needs clarification.

## Set up the gym and team

### Review gym settings

Open **Settings** if your role allows it. Check the gym's details, branches, currency, time zone and receipt settings. Review the policies controlling grace periods, payment-dependent activation and whether outstanding debt blocks access.

Time zone affects daily activity and membership reminders. Currency affects prices and money displays. Review these choices carefully before everyday use, and read the effect described by the form before saving changes.

The account access panel distinguishes the gym login identifier and real recovery contact from public gym contact information. Only permitted platform administration can change the primary owner recovery contact.

### Give staff appropriate access

1. The owner opens the staff administration area in **Settings**.
2. Add the staff member using their real email and choose the appropriate role and branch access.
3. Use the invitation workflow so the recipient can set their own password.
4. Review active staff and branch access when responsibilities change.
5. Revoke access when a person should no longer use the workspace.

Assign the access needed for the person's job. A trainer profile and an employee profile are operational records; creating either does not automatically invite a person or grant a login.

### Understand role differences

| Role | Typical work |
| --- | --- |
| Owner | Gym setup, staff administration, individual fee agreements, financial corrections and daily operations |
| Manager | Permitted branch operations, members, plans, scheduling, employees and operational finance |
| Receptionist | Members, enrollment, collections, attendance and permitted bookings |
| Accountant | Permitted financial records, collections, expenses and salary payments |
| Trainer | Their linked coaching profile, schedule and permitted assigned-member information |

This is an orientation, not a promise of unrestricted access. Branch grants and action permissions determine the controls actually available. A trainer's access does not include the gym's member finance or other trainers' private records.

## Create membership plans

Open **Plans** and create a plan for the relevant branch. Enter its name, price, currency and duration, then choose its access benefits, such as gym-floor access, classes or personal training.

1. Check that the price and duration describe the offer you intend to sell.
2. Choose the correct branch/access arrangement and benefits.
3. Review the plan and save it.
4. Use the plan when enrolling a member or setting an owner-agreed monthly subscription.

For individual monthly fees at registration, select an active **one-month plan** in the member's home branch. Its benefits define the access being sold; the owner can agree the member's own monthly amount.

Plan changes retain version history. Changing a current catalog price does not rewrite amounts and benefits already saved on earlier membership terms or invoices.

## Register and manage members

### Add a member

1. Open **Members** and select **Add member**.
2. Enter the person's name and at least one usable contact method: phone or email.
3. Choose the home branch and joining date. Registration does not accept a joining date in the future.
4. If you are the owner and want to start an individual monthly subscription, enable that option and follow the monthly-fee steps below.
5. Review the registration before confirming.
6. Open the saved profile to verify the details and continue with membership or payment work.

If Mojym finds a possible shared-contact duplicate, review the matches. Open an existing member when that is the same person. When two people legitimately share contact details, use the provided confirmation and reason instead of changing their contact information just to bypass the warning.

### Work from the member profile

Search the directory and open the member. The profile brings together contact information, emergency details, permitted notes, membership history, invoices, payments and visits.

Use the dedicated edit action for contact changes. Read the confirmation and provide a reason where requested. Notes have their own visibility rules; only users with permission can view or change them.

### Archive or restore

Use archival when a member should no longer be active in everyday operations. Read the effect, provide the requested reason and confirm. Archived members cannot start new memberships or receive normal admission through the member workflow.

Archival retains the existing records. It does not erase invoices, payments or visit history, and it does not settle a balance. Use the archived-record filter and the permitted restore action if the person returns.

## Set an individual monthly fee and track its dates

### Set the agreement during registration

The owner can enable **Add monthly subscription** in the registration form.

1. Choose an active one-month access plan in the member's home branch.
2. Enter the member's agreed monthly fee in the displayed currency.
3. Choose the subscription start date. It must be today or later and cannot precede the joining date.
4. Choose how many days before the due date the fee should enter the reminder window, within the form's allowed range.
5. Review the member, rate and starting date together, then confirm registration.

Saving creates the member, individual fee agreement, first membership term and issued invoice together. A saved invoice is a charge, not proof of payment. Record received money separately.

### Read the billing timeline

The member profile shows the saved monthly amount, starting date and reminder context. Owners can use **Member fees** for a broader schedule and the dashboard for current reminders.

An **invoice due** item means an issued charge still has money outstanding. A **renewal due** item identifies an upcoming membership period that needs renewal. These are different actions: first inspect whether an invoice already exists before issuing another charge.

When the member renews under the active agreement, Mojym uses the saved individual rate. Use the owner's dedicated future-fee change or catalog opt-out workflow when the arrangement changes. Existing invoices and earlier membership snapshots remain unchanged.

### Owner reminder delivery

The owner can review reminder preferences and delivery history in the fee area. Upcoming fee information appears inside the CRM, and scheduled email summaries use the gym's separate real owner contact.

The current reminder workflow does not automatically email each member or collect a payment. An accepted email submission is not proof that the owner read it. Review a failed or uncertain delivery using the displayed controls; do not repeatedly force a send when acceptance is uncertain.

## Enroll, renew, freeze or cancel a membership

### Enroll an existing member

1. Open the member profile and its **Membership** section.
2. Select **Enroll member** when there is no previous term.
3. Choose a plan and valid start date.
4. Review the exact period, benefits, price and invoice effect.
5. Confirm and inspect the saved term and invoice.
6. Record payment where required by the gym's activation policy.

If registration already created the monthly term and invoice, use those saved records. Do not enroll again for the same period.

### Renew

Choose **Renew membership** from the profile. Review the proposed next period and rate, including any active individual fee agreement, before confirming. Review the resulting invoice and payment status. Avoid entering a second overlapping term to extend access.

### Freeze

Use the selected term's freeze action, enter the permitted dates and reason, and review the effect on access and the end date. Confirm only after the displayed result matches the intended agreement. Use the supported reversal action to correct an incorrect freeze rather than creating a competing term.

### Cancel

Use the membership cancellation action and review its effective date and access consequences. Cancellation and financial correction are separate operations. Cancelling a membership does not automatically refund money or erase its issued invoice.

## Invoices, payments and PDF receipts

### Review or issue an invoice

Open **Payments** to review invoices and balances, or open a member's invoices from their profile. Use filters to distinguish drafts, issued records and outstanding balances.

For a separate permitted charge, create a draft, enter the recipient and line details, review the amount and dates, then issue it. A draft is not an issued invoice. Membership enrollment already produces its own invoice; inspect the saved record before creating another charge.

Issued finance retains its history. Use the supported correction workflow when an issued charge is wrong rather than expecting ordinary editing to rewrite the original record.

### Record money received

1. Open the relevant invoice and choose **Record payment**, or begin from the permitted payment action and select the invoice.
2. Confirm the member, invoice, currency and remaining balance.
3. Enter the amount actually received, payment method and cash/receipt date, with a reference or note if needed.
4. Review the payment and confirm once.
5. Inspect the saved payment and the invoice's new balance.

You can record a partial payment and leave the remainder due. Record a later payment against that remaining balance. A paid receipt relates to its recorded payment; a partial receipt does not mean the entire invoice is paid.

### Download and share PDFs

Open the invoice's PDF action to download its invoice document. Open the saved payment receipt and use its PDF action for the paid receipt. Check the recipient, invoice number, amount and balance before sharing the file through your normal communication channel.

Downloading a document does not automatically email it to the member. Store and share member documents appropriately.

### Correct a financial mistake

The owner has specific correction actions for credits, refunds and voids. Read the effect on the charge, money received and balance, provide the required reason and review the retained result.

A credit is not necessarily a cash refund. A recorded refund is not an automatic bank transfer. If a payment or correction has saved but the following screen refresh fails, reload and inspect history before starting another transaction.

## Check members in and out

1. Open **Attendance** and confirm the branch.
2. Find the member using the supported lookup or QR workflow.
3. Check the displayed eligibility result and reason.
4. Confirm check-in when admission is allowed.
5. Use checkout when the visit ends.

Mojym checks membership dates, access benefits, freezes and the gym's configured payment/access rules. A repeated scan of someone already inside does not create a second open visit.

For a denial, inspect the underlying issue: an expired or future term, wrong branch, freeze, missing benefit, unpaid activation, debt rule or archived member. An authorized owner or manager may have a reasoned override action. Reception should not try to bypass a denial by changing records or creating duplicate membership terms.

This workflow does not operate a biometric reader or physical turnstile integration.

## Trainers and personal training

### Create a trainer profile and availability

Open **Trainers**, add the profile, choose its branches and enter the relevant details. A trainer may be standalone or linked to an existing permitted trainer login. Provision sign-in access separately through staff administration when needed.

Use **Classes** and its resource management controls to maintain weekly trainer availability and rooms. Ensure availability covers the branch and times you intend to schedule.

### Assign a member and book a personal session

1. Open the trainer profile and follow **Assignments & PT sessions**.
2. Select the trainer and branch, then use **Assign member** if your role permits it.
3. Choose the member and effective dates. An exclusive assignment end date is the first date no longer covered.
4. Review the assignment and save.
5. Use **Book PT** for that assignment and enter the session title, start/end times and optional room.
6. Review the gym-local times and displayed UTC offsets before saving.

The assignment, trainer availability and member's eligible personal-training membership must cover the session. Trainer, room and member conflicts are checked when saving. Merely assigning a trainer does not grant a member PT entitlement or create an additional invoice.

Use the session's edit or cancellation action when plans change. If an assignment cannot be shortened or disabled because of future sessions, resolve those sessions first. Cancellation retains the session history and releases its scheduling conflict.

Linked trainer users see their own permitted agenda and assigned-member information; assignment administration and reception booking permissions differ.

## Classes and bookings

### Set up and schedule a class

1. Open **Classes** and use the resource controls to check room capacity and trainer availability.
2. Choose **Create class** if your role permits it.
3. Enter the branch, trainer, room, title, start/end times and participant capacity.
4. Review and save the class.
5. Use week, day or list views and branch/coach filters to find scheduled sessions.

The week view adapts for smaller screens. Dates and times use the gym's configured time zone; review displayed offsets when an editor asks for them rather than guessing a conversion.

### Add or cancel a booking

Open the class details and choose **Add booking**. Search for the member and review their eligibility and any scheduling conflict before confirming. A member must satisfy the class access rules, and the class must have a seat available.

When a member cancels, use their booking's cancellation action. This retains the record and releases the seat. Rebooking checks eligibility and capacity again. Use class cancellation when the entire session is cancelled and review the retained status in the timetable.

The current product does not provide a member-facing self-service booking portal or waitlist.

## Employees, salaries and expenses

### Maintain employee records

Open **Employees** and add the person's profile, branch, job details and starting information. Link an existing trainer profile where appropriate. Save the agreed monthly salary and payday through the permitted employee/rate controls.

An employee record is separate from a staff login. Updating a rate applies to future salary entries; previously recorded monthly snapshots remain unchanged.

### Record a monthly salary and its payments

1. Open the employee and choose **Record monthly salary**.
2. Select the month and review the agreed amount or provide the required explanation for an adjustment.
3. Save the monthly due entry.
4. After paying the employee outside Mojym, open the entry and choose **Record salary payment**.
5. Record the amount and payment details, review and confirm.
6. Check paid and remaining amounts in the salary history.

Monthly salary dues are recorded explicitly; the application does not silently create every month's wages. A salary payment posts to the expense ledger once. Do not add the same payment again as a separate expense.

Use the supported reversal workflow for an incorrect salary payment. Reversing its expense reopens the corresponding salary balance. Follow the displayed requirements before voiding an incorrect monthly salary entry.

These records do not transfer wages, calculate statutory payroll obligations or file taxes.

### Record other expenses

Open **Expenses**, choose the appropriate category and enter the amount, currency, payment date, method and description. Attach a supported receipt image if needed. Review and save, then inspect the recorded expense.

Use reversals and a linked replacement when correcting an expense. Do not erase history or post an invented negative expense to hide the original entry. Private receipt downloads remain subject to account and branch permissions.

## Use the dashboard and daily routine

The dashboard draws from saved operational records. Review active members, today's check-ins, collections, overdue invoices, recent members, renewals, fee reminders and upcoming classes. Use the branch filter before comparing figures with a branch's records.

**At opening:** check branch scope, planned classes and coaching, approaching fee dates and unresolved access issues.

**During reception:** register members, record money actually received, provide receipts, manage bookings and check visits in and out.

**At closing:** compare recorded collections and expenses with your real cash and banking records, inspect remaining invoice balances and review any transaction whose result was uncertain.

A dashboard total is not an automatic bank reconciliation. Currency totals must be read separately. Refunds, expense reversals and invoice debt describe different financial effects.

## Platform administration for Hanova operators

This section is for explicitly authorized platform administrators. Gym owners do not gain cross-gym access through their ordinary gym role.

From the platform console, permitted operators can create a gym workspace with its gym login ID/password, owner name, separate real owner email, contact information, address and initial branch details. Review these fields carefully; the login identifier and actual recovery destination serve different purposes.

Operators can inspect a gym's details, scoped analytics and recorded activity, and suspend or reactivate it through the reasoned management controls. Read the effect before confirming a suspension. Suspension is access administration, not deletion of the gym's business history.

Use **Monthly billing** for the gym's charges payable to Hanova. Record the agreed monthly charge, due date and currency, then record received payments and review paid/unpaid balances. These platform charges are separate from the gym's invoices to its members. Do not invent a contract fee or treat a manually recorded payment as automatic bank confirmation.

Correct platform billing through its supported reversal/void actions and retain the reason and history.

## Common problems and safe next steps

| Situation | What to do |
| --- | --- |
| A menu or action is missing | Confirm the current gym, branch and staff role. Ask the owner to review permissions; do not assume every account has the same controls. |
| Sign-in fails | Check the supplied gym login ID or staff email. The real owner recovery email may be a different identifier. Use recovery or contact the administrator. |
| Too many sign-in attempts | Wait for the displayed retry period instead of repeatedly submitting. |
| A reset message does not arrive | Check the real recovery inbox/spam, and supply the gym login ID when one owner email covers several gyms. Ask the product administrator to verify the recorded contact. |
| A member is denied entry | Read the recorded reason and inspect dates, branch, benefits, freezes, payment policy and archival status. Use an override only when authorized and justified. |
| A booking cannot save | Check capacity, trainer availability, assignment dates, membership entitlement and trainer/room/member conflicts. |
| A save reports a stale revision | Reload the current record and review the other saved change before applying your update. |
| A request times out | Keep the current review and use its provided retry where available. If success is uncertain, inspect saved history before creating a fresh transaction. |
| The write saved but refresh failed | Do not repeat the business action. Use the displayed reload/retry control and inspect the saved invoice, payment or record. |
| An owner reminder has uncertain delivery | Review the delivery state and its permitted resolution controls rather than repeatedly sending another summary. |
| A desired feature is absent | Ask Hanova about current availability. Do not substitute unrelated workflows for an unfinished module. |

## Current boundaries

This guide covers implemented workflows. Dedicated enquiries/trials, reporting pages and CSV import/export are still being developed. Current PDF invoices/receipts and dashboard summaries do not imply those broader modules are complete.

Mojym is a responsive web application. Native mobile apps, biometric/turnstile integrations, offline synchronization, online payment collection and automatic subscription charging are not part of the current implemented guide.

For help with setup, permissions or product availability, use the Hanova Devs website's existing enquiry/support route. Do not include account credentials, private member records or payment evidence in public contact submissions.

## Editorial and publication checklist for the website agent

Keep account recovery, manual payment collection and role differences especially clear. Retain the distinction between member fees and platform fees. Use the controls that currently exist, and refresh screenshots if the UI has changed since this guide was prepared.

Before publishing, verify the contents links, mobile navigation, expandable sections if used, image descriptions and the return link to the product page. Do not display this guide's preparation notes or turn its internal implementation status into unsupported commercial promises.
