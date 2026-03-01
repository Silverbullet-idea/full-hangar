import "./globals.css"

export const metadata = {
  title: "Full-Hangar",
  description: "Aircraft Market Intelligence & Deal-Finding Platform",
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
