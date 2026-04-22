export default function HomePage() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem', lineHeight: 1.5 }}>
      <h1>Throughline playground</h1>
      <p>
        This app exists to smoke-test <code>@forumone/throughline-*</code> core plugins. Open the{' '}
        <a href="/admin">Payload admin</a> to create the first user and explore the data model.
      </p>
    </main>
  )
}
