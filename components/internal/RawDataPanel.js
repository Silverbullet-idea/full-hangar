export default function RawDataPanel({ row }) {
  return (
    <section className="panel">
      <h3 style={{ marginTop: 0 }}>Raw DB Payload</h3>
      <pre>{JSON.stringify(row, null, 2)}</pre>
    </section>
  )
}
