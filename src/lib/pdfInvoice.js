import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

function numeroFacture(entry) {
  // Numéro lisible basé sur les 8 premiers caractères de l'id + la date
  return `F-${entry.date.replaceAll('-', '')}-${entry.id.slice(0, 6).toUpperCase()}`;
}

/**
 * Génère et télécharge une facture PDF pour une vente donnée.
 * @param {object} entry - entrée de type 'vente' ({ id, produit, quantite, prixUnitaire, total, date })
 * @param {object} options - { nomAtelier, telephone }
 */
export function generateInvoicePDF(entry, options = {}) {
  const nomAtelier = options.nomAtelier || 'Atelier Manager';
  const telephone = options.telephone || '';

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  // En-tête
  doc.setFillColor(26, 31, 22);
  doc.rect(0, 0, 210, 32, 'F');
  doc.setTextColor(247, 240, 227);
  doc.setFontSize(20);
  doc.text(nomAtelier, 14, 18);
  doc.setFontSize(10);
  doc.setTextColor(232, 185, 74);
  doc.text('Facture / Reçu de vente', 14, 26);

  // Infos facture
  doc.setTextColor(30, 30, 30);
  doc.setFontSize(10);
  doc.text(`N° facture : ${numeroFacture(entry)}`, 14, 42);
  doc.text(`Date : ${new Date(entry.date).toLocaleDateString('fr-FR')}`, 14, 48);
  if (telephone) doc.text(`Contact : ${telephone}`, 14, 54);

  // Tableau produit
  autoTable(doc, {
    startY: 62,
    head: [['Désignation', 'Quantité', 'Prix unitaire', 'Total']],
    body: [[
      entry.produit || 'Produit',
      String(entry.quantite ?? 1),
      formatMontant(entry.prixUnitaire ?? entry.total),
      formatMontant(entry.total),
    ]],
    headStyles: { fillColor: [61, 90, 61], textColor: 255 },
    styles: { fontSize: 10, cellPadding: 3 },
    theme: 'grid',
  });

  const finalY = doc.lastAutoTable.finalY || 90;

  doc.setFontSize(12);
  doc.setFont(undefined, 'bold');
  doc.text(`TOTAL : ${formatMontant(entry.total)}`, 196, finalY + 12, { align: 'right' });

  doc.setFont(undefined, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  doc.text('Merci pour votre confiance.', 14, finalY + 25);
  doc.text('Facture générée avec Atelier Manager', 14, 287);

  doc.save(`${numeroFacture(entry)}.pdf`);
}

function formatMontant(n) {
  return `${Math.round(n || 0).toLocaleString('fr-FR')} FCFA`;
}
