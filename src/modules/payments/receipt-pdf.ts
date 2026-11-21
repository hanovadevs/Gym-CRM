import "server-only";
import PDFDocument from "pdfkit";
import { join } from "node:path";
import { exactMoney } from "@/modules/billing/format";
import { methodLabel, type Receipt } from "./types";
export function receiptPdf(data: Receipt): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const fonts = join(process.cwd(), "src/modules/billing/fonts"),
      p = data.payment,
      s = data.snapshot;
    const doc = new PDFDocument({
        size: "A4",
        margin: 44,
        font: join(fonts, "NotoSans-Regular.ttf"),
        bufferPages: true,
        info: {
          Title: p.receiptNumber + " - Payment receipt",
          Author: s.issuer.name,
          Subject: "Receipt for a committed manual payment",
        },
      }),
      chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    try {
      doc
        .registerFont("Body", join(fonts, "NotoSans-Regular.ttf"))
        .registerFont("Bold", join(fonts, "NotoSans-Bold.ttf"))
        .registerFont("Arabic", join(fonts, "NotoNaskhArabic-Regular.ttf"));
      const W = 507,
        money = (n: string) => exactMoney(n, p.currency, s.issuer.locale);
      function font(value: string, size = 10, bold = false) {
        doc
          .font(
            /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff]/.test(value)
              ? "Arabic"
              : bold
                ? "Bold"
                : "Body",
          )
          .fontSize(size);
      }
      function height(value: string, width: number, size = 10, bold = false) {
        if (/[\u0600-\u06ff]/.test(value))
          return mixedLines(value, width, size, bold).length * size * 1.8;
        font(value, size, bold);
        return doc.heightOfString(value, { width, lineGap: 3 });
      }
      // PDFKit has no automatic glyph fallback. Measure and render script runs
      // with their own embedded font, including Latin text in mixed notes.
      function mixedLines(
        value: string,
        width: number,
        size: number,
        bold: boolean,
      ) {
        const lines: string[] = [];
        let line = "",
          used = 0;
        for (const word of value.match(/\S+\s*/g) ?? []) {
          font(word, size, bold);
          const w = doc.widthOfString(word);
          if (used + w > width && line) {
            lines.push(line.trimEnd());
            line = "";
            used = 0;
          }
          if (w > width) {
            for (const ch of word) {
              font(ch, size, bold);
              const cw = doc.widthOfString(ch);
              if (used + cw > width && line) {
                lines.push(line);
                line = "";
                used = 0;
              }
              line += ch;
              used += cw;
            }
          } else {
            line += word;
            used += w;
          }
        }
        if (line) lines.push(line.trimEnd());
        return lines;
      }
      function text(
        value: string,
        x: number,
        y: number,
        width: number,
        size = 10,
        bold = false,
        color = "#1E2937",
        align: "left" | "right" = "left",
      ) {
        if (/[\u0600-\u06ff]/.test(value)) {
          mixedLines(value, width, size, bold).forEach((line, n) => {
            const runs =
              line.match(
                /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff]+|[^\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff]+/g,
              ) ?? [];
            const widths = runs.map((run) => {
              font(run, size, bold);
              return doc.widthOfString(run);
            });
            let left =
              x +
              (align === "right"
                ? width - widths.reduce((a, b) => a + b, 0)
                : 0);
            runs.forEach((run, i) => {
              font(run, size, bold);
              doc
                .fillColor(color)
                .text(run, left, y + n * size * 1.8, { lineBreak: false });
              left += widths[i];
            });
          });
          return;
        }
        font(value, size, bold);
        doc.fillColor(color).text(value, x, y, { width, lineGap: 3, align });
      }
      let y = 44;
      function page() {
        doc.addPage();
        text(s.issuer.name, 44, 44, 320, 15, true, "#253C58");
        text(p.receiptNumber, 365, 49, 186, 10, true, "#253C58", "right");
        y = 44 + Math.max(56, height(s.issuer.name, 320, 15, true) + 20);
      }
      function room(h: number) {
        if (y + h > 735) page();
      }
      text(s.issuer.name, 44, y, 310, 23, true, "#253C58");
      text("PAYMENT RECEIPT", 355, 49, 196, 14, true, "#253C58", "right");
      text(p.receiptNumber, 355, 78, 196, 10, true, "#253C58", "right");
      y += Math.max(50, height(s.issuer.name, 310, 23, true) + 14);
      for (const v of [
        s.issuer.address,
        [s.issuer.email, s.issuer.phone].filter(Boolean).join(" | "),
      ].filter(Boolean)) {
        const h = height(v, 310, 9) + 6;
        room(h);
        text(v, 44, y, 310, 9, false, "#526276");
        y += h;
      }
      y += 22;
      text("RECEIVED FROM", 44, y, W, 8, true, "#526276");
      y += 19;
      room(height(s.recipientName, W, 15, true) + 34);
      text(s.recipientName, 44, y, W, 15, true);
      y += height(s.recipientName, W, 15, true) + 8;
      text(
        s.recipientCode + " | " + s.branchName,
        44,
        y,
        W,
        9,
        false,
        "#526276",
      );
      y += 40;
      const received = new Intl.DateTimeFormat(s.issuer.locale, {
        dateStyle: "medium",
        timeZone: "UTC",
      }).format(new Date(p.paidOn + "T12:00:00Z"));
      for (const [label, value] of [
        ["Invoice", s.invoiceNumber],
        ["For", s.description],
        ["Payment date", received],
        ["Method", methodLabel[p.method]],
        ...(p.reference ? [["Reference", p.reference]] : []),
      ]) {
        const h = Math.max(19, height(value, 355)) + 10;
        room(h);
        text(label, 44, y, 120, 9, false, "#526276");
        text(value, 184, y, 367, 10, label === "Invoice");
        y += h;
      }
      y += 12;
      room(165);
      doc.roundedRect(44, y, W, 76, 7).fill("#DCE4EE");
      text("AMOUNT RECEIVED", 62, y + 15, 230, 9, true, "#253C58");
      text(
        money(p.amountMinor),
        280,
        y + 23,
        253,
        23,
        true,
        "#253C58",
        "right",
      );
      y += 99;
      const rows = [
        ["Invoice total", money(s.invoiceTotalMinor)],
        ["Balance after this payment", money(p.balanceAfterMinor)],
      ];
      for (const [label, value] of rows) {
        room(30);
        text(label, 245, y, 180, 9, false, "#526276");
        text(value, 415, y, 136, 10, true, "#1E2937", "right");
        y += 29;
      }
      y += 18;
      const note =
        "This receipt confirms the payment above. The balance shown is the invoice balance immediately after this payment; later payments or adjustments may change it.";
      for (const v of [
        note,
        p.note ? "Receipt note: " + p.note : "",
        s.issuer.footer,
      ].filter(Boolean)) {
        const h = height(v, W, 9) + 16;
        room(h);
        text(v, 44, y, W, 9, false, "#526276");
        y += h;
      }
      const range = doc.bufferedPageRange();
      for (let n = 0; n < range.count; n++) {
        doc.switchToPage(n);
        font("Page", 8);
        doc
          .fillColor("#526276")
          .text(
            `${p.receiptNumber} | Page ${n + 1} of ${range.count}`,
            44,
            770,
            { width: W, align: "right", lineBreak: false },
          );
      }
      doc.end();
    } catch (e) {
      doc.destroy();
      reject(e);
    }
  });
}
