import type { Metadata } from "next"
import { LegalDocLayout } from "../components/LegalDocLayout"
import { SITE_NAME } from "../../lib/seo/site"

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: `How ${SITE_NAME} collects, uses, and protects personal information.`,
  alternates: { canonical: "/privacy" },
  robots: { index: true, follow: true },
}

const LAST_UPDATED = "April 9, 2026"

export default function PrivacyPolicyPage() {
  return (
    <LegalDocLayout
      title="Privacy Policy"
      description={`This policy describes how ${SITE_NAME} (“we”, “us”) handles personal information when you use our website and services.`}
      lastUpdated={LAST_UPDATED}
      otherDoc={{ href: "/terms", label: "View Terms of Service →" }}
    >
      <section>
        <h2>1. Scope</h2>
        <p>
          This Privacy Policy applies to information collected through {SITE_NAME}’s public website, authenticated account areas, and related
          communications. By using the service, you agree to this policy.
        </p>
      </section>

      <section>
        <h2>2. Information we collect</h2>
        <ul>
          <li>
            <strong>Account and profile data:</strong> such as name, email address, and authentication identifiers when you create an account or
            sign in (including through third-party identity providers where enabled).
          </li>
          <li>
            <strong>Usage and technical data:</strong> such as device type, browser, approximate location derived from IP address, pages viewed,
            referring URLs, and timestamps. We use this to operate, secure, and improve the service.
          </li>
          <li>
            <strong>Communications:</strong> messages you send us (for example support requests) and transactional emails related to your account.
          </li>
          <li>
            <strong>Payment-related data:</strong> if you purchase a subscription, payment processing is handled by our payment processor; we do
            not store full payment card numbers on our servers.
          </li>
        </ul>
      </section>

      <section>
        <h2>3. How we use information</h2>
        <p>We use personal information to:</p>
        <ul>
          <li>Provide, maintain, and improve features and market intelligence tools;</li>
          <li>Authenticate users and protect against fraud and abuse;</li>
          <li>Send service-related notices and (where permitted) product updates;</li>
          <li>Comply with law and enforce our Terms of Service;</li>
          <li>Analyze usage in aggregate to understand performance and product fit.</li>
        </ul>
      </section>

      <section>
        <h2>4. Cookies and similar technologies</h2>
        <p>
          We use cookies and similar technologies for session management, preferences (such as theme), security, and analytics. You can control
          cookies through your browser settings; disabling certain cookies may limit functionality.
        </p>
      </section>

      <section>
        <h2>5. Service providers</h2>
        <p>
          We rely on subprocessors to host, store data, send email, process payments, and operate infrastructure. They are permitted to process
          personal information only to perform services for us and are bound by appropriate confidentiality and security obligations.
        </p>
      </section>

      <section>
        <h2>6. Data retention</h2>
        <p>
          We retain personal information for as long as your account is active or as needed to provide the service, comply with legal
          obligations, resolve disputes, and enforce our agreements. Aggregated or de-identified data may be retained longer.
        </p>
      </section>

      <section>
        <h2>7. Security</h2>
        <p>
          We implement reasonable technical and organizational measures designed to protect personal information. No method of transmission or
          storage is completely secure; we cannot guarantee absolute security.
        </p>
      </section>

      <section>
        <h2>8. Your choices and rights</h2>
        <p>
          Depending on where you live, you may have rights to access, correct, delete, or export personal information, or to object to or restrict
          certain processing. To exercise these rights, contact us using the information below. You may also unsubscribe from marketing emails
          using the link in those emails.
        </p>
      </section>

      <section>
        <h2>9. Children</h2>
        <p>
          {SITE_NAME} is not directed to children under 13 (or the minimum age required in your jurisdiction). We do not knowingly collect
          personal information from children.
        </p>
      </section>

      <section>
        <h2>10. International users</h2>
        <p>
          If you access the service from outside the United States, your information may be processed in the United States or other countries
          where we or our providers operate, which may have different data protection rules than your country.
        </p>
      </section>

      <section>
        <h2>11. Changes to this policy</h2>
        <p>
          We may update this Privacy Policy from time to time. We will post the revised policy on this page and update the “Last updated” date. For
          material changes, we may provide additional notice (such as a notice in the product or by email).
        </p>
      </section>

      <section>
        <h2>12. Contact</h2>
        <p>
          For privacy-related questions or requests, contact us through the official contact channels published on this website ({SITE_NAME}).
        </p>
      </section>
    </LegalDocLayout>
  )
}
