/**
 * Generation des exports pour les reunions des services techniques.
 * - CSV : genere a la main (pas de dependance externe) pour rester
 *   ultra-leger, format standard ouvrable par tout tableur.
 * - PDF : genere via pdfkit (bibliotheque pure JS, sans navigateur
 *   headless type Puppeteer -> beaucoup plus econome en ressources).
 */
import PDFDocument from "pdfkit";
import { Signalement } from "../models/signalement.model";
import { categoryLabel as sharedCategoryLabel } from "../domain/categories";

const STATUS_LABELS: Record<string, string> = {
  nouveau: "Nouveau",
  pris_en_compte: "Pris en compte",
  en_cours: "En cours de traitement",
  resolu: "Resolu",
  rejete: "Rejete",
};

export function categoryLabel(category: string): string {
  return sharedCategoryLabel(category);
}

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

/**
 * Echappe une valeur pour l'inclure de facon sure dans un champ CSV
 * (double des guillemets internes, entoure de guillemets).
 */
function csvEscape(value: string): string {
  const safe = value.replace(/"/g, '""');
  return `"${safe}"`;
}

export function buildCsvExport(signalements: Signalement[]): string {
  const header = [
    "Code de suivi",
    "Categorie",
    "Service assigne",
    "Agent",
    "Statut",
    "Adresse",
    "Description",
    "Date de creation",
    "Derniere mise a jour",
  ];

  const lines = [header.map(csvEscape).join(";")];

  for (const s of signalements) {
    lines.push(
      [
        s.reference_code,
        categoryLabel(s.category),
        categoryLabel(s.assigned_service || s.category),
        s.assigned_agent_username ?? "",
        statusLabel(s.status),
        s.address,
        (s.description ?? "").replace(/\r?\n/g, " "),
        s.created_at,
        s.updated_at,
      ]
        .map((v) => csvEscape(String(v)))
        .join(";")
    );
  }

  // BOM UTF-8 pour un affichage correct des accents dans Excel
  return `\uFEFF${lines.join("\r\n")}`;
}

/**
 * Genere un PDF de synthese (liste tabulaire) et le renvoie en Buffer.
 */
export function buildPdfExport(
  signalements: Signalement[],
  communeName: string
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: "A4" });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc
      .fontSize(16)
      .text(`${communeName} - Recapitulatif des signalements`, { align: "left" });
    doc
      .fontSize(10)
      .fillColor("#555555")
      .text(`Genere le ${new Date().toLocaleString("fr-FR")}`, { align: "left" });
    doc.moveDown(1);
    doc.fillColor("#111111");

    // Largeurs fixes, somme = largeur utile A4 (marges 40).
    // On ne reprend jamais doc.x : apres un text(), PDFKit laisse le
    // curseur sur la derniere colonne, ce qui decalait le code sous la date.
    const columns = [
      { label: "Code", width: 78 },
      { label: "Categorie", width: 112 },
      { label: "Statut", width: 108 },
      { label: "Adresse", width: 145 },
      { label: "Date", width: 72 },
    ];
    const tableLeft = doc.page.margins.left;
    const tableWidth = columns.reduce((sum, column) => sum + column.width, 0);
    const rowHeight = 22;

    const drawRow = (values: string[], y: number, isHeader = false): number => {
      if (isHeader) {
        doc.save();
        doc.rect(tableLeft, y, tableWidth, rowHeight).fill("#eef4fb");
        doc.restore();
      }

      doc
        .font(isHeader ? "Helvetica-Bold" : "Helvetica")
        .fontSize(9)
        .fillColor(isHeader ? "#123b5c" : "#111111");

      let x = tableLeft;
      for (let i = 0; i < values.length; i += 1) {
        doc.text(String(values[i] ?? ""), x + 4, y + 6, {
          width: columns[i].width - 8,
          height: rowHeight - 8,
          ellipsis: true,
          lineBreak: false,
        });
        x += columns[i].width;
      }

      const bottom = y + rowHeight;
      doc
        .moveTo(tableLeft, bottom)
        .lineTo(tableLeft + tableWidth, bottom)
        .strokeColor("#d5e0ea")
        .lineWidth(0.5)
        .stroke();

      doc.x = tableLeft;
      doc.y = bottom;
      return bottom;
    };

    let y = drawRow(
      columns.map((column) => column.label),
      doc.y,
      true
    );

    for (const s of signalements) {
      if (y > doc.page.height - doc.page.margins.bottom - rowHeight) {
        doc.addPage();
        y = doc.page.margins.top;
        y = drawRow(
          columns.map((column) => column.label),
          y,
          true
        );
      }
      y = drawRow(
        [
          s.reference_code,
          categoryLabel(s.category),
          statusLabel(s.status),
          s.address,
          new Date(s.created_at).toLocaleDateString("fr-FR"),
        ],
        y
      );
    }

    doc.x = tableLeft;
    doc.y = y + 12;
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor("#555555")
      .text(`Total : ${signalements.length} signalement(s).`, tableLeft, doc.y);

    doc.end();
  });
}
