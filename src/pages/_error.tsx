function Error() {
  return (
    <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center" }}>
        <h1 style={{ fontSize: "2rem", fontWeight: "bold" }}>Something went wrong</h1>
        <p style={{ marginTop: "0.5rem", color: "#6b7280" }}>Please try again later</p>
      </div>
    </div>
  )
}

Error.getInitialProps = () => {
  return {}
}

export default Error
