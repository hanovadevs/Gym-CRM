export function reportCsv(headers: string[], rows: string[][]) {
  const cell = (value: string) => {
    const safe = /^[\s\u0000-\u001f]*[=+@-]/.test(value) ? "'" + value : value;
    return '"' + safe.replaceAll('"', '""') + '"';
  };
  return (
    "\uFEFF" +
    [headers, ...rows].map((row) => row.map(cell).join(",")).join("\r\n") +
    "\r\n"
  );
}
