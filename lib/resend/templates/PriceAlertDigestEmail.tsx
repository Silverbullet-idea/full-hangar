import { Body, Button, Container, Head, Heading, Html, Link, Section, Text } from "@react-email/components"
import type { CSSProperties } from "react"
import { SITE_URL } from "@/lib/seo/site"

export type PriceAlertSection = {
  searchName: string
  listingsHref: string
  lines: Array<{ title: string; href: string; priceLabel: string; flipLabel: string }>
}

export function PriceAlertDigestEmail({
  displayName,
  sections,
}: {
  displayName: string
  sections: PriceAlertSection[]
}) {
  const name = displayName?.trim() || "there"
  return (
    <Html>
      <Head />
      <Body style={body}>
        <Container style={container}>
          <Section style={header}>
            <Text style={wordmark}>
              Full<span style={{ color: "#FF9900" }}>Hangar</span>
            </Text>
          </Section>
          <Heading style={h1}>Your listing digest</Heading>
          <Text style={tagline}>Hi {name} — top matches for your saved searches with alerts on.</Text>
          {sections.map((sec) => (
            <Section key={sec.searchName + sec.listingsHref} style={block}>
              <Text style={sectionTitle}>{sec.searchName}</Text>
              {sec.lines.map((line) => (
                <Text key={line.href} style={lineStyle}>
                  <Link href={line.href} style={lineLink}>
                    {line.title}
                  </Link>
                  <br />
                  <span style={meta}>
                    {line.priceLabel} · {line.flipLabel}
                  </span>
                </Text>
              ))}
              <Button href={sec.listingsHref} style={secondaryCta}>
                View all results →
              </Button>
            </Section>
          ))}
          <Section style={{ textAlign: "center", marginTop: 24 }}>
            <Button href={`${SITE_URL}/account/searches`} style={cta}>
              Manage saved searches
            </Button>
          </Section>
          <Text style={footer}>
            full-hangar.com · Alerts run daily when matches exist. You can turn alerts off anytime under Saved searches.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

const body: CSSProperties = {
  backgroundColor: "#0d1117",
  fontFamily: "DM Sans, Helvetica, Arial, sans-serif",
  margin: 0,
  padding: "24px 12px",
}

const container: CSSProperties = {
  maxWidth: 520,
  margin: "0 auto",
  backgroundColor: "#141922",
  borderRadius: 12,
  padding: "28px 24px",
  border: "1px solid #2d3748",
}

const header: CSSProperties = { marginBottom: 8 }

const wordmark: CSSProperties = {
  fontSize: 20,
  fontWeight: 800,
  color: "#ffffff",
  margin: 0,
  letterSpacing: "-0.02em",
}

const h1: CSSProperties = {
  color: "#ffffff",
  fontSize: 22,
  margin: "12px 0 8px",
}

const tagline: CSSProperties = {
  color: "#B2B2B2",
  fontSize: 14,
  lineHeight: 1.5,
  margin: "0 0 20px",
}

const block: CSSProperties = {
  borderTop: "1px solid #2d3748",
  paddingTop: 16,
  marginTop: 16,
}

const sectionTitle: CSSProperties = {
  color: "#FF9900",
  fontSize: 15,
  fontWeight: 700,
  margin: "0 0 10px",
}

const lineStyle: CSSProperties = {
  color: "#e5e7eb",
  fontSize: 13,
  lineHeight: 1.45,
  margin: "0 0 10px",
}

const lineLink: CSSProperties = {
  color: "#93c5fd",
  textDecoration: "none",
}

const meta: CSSProperties = { color: "#9ca3af", fontSize: 12 }

const cta: CSSProperties = {
  backgroundColor: "#AF4D27",
  color: "#ffffff",
  padding: "12px 22px",
  borderRadius: 8,
  fontWeight: 700,
  textDecoration: "none",
}

const secondaryCta: CSSProperties = {
  ...cta,
  backgroundColor: "#333333",
  display: "inline-block",
  marginTop: 8,
  fontSize: 13,
  padding: "8px 16px",
}

const footer: CSSProperties = {
  color: "#6b7280",
  fontSize: 11,
  marginTop: 28,
  lineHeight: 1.5,
}
