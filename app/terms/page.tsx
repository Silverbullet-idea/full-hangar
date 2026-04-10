import type { Metadata } from "next"
import { LegalDocLayout } from "../components/LegalDocLayout"
import { SITE_NAME } from "../../lib/seo/site"

export const metadata: Metadata = {
  title: "Terms of Service",
  description: `Terms governing use of ${SITE_NAME} aircraft market intelligence and related services.`,
  alternates: { canonical: "/terms" },
  robots: { index: true, follow: true },
}

const LAST_UPDATED = "April 9, 2026"

export default function TermsOfServicePage() {
  return (
    <LegalDocLayout
      title="Terms of Service"
      description={`These terms govern your access to and use of ${SITE_NAME}’s website, software, and services.`}
      lastUpdated={LAST_UPDATED}
      otherDoc={{ href: "/privacy", label: "View Privacy Policy →" }}
    >
      <section>
        <h2>1. Agreement</h2>
        <p>
          By accessing or using {SITE_NAME} (“Service”), you agree to these Terms of Service (“Terms”) and our Privacy Policy. If you do not
          agree, do not use the Service.
        </p>
      </section>

      <section>
        <h2>2. The Service</h2>
        <p>
          {SITE_NAME} provides aircraft listing aggregation, scoring, analytics, and related informational tools to help users research the
          general aviation market. The Service may include free and paid features. We may modify or discontinue features with reasonable notice
          where practicable.
        </p>
      </section>

      <section>
        <h2>3. Not professional advice</h2>
        <p>
          Content on {SITE_NAME} is for informational purposes only. Nothing on the Service constitutes legal, tax, financial, insurance,
          airworthiness, maintenance, or flight operational advice. Aircraft purchases involve risk; always verify listings with sellers,
          qualified mechanics, and appropriate regulators. You are solely responsible for decisions you make based on information obtained
          through the Service.
        </p>
      </section>

      <section>
        <h2>4. Accounts</h2>
        <p>
          You must provide accurate registration information and safeguard your credentials. You are responsible for activity under your account.
          Notify us promptly of unauthorized use. We may suspend or terminate accounts that violate these Terms or pose a security risk.
        </p>
      </section>

      <section>
        <h2>5. Subscriptions and billing</h2>
        <p>
          Paid plans, if offered, are billed according to the checkout flow you complete. Fees are non-refundable except where required by law or
          expressly stated at purchase. You authorize our payment processor to charge your payment method on the agreed schedule. You may cancel
          according to the cancellation path shown in your account or payment provider portal; cancellation does not necessarily refund prior
          charges.
        </p>
      </section>

      <section>
        <h2>6. Acceptable use</h2>
        <p>You agree not to:</p>
        <ul>
          <li>Use the Service in violation of law or third-party rights;</li>
          <li>Attempt to probe, scan, or test the vulnerability of the Service or bypass access controls;</li>
          <li>Scrape, harvest, or extract data in bulk in a way that burdens infrastructure or violates applicable terms of data sources;</li>
          <li>Reverse engineer or attempt to extract source code except where permitted by law;</li>
          <li>Use the Service to distribute malware, spam, or misleading information.</li>
        </ul>
      </section>

      <section>
        <h2>7. Third-party data and links</h2>
        <p>
          Listings and related data may originate from third-party marketplaces and public sources. We do not control those sources and do not
          guarantee accuracy, completeness, or availability. Links to third-party sites are provided for convenience; we are not responsible for
          their content or practices.
        </p>
      </section>

      <section>
        <h2>8. Intellectual property</h2>
        <p>
          The Service, including software, branding, text, graphics, and compilations, is owned by {SITE_NAME} or its licensors and is protected by
          intellectual property laws. Subject to these Terms, we grant you a limited, non-exclusive, non-transferable license to access and use
          the Service for your personal or internal business research. You may not copy, modify, distribute, sell, or lease our proprietary
          materials except as expressly permitted.
        </p>
      </section>

      <section>
        <h2>9. Disclaimers</h2>
        <p>
          THE SERVICE IS PROVIDED “AS IS” AND “AS AVAILABLE” WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS OR IMPLIED, INCLUDING IMPLIED
          WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE WILL BE
          UNINTERRUPTED, ERROR-FREE, OR FREE OF HARMFUL COMPONENTS.
        </p>
      </section>

      <section>
        <h2>10. Limitation of liability</h2>
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, {SITE_NAME} AND ITS AFFILIATES, OFFICERS, EMPLOYEES, AND SUPPLIERS WILL NOT BE LIABLE FOR ANY
          INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, DATA, GOODWILL, OR BUSINESS OPPORTUNITY,
          ARISING OUT OF OR RELATED TO YOUR USE OF THE SERVICE. OUR AGGREGATE LIABILITY FOR ANY CLAIM ARISING OUT OF THESE TERMS OR THE SERVICE
          WILL NOT EXCEED THE GREATER OF (A) THE AMOUNTS YOU PAID US FOR THE SERVICE IN THE TWELVE MONTHS BEFORE THE CLAIM OR (B) ONE HUNDRED U.S.
          DOLLARS (US$100), EXCEPT WHERE PROHIBITED BY LAW.
        </p>
      </section>

      <section>
        <h2>11. Indemnity</h2>
        <p>
          You will defend and indemnify {SITE_NAME} and its affiliates against any claims, damages, losses, and expenses (including reasonable
          attorneys’ fees) arising from your use of the Service, your content, or your violation of these Terms.
        </p>
      </section>

      <section>
        <h2>12. Termination</h2>
        <p>
          You may stop using the Service at any time. We may suspend or terminate access if you breach these Terms or if we need to protect the
          Service or other users. Provisions that by their nature should survive (including intellectual property, disclaimers, limitation of
          liability, and indemnity) will survive termination.
        </p>
      </section>

      <section>
        <h2>13. Governing law</h2>
        <p>
          These Terms are governed by the laws of the State of Delaware, USA, excluding conflict-of-law rules. You agree to the exclusive
          jurisdiction of the state and federal courts located in Delaware for disputes arising from these Terms, subject to applicable law
          requiring otherwise.
        </p>
      </section>

      <section>
        <h2>14. Changes</h2>
        <p>
          We may update these Terms from time to time. We will post the updated Terms on this page and revise the “Last updated” date. Continued
          use after changes become effective constitutes acceptance. If you do not agree, stop using the Service.
        </p>
      </section>

      <section>
        <h2>15. Contact</h2>
        <p>
          For questions about these Terms, contact us through the official contact channels published on this website ({SITE_NAME}).
        </p>
      </section>
    </LegalDocLayout>
  )
}
