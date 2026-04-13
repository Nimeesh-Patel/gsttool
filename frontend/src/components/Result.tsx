interface ResultProps {
  isVisible: boolean;
  result: {
    json: unknown;
  } | null;
}

function Result({ isVisible, result }: ResultProps) {
  if (!isVisible || !result) {
    return null;
  }

  const jsonPayload = result.json;

  function downloadJSON(): void {
    const blob = new Blob([JSON.stringify(jsonPayload, null, 2)], {
      type: "application/json"
    });

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "gstr1.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="result-card">
      <p className="success-title">File processed</p>
      <div className="download-row">
        <button className="secondary-button" type="button" onClick={downloadJSON}>
          Download JSON
        </button>
      </div>
    </section>
  );
}

export default Result;
