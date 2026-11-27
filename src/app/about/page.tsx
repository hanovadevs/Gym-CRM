import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { gymRegistrationUrl } from "@/lib/gym-registration";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "About Mojym | Gym CRM and getting started",
  description:
    "See how Mojym helps gym teams manage members, fees, attendance and coaching, and contact Hanova Devs to set up your gym.",
};

const workflows = [
  {
    id: "setup",
    title: "Set up your gym and membership plans",
    image: "plans",
    height: 755,
    alt: "Mojym membership plans with prices, access benefits and renewal terms",
    steps: [
      "Contact Hanova Devs on WhatsApp to request a workspace. Share your gym name and the best way to reach you.",
      "Sign in with the gym login ID and password supplied during setup. Staff sign in with their own provisioned email. For password recovery, use the real owner email or your own staff email.",
      "In Settings, confirm your branches, currency, time zone and admission rules. Invite staff and give them access appropriate to their roles.",
      "Open Plans, choose Create plan and set the price, duration, branch and access benefits. Review before saving.",
    ],
  },
  {
    id: "members",
    title: "Register members and manage fees",
    steps: [
      "Choose Members → Add member. Enter a name, phone or email, home branch and joining date, then review the registration.",
      "To agree an individual monthly fee during registration, enable Add monthly subscription, select an active one-month plan and enter the rate, start date and reminder window. Saving creates the first term and invoice.",
      "For an existing profile, use Enroll member or Renew membership. Review the dates and price, and use the term actions to freeze or cancel when needed.",
      "Open Member fees to see which invoices still have a balance and which memberships are approaching renewal. Owners can also receive fee summaries at their real owner email.",
    ],
  },
  {
    id: "payments",
    title: "Record payments and share receipts",
    steps: [
      "Open Payments and find the member’s issued invoice. For a separate charge, review and issue a draft first.",
      "Choose Record payment. Enter the amount actually received, payment method and date. Review before confirming. A partial payment leaves the remainder due.",
      "Download the invoice or paid receipt as a PDF to share with the member. Owners can use the correction actions for credits, refunds and voids.",
    ],
    note: "Collect funds through your gym’s usual payment method, then record them in Mojym.",
  },
  {
    id: "attendance",
    title: "Check members in and out",
    image: "attendance",
    height: 756,
    alt: "Mojym attendance screen showing branch filters and member lookup",
    steps: [
      "Open Attendance, select the branch and look up the member by name, code, phone or QR token.",
      "Review the eligibility result before checking them in. If entry is denied, check the membership dates, branch, access benefits and payment rules.",
      "Check the member out when they leave. Use attendance history to review visits.",
    ],
  },
  {
    id: "coaching",
    title: "Schedule classes and personal training",
    image: "classes",
    height: 758,
    alt: "Mojym class timetable with coach, time and booking capacity",
    steps: [
      "Add coaching profiles in Trainers. Use Classes → Manage resources to maintain rooms and weekly trainer availability.",
      "Choose Create class, set the trainer, branch, time and capacity, then save. Open the class to add or cancel member bookings.",
      "For one-to-one coaching, open a trainer profile and follow Assignments & PT sessions. Assign an eligible member, then choose Book PT and review the session time.",
    ],
  },
  {
    id: "operations",
    title: "Track salaries, expenses and daily activity",
    steps: [
      "In Employees, maintain profiles and agreed salary rates. Record each month’s salary due, then record payments after paying the employee. Salary payments appear in Expenses.",
      "Use Expenses for other operating costs and attach receipt images where useful. Use the reversal action to correct a saved entry.",
      "Start each day in Dashboard. Check the branch filter, collections, overdue invoices, visits and upcoming sessions. On smaller screens, open More for secondary sections.",
    ],
  },
];

export default function AboutMojymPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Image
          src="/brand/mojym-wordmark.svg"
          width={126}
          height={36}
          alt="Mojym"
        />
        <Link href="/sign-in">Back to sign in</Link>
      </header>
      <section className={styles.hero}>
        <div>
          <p className={styles.kicker}>Gym management by Hanova Devs</p>
          <h1>Run your gym with Mojym</h1>
          <p>
            Manage memberships, fees, attendance and coaching in one workspace.
            Follow the guide below to see how the daily work fits together.
          </p>
          <a className={styles.primary} href={gymRegistrationUrl}>
            Register your gym on WhatsApp
          </a>
        </div>
        <Image
          className={styles.preview}
          src="/product/dashboard.webp"
          width={1440}
          height={754}
          sizes="(max-width: 800px) 100vw, 55vw"
          alt="Example Mojym dashboard with check-ins, collections and quick actions"
        />
      </section>
      <nav className={styles.contents} aria-label="How to use Mojym">
        {workflows.map(({ id, title }) => (
          <a key={id} href={`#${id}`}>
            {title}
          </a>
        ))}
      </nav>
      <h2>How to use Mojym</h2>
      <p className={styles.fullGuide}>
        <a href="https://www.hanovadevs.com/products/mojym/how-to-use">
          Read the full Mojym guide on Hanova Devs
        </a>
      </p>
      {workflows.map(({ id, title, image, height, alt, steps, note }) => (
        <section key={id} id={id} className={styles.section}>
          <h3>{title}</h3>
          <ol>
            {steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          {note && <p>{note}</p>}
          {image && (
            <figure>
              <Image
                className={styles.preview}
                src={`/product/${image}.webp`}
                width={1440}
                height={height}
                sizes="(max-width: 800px) 100vw, 1000px"
                alt={alt ?? title}
              />
              <figcaption>Example workspace · {title}</figcaption>
            </figure>
          )}
        </section>
      ))}
      <footer className={styles.footer}>
        <div>
          <h2>Ready to set up your gym?</h2>
          <p>Chat with Hanova Devs at +1 917 735 5385.</p>
        </div>
        <a className={styles.primary} href={gymRegistrationUrl}>
          Register your gym on WhatsApp
        </a>
        <Link href="/sign-in">Back to sign in</Link>
      </footer>
    </main>
  );
}
