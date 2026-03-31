import { Body, Button, Container, Head, Heading, Html, Section, Text } from "@react-email/components"
import type { CSSProperties } from "react"

const siteUrl = "https://full-hangar.com"

export function WelcomeEmail({ displayName }: { displayName: string }) {
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
          <Heading style={h1}>Welcome, {name}</Heading>
          <Text style={tagline}>
            Aircraft market intelligence — built for serious buyers and sellers.
          </Text>
          <Section style={bullets}>
            <Text style={li}>• Browse 10,500+ listings</Text>
            <Text style={li}>• Analyze any deal with Deal Coach</Text>
            <Text style={li}>• Get sell intelligence for your aircraft</Text>
          </Section>
          <Section style={{ textAlign: "center", marginTop: 28 }}>
            <Button href={siteUrl} style={cta}>
              Explore Full Hangar →
            </Button>
          </Section>
          <Text style={footer}>full-hangar.com · You&apos;re receiving this because you created an account.</Text>
        </Container>
      </Body>
    </Html>
  )
}

const body: CSSProperties = {
  backgroundColor: "#0d1117",
  fontFamily: 'system-ui, "Segoe UI", sans-serif',
  margin: 0,
  padding: "32px 16px",
}

const container: CSSProperties = {
  maxWidth: 480,
  margin: "0 auto",
  backgroundColor: "#161b22",
  borderRadius: 12,
  padding: "28px 24px 32px",
  border: "1px solid #30363d",
}

const header: CSSProperties = {
  borderBottom: "1px solid #30363d",
  paddingBottom: 16,
  marginBottom: 20,
}

const wordmark: CSSProperties = {
  fontFamily: '"Barlow Condensed", system-ui, sans-serif',
  fontSize: 26,
  fontWeight: 700,
  letterSpacing: 0.5,
  color: "#f0f6fc",
  margin: 0,
}

const h1: CSSProperties = {
  color: "#f0f6fc",
  fontSize: 22,
  fontWeight: 600,
  margin: "0 0 12px",
}

const tagline: CSSProperties = {
  color: "#8b949e",
  fontSize: 15,
  lineHeight: 1.5,
  margin: "0 0 20px",
}

const bullets: CSSProperties = {
  margin: "0 0 8px",
}

const li: CSSProperties = {
  color: "#c9d1d9",
  fontSize: 14,
  lineHeight: 1.6,
  margin: "6px 0",
}

const cta: CSSProperties = {
  backgroundColor: "#FF9900",
  color: "#0d1117",
  fontWeight: 600,
  fontSize: 14,
  padding: "12px 24px",
  borderRadius: 8,
  textDecoration: "none",
}

const footer: CSSProperties = {
  color: "#6e7681",
  fontSize: 12,
  marginTop: 32,
  marginBottom: 0,
  textAlign: "center",
}
