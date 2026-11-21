import "server-only";
import PDFDocument from "pdfkit";
import { join } from "node:path";
import type { InvoiceDetail } from "./types";
import { exactMoney } from "./format";
import { previousDay } from "@/modules/plans/format";

/** Issued invoice snapshot -> downloadable bytes. No remote assets, temp files or sends. */
export function invoicePdf(data: InvoiceDetail): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const root = join(process.cwd(), "src/modules/billing/fonts"),
      regular = join(root, "NotoSans-Regular.ttf");
    const doc = new PDFDocument({
      size: "A4",
      margin: 44,
      bufferPages: true,
      font: regular,
      info: {
        Title: data.invoice.number + " - Invoice",
        Author: data.issuer.name,
        Subject: "Issued invoice - not proof of payment",
      },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    try {
      doc
        .registerFont("Body", regular)
        .registerFont("Bold", join(root, "NotoSans-Bold.ttf"))
        .registerFont("Arabic", join(root, "NotoNaskhArabic-Regular.ttf"));
      const i = data.invoice,
        locale = data.issuer.locale,
        money = (n: string | number) => exactMoney(n, i.currency, locale),
        W = 507;
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
        font(value, size, bold);
        return doc.heightOfString(value, { width, lineGap: 3 });
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
        font(value, size, bold);
        doc.fillColor(color).text(value, x, y, { width, lineGap: 3, align });
      }
      function date(value: string | null) {
        return value
          ? new Intl.DateTimeFormat(locale, {
              dateStyle: "medium",
              timeZone: "UTC",
            }).format(new Date(value + "T12:00:00Z"))
          : "-";
      }
      function heading(continued = false) {
        text(
          data.issuer.name,
          44,
          44,
          330,
          continued ? 15 : 23,
          true,
          "#253C58",
        );
        text(
          i.status === "void" ? "VOID INVOICE" : "INVOICE",
          390,
          46,
          161,
          continued ? 16 : 24,
          true,
          "#1E2937",
          "right",
        );
        text(i.number!, 350, 82, 201, 10, true, "#253C58", "right");
        if (continued)
          return Math.max(
            111,
            44 + height(data.issuer.name, 330, 15, true) + 15,
          );
        let y = Math.max(85, 44 + height(data.issuer.name, 330, 23, true) + 12);
        for (const v of [
          data.issuer.address,
          [data.issuer.email, data.issuer.phone].filter(Boolean).join(" | "),
        ].filter(Boolean)) {
          text(v, 44, y, 300, 9, false, "#526276");
          y += height(v, 300, 9) + 5;
        }
        y = Math.max(y + 22, 135);
        text("BILL TO", 44, y, 290, 8, true, "#526276");
        text("ISSUED", 365, y, 90, 8, true, "#526276");
        text("DUE", 460, y, 91, 8, true, "#526276");
        y += 19;
        text(i.recipientName, 44, y, 290, 14, true);
        text(date(i.issuedOn), 365, y, 90, 9);
        text(date(i.dueOn), 460, y, 91, 9);
        const nh = height(i.recipientName, 290, 14, true);
        y += Math.max(nh, 20) + 7;
        text(
          i.recipientCode + " | " + i.branchName,
          44,
          y,
          340,
          9,
          false,
          "#526276",
        );
        y += height(i.recipientCode + " | " + i.branchName, 340, 9) + 22;
        text(i.description, 44, y, W, 13, true);
        y += height(i.description, W, 13, true) + 9;
        if (data.membershipTerm) {
          const v =
            "Original membership period: " +
            date(data.membershipTerm.startOn) +
            " - " +
            date(previousDay(data.membershipTerm.endOn));
          text(v, 44, y, W, 9, false, "#526276");
          y += height(v, W, 9) + 10;
        }
        return y + 15;
      }
      const xs = [44, 269, 304, 384, 464],
        widths = [215, 25, 70, 70, 87];
      function tableHead(y: number) {
        doc.roundedRect(44, y, W, 30, 7).fill("#DCE4EE");
        ["Description", "Qty", "Unit price", "Discount", "Amount"].forEach(
          (v, n) =>
            text(
              v,
              xs[n] + (n === 0 ? 10 : 0),
              y + 9,
              widths[n] - (n === 0 ? 10 : 0),
              8,
              true,
              "#253C58",
              n > 1 ? "right" : "left",
            ),
        );
        return y + 40;
      }
      let y = tableHead(heading());
      for (const line of data.items) {
        const values = [
          line.description,
          String(line.quantity),
          money(line.unitMinor),
          line.discountMinor ? money(line.discountMinor) : "-",
          money(line.totalMinor),
        ];
        const h =
          Math.max(
            28,
            ...values.map((v, n) => height(v, widths[n], n ? 9 : 10)),
          ) + 18;
        if (y + h > 725) {
          doc.addPage();
          y = tableHead(heading(true));
        }
        values.forEach((v, n) =>
          text(
            v,
            xs[n],
            y,
            widths[n],
            n ? 9 : 10,
            n === 4,
            "#1E2937",
            n > 1 ? "right" : "left",
          ),
        );
        y += h;
      }
      y += 12;
      if (y + 142 > 725) {
        doc.addPage();
        y = heading(true);
      }
      text("Subtotal", 305, y, 110, 9, false, "#526276");
      text(
        money(data.subtotalMinor),
        415,
        y,
        136,
        10,
        false,
        "#1E2937",
        "right",
      );
      y += 26;
      text("Discounts", 305, y, 110, 9, false, "#526276");
      text(
        money(data.discountMinor),
        415,
        y,
        136,
        10,
        false,
        "#1E2937",
        "right",
      );
      y += 26;
      text("Invoice total", 305, y, 110, 11, true);
      text(money(i.totalMinor), 415, y, 136, 11, true, "#1E2937", "right");
      y += 30;
      doc.roundedRect(295, y, 256, 43, 9).fill("#DCE4EE");
      text("Outstanding", 305, y + 13, 110, 10, true, "#253C58");
      text(
        money(i.balanceMinor),
        415,
        y + 13,
        126,
        10,
        true,
        "#253C58",
        "right",
      );
      y += 69;
      const note =
        "This invoice records a charge. It is not proof of payment. Payment collection and paid receipts are separate.";
      const fh = height(note, W, 9) + height(data.issuer.footer, W, 9) + 20;
      if (y + fh > 744) {
        doc.addPage();
        y = heading(true);
      }
      text(note, 44, y, W, 9, false, "#526276");
      y += height(note, W, 9) + 16;
      if (data.issuer.footer)
        text(data.issuer.footer, 44, y, W, 9, false, "#526276");
      const range = doc.bufferedPageRange();
      for (let page = 0; page < range.count; page++) {
        doc.switchToPage(page);
        font("Page", 8);
        doc
          .fillColor("#526276")
          .text(`${i.number} | Page ${page + 1} of ${range.count}`, 44, 770, {
            width: W,
            align: "right",
            lineBreak: false,
          });
      }
      doc.end();
    } catch (error) {
      doc.destroy();
      reject(error);
    }
  });
}
