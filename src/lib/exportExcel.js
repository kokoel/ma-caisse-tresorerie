import * as XLSX from 'xlsx';

/**
 * Exporte les ventes, dépenses et un résumé du mois sélectionné vers un fichier .xlsx.
 * @param {string} moisLabel - libellé du mois (ex: "Juillet 2026"), utilisé dans le nom du fichier
 * @param {Array} monthEntries - toutes les entrées (ventes + dépenses) du mois
 * @param {object} stats - { totalVentes, totalDepenses, solde, margeTotale, coutTotal, margePercent }
 */
export function exportMonthToExcel(moisLabel, monthEntries, stats = {}) {
  const ventes = monthEntries.filter((e) => e.type === 'vente');
  const depenses = monthEntries.filter((e) => e.type === 'depense');

  const ventesRows = ventes.map((v) => ({
    Date: v.date,
    Produit: v.produit || '',
    Quantité: v.quantite ?? '',
    'Prix unitaire (FCFA)': v.prixUnitaire ?? '',
    'Total (FCFA)': v.total ?? 0,
  }));

  const depensesRows = depenses.map((d) => ({
    Date: d.date,
    Catégorie: d.categorie || '',
    Description: d.description || '',
    'Montant (FCFA)': d.montant ?? 0,
  }));

  const resumeRows = [
    { Indicateur: 'Total ventes (FCFA)', Valeur: stats.totalVentes ?? 0 },
    { Indicateur: 'Total dépenses (FCFA)', Valeur: stats.totalDepenses ?? 0 },
    { Indicateur: 'Solde (FCFA)', Valeur: stats.solde ?? 0 },
    { Indicateur: 'Coût des ingrédients (FCFA)', Valeur: stats.coutTotal ?? 0 },
    { Indicateur: 'Marge brute (FCFA)', Valeur: stats.margeTotale ?? 0 },
    { Indicateur: 'Marge (%)', Valeur: stats.margePercent ? Math.round(stats.margePercent) : 0 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumeRows), 'Résumé');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ventesRows), 'Ventes');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(depensesRows), 'Dépenses');

  const filename = `Rapport-${moisLabel.replace(/\s+/g, '-')}.xlsx`;
  XLSX.writeFile(wb, filename);
}
