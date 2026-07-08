import React, { useState, useEffect, useMemo } from 'react';
import {
  Plus, TrendingUp, TrendingDown, X, Download, Check,
  Package, AlertTriangle, MessageCircle, Pencil, Trash2, LogOut, FileText,
} from 'lucide-react';
import { supabase } from './lib/supabaseClient';
import Auth from './components/Auth';
import {
  loadAllData, insertVente, insertDepense, deleteEntryRemote,
  upsertProduitRemote, updateProduitStockRemote, deleteProduitRemote, updatePhoneRemote,
  updateCacheAfterChange, buildFlushHandlers,
  upsertIngredientRemote, deleteIngredientRemote, replaceRecetteRemote,
} from './lib/dataService';
import { flushQueue, getQueueLength } from './lib/offlineQueue';
import { generateInvoicePDF } from './lib/pdfInvoice';
import { exportMonthToExcel } from './lib/exportExcel';

const CATEGORIES_DEPENSES = ['Ingrédients', 'Transport', 'Emballage', 'Location', 'Autre'];
const STORAGE_PREFIX = 'atelier:';

function uid() {
  // UUID v4 requis par les colonnes "uuid" de Supabase
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
function formatFCFA(n) {
  return Math.round(n).toLocaleString('fr-FR') + ' FCFA';
}
function monthKey(dateStr) {
  return dateStr.slice(0, 7);
}
function monthLabel(key) {
  const [y, m] = key.split('-');
  const noms = ['Janv', 'Févr', 'Mars', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sept', 'Oct', 'Nov', 'Déc'];
  return `${noms[parseInt(m, 10) - 1]} ${y}`;
}
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function yesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}
function dateLabel(dateStr) {
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

// ---------- Storage helpers (browser localStorage) ----------
function storageGet(key) {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}
function storageSet(key, value) {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
  } catch (e) {
    // localStorage indisponible (mode privé, quota dépassé, etc.)
    console.warn('Impossible de sauvegarder les données localement.', e);
  }
}

// ---------- WhatsApp helpers ----------
function buildDailySummaryText(dateStr, entries, products) {
  const jour = entries.filter(e => e.date === dateStr);
  const ventes = jour.filter(e => e.type === 'vente');
  const depenses = jour.filter(e => e.type === 'depense');
  const totalVentes = ventes.reduce((s, e) => s + e.total, 0);
  const totalDepenses = depenses.reduce((s, e) => s + e.montant, 0);
  const solde = totalVentes - totalDepenses;

  const parProduit = {};
  ventes.forEach(v => {
    if (!parProduit[v.produit]) parProduit[v.produit] = { qte: 0, total: 0 };
    parProduit[v.produit].qte += v.quantite;
    parProduit[v.produit].total += v.total;
  });

  let txt = `📊 *Récap du ${dateLabel(dateStr)}*\n\n`;
  if (ventes.length === 0) {
    txt += `Aucune vente enregistrée.\n`;
  } else {
    txt += `🧾 Ventes (${ventes.length}) — ${formatFCFA(totalVentes)}\n`;
    Object.entries(parProduit).forEach(([nom, v]) => {
      txt += `• ${nom} x${v.qte} — ${formatFCFA(v.total)}\n`;
    });
  }
  txt += `\n💸 Dépenses — ${formatFCFA(totalDepenses)}\n`;
  txt += `\n${solde >= 0 ? '✅' : '⚠️'} Solde du jour : ${formatFCFA(solde)}`;
  return txt;
}

function waLink(phone, text) {
  const clean = (phone || '').replace(/\D/g, '');
  return `https://wa.me/${clean}?text=${encodeURIComponent(text)}`;
}

// ---------- Modal shell ----------
function Modal({ title, onClose, children }) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(10,12,8,0.72)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 50 }}
      onClick={onClose}
    >
      <div onClick={(e) => e.stopPropagation()} style={{
        background: '#F7F0E3', width: '100%', maxWidth: 480, borderRadius: '20px 20px 0 0',
        padding: '24px 20px 28px', animation: 'slideUp 0.25s ease-out', maxHeight: '85vh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 24, fontWeight: 700, color: '#1A1F16', margin: 0 }}>{title}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1A1F16', padding: 6 }}>
            <X size={22} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function FieldLabel({ children }) {
  return <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#5c5748', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 }}>{children}</label>;
}

const inputStyle = {
  width: '100%', boxSizing: 'border-box', padding: '12px 14px', borderRadius: 10,
  border: '1.5px solid #ddd3ba', fontSize: 16, fontFamily: "'Inter', sans-serif",
  background: '#fff', color: '#1A1F16', marginBottom: 16, outline: 'none',
};

// ---------- Product form (add/edit) ----------
function ProductForm({ initial, onSave, onDelete, onClose, ingredients = [], recetteLignes = [], onSaveRecette }) {
  const [nom, setNom] = useState(initial?.nom || '');
  const [prixVente, setPrixVente] = useState(initial?.prixVente?.toString() || '');
  const [stock, setStock] = useState(initial?.stock?.toString() ?? '0');
  const [seuilAlerte, setSeuilAlerte] = useState(initial?.seuilAlerte?.toString() ?? '3');
  const [lignes, setLignes] = useState(
    recetteLignes.length > 0 ? recetteLignes.map(l => ({ id: l.id, ingredientId: l.ingredientId, quantite: l.quantite.toString() })) : []
  );

  const coutRevient = lignes.reduce((sum, l) => {
    const ing = ingredients.find(i => i.id === l.ingredientId);
    const q = parseFloat(l.quantite) || 0;
    return sum + (ing ? ing.prixUnitaire * q : 0);
  }, 0);
  const prixVenteNum = parseFloat(prixVente) || 0;
  const marge = prixVenteNum - coutRevient;
  const margePercent = prixVenteNum > 0 ? (marge / prixVenteNum) * 100 : 0;

  function addLigne() {
    if (ingredients.length === 0) return;
    setLignes(prev => [...prev, { id: uid(), ingredientId: ingredients[0].id, quantite: '' }]);
  }
  function updateLigne(id, patch) {
    setLignes(prev => prev.map(l => l.id === id ? { ...l, ...patch } : l));
  }
  function removeLigne(id) {
    setLignes(prev => prev.filter(l => l.id !== id));
  }

  function submit() {
    if (!nom.trim() || !prixVente) return;
    const produitId = initial?.id || uid();
    onSave({
      id: produitId,
      nom: nom.trim(),
      prixVente: prixVenteNum,
      stock: parseFloat(stock) || 0,
      seuilAlerte: parseFloat(seuilAlerte) || 0,
    });
    if (onSaveRecette) {
      const lignesValides = lignes
        .filter(l => l.ingredientId && parseFloat(l.quantite) > 0)
        .map(l => ({ id: l.id, ingredientId: l.ingredientId, quantite: parseFloat(l.quantite) }));
      onSaveRecette(produitId, lignesValides);
    }
    onClose();
  }

  return (
    <div>
      <FieldLabel>Nom du produit</FieldLabel>
      <input style={inputStyle} value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Ex: Gâteau chocolat (part)" />
      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <FieldLabel>Prix de vente (FCFA)</FieldLabel>
          <input style={inputStyle} type="number" min="0" value={prixVente} onChange={(e) => setPrixVente(e.target.value)} placeholder="0" />
        </div>
        <div style={{ flex: 1 }}>
          <FieldLabel>Stock actuel</FieldLabel>
          <input style={inputStyle} type="number" min="0" value={stock} onChange={(e) => setStock(e.target.value)} />
        </div>
      </div>
      <FieldLabel>Seuil d'alerte stock bas</FieldLabel>
      <input style={inputStyle} type="number" min="0" value={seuilAlerte} onChange={(e) => setSeuilAlerte(e.target.value)} />

      {/* ---- Recette / coût de revient ---- */}
      <div style={{ marginTop: 16, marginBottom: 16, background: '#1e2318', borderRadius: 12, padding: '14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ color: '#F7F0E3', fontSize: 13, fontWeight: 700 }}>Recette (ingrédients utilisés)</span>
        </div>

        {ingredients.length === 0 ? (
          <div style={{ color: '#8a8570', fontSize: 12.5 }}>
            Ajoute d'abord des ingrédients dans l'onglet "Ingrédients" pour construire ta recette.
          </div>
        ) : (
          <>
            {lignes.map(l => {
              const ing = ingredients.find(i => i.id === l.ingredientId);
              return (
                <div key={l.id} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                  <select style={{ ...inputStyle, flex: 2, marginBottom: 0 }} value={l.ingredientId} onChange={(e) => updateLigne(l.id, { ingredientId: e.target.value })}>
                    {ingredients.map(i => <option key={i.id} value={i.id}>{i.nom}</option>)}
                  </select>
                  <input style={{ ...inputStyle, flex: 1, marginBottom: 0 }} type="number" min="0" placeholder="Qté"
                    value={l.quantite} onChange={(e) => updateLigne(l.id, { quantite: e.target.value })} />
                  <span style={{ color: '#8a8570', fontSize: 11.5, width: 34 }}>{ing?.unite}</span>
                  <button onClick={() => removeLigne(l.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                    <X size={15} color="#b23b3b" />
                  </button>
                </div>
              );
            })}
            <button onClick={addLigne} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: '1px dashed #4a4636', borderRadius: 8, padding: '8px 10px', color: '#E8B94A', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', marginBottom: 10 }}>
              <Plus size={13} /> Ajouter un ingrédient à la recette
            </button>

            {lignes.length > 0 && (
              <div style={{ display: 'flex', gap: 14, paddingTop: 10, borderTop: '1px solid #333a28' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10.5, color: '#8a8570', textTransform: 'uppercase' }}>Coût de revient</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#F7F0E3' }}>{formatFCFA(coutRevient)}</div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10.5, color: '#8a8570', textTransform: 'uppercase' }}>Marge</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: marge >= 0 ? '#8fae8f' : '#e08a8a' }}>{formatFCFA(marge)} ({margePercent.toFixed(0)}%)</div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <button onClick={submit} disabled={!nom.trim() || !prixVente}
        style={{
          width: '100%', padding: '14px', borderRadius: 12, border: 'none',
          background: (!nom.trim() || !prixVente) ? '#c9c0a8' : '#3D5A3D', color: '#F7F0E3',
          fontSize: 16, fontWeight: 700, cursor: (!nom.trim() || !prixVente) ? 'default' : 'pointer',
          fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 0.5, marginBottom: initial ? 10 : 0,
        }}>
        {initial ? 'ENREGISTRER LES MODIFICATIONS' : 'AJOUTER LE PRODUIT'}
      </button>

      {initial && (
        <button onClick={() => { if (window.confirm('Supprimer ce produit ?')) { onDelete(initial.id); onClose(); } }}
          style={{
            width: '100%', padding: '12px', borderRadius: 12, border: '1.5px solid #b23b3b',
            background: 'transparent', color: '#b23b3b', fontSize: 14, fontWeight: 700, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
          <Trash2 size={15} /> Supprimer le produit
        </button>
      )}
    </div>
  );
}

// ---------- Ingredient Form ----------
const UNITES = ['g', 'kg', 'ml', 'l', 'unite'];

function IngredientForm({ initial, onSave, onDelete, onClose }) {
  const [nom, setNom] = useState(initial?.nom || '');
  const [prixUnitaire, setPrixUnitaire] = useState(initial?.prixUnitaire?.toString() || '');
  const [unite, setUnite] = useState(initial?.unite || 'g');
  const [stock, setStock] = useState(initial?.stock?.toString() ?? '0');
  const [seuilAlerte, setSeuilAlerte] = useState(initial?.seuilAlerte?.toString() ?? '0');

  function submit() {
    if (!nom.trim() || !prixUnitaire) return;
    onSave({
      id: initial?.id || uid(),
      nom: nom.trim(),
      prixUnitaire: parseFloat(prixUnitaire),
      unite,
      stock: parseFloat(stock) || 0,
      seuilAlerte: parseFloat(seuilAlerte) || 0,
    });
    onClose();
  }

  return (
    <div>
      <FieldLabel>Nom de l'ingrédient</FieldLabel>
      <input style={inputStyle} value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Ex: Farine" />
      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ flex: 2 }}>
          <FieldLabel>Prix par unité (FCFA)</FieldLabel>
          <input style={inputStyle} type="number" min="0" value={prixUnitaire} onChange={(e) => setPrixUnitaire(e.target.value)} placeholder="0" />
        </div>
        <div style={{ flex: 1 }}>
          <FieldLabel>Unité</FieldLabel>
          <select style={inputStyle} value={unite} onChange={(e) => setUnite(e.target.value)}>
            {UNITES.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <FieldLabel>Stock actuel</FieldLabel>
          <input style={inputStyle} type="number" min="0" value={stock} onChange={(e) => setStock(e.target.value)} />
        </div>
        <div style={{ flex: 1 }}>
          <FieldLabel>Seuil d'alerte</FieldLabel>
          <input style={inputStyle} type="number" min="0" value={seuilAlerte} onChange={(e) => setSeuilAlerte(e.target.value)} />
        </div>
      </div>

      <button onClick={submit} disabled={!nom.trim() || !prixUnitaire}
        style={{
          width: '100%', padding: '14px', borderRadius: 12, border: 'none',
          background: (!nom.trim() || !prixUnitaire) ? '#c9c0a8' : '#3D5A3D', color: '#F7F0E3',
          fontSize: 16, fontWeight: 700, cursor: (!nom.trim() || !prixUnitaire) ? 'default' : 'pointer',
          fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 0.5, marginBottom: initial ? 10 : 0,
        }}>
        {initial ? 'ENREGISTRER LES MODIFICATIONS' : "AJOUTER L'INGRÉDIENT"}
      </button>

      {initial && (
        <button onClick={() => { if (window.confirm('Supprimer cet ingrédient ?')) { onDelete(initial.id); onClose(); } }}
          style={{
            width: '100%', padding: '12px', borderRadius: 12, border: '1.5px solid #b23b3b',
            background: 'transparent', color: '#b23b3b', fontSize: 14, fontWeight: 700, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
          <Trash2 size={15} /> Supprimer l'ingrédient
        </button>
      )}
    </div>
  );
}

// ---------- Vente Form (drawn from stock) ----------
function VenteForm({ onSave, onClose, products, onOpenProductModal }) {
  const [produitId, setProduitId] = useState(products[0]?.id || '');
  const [quantite, setQuantite] = useState('1');
  const [prixUnitaire, setPrixUnitaire] = useState(products[0]?.prixVente?.toString() || '');
  const [date, setDate] = useState(todayStr());

  const produit = products.find(p => p.id === produitId);
  const qte = parseFloat(quantite) || 0;
  const total = qte * (parseFloat(prixUnitaire) || 0);
  const stockInsuffisant = produit && qte > produit.stock;

  function choisirProduit(id) {
    setProduitId(id);
    const p = products.find(x => x.id === id);
    if (p) setPrixUnitaire(p.prixVente.toString());
  }

  function submit() {
    if (!produit || !prixUnitaire || qte <= 0) return;
    onSave({
      id: uid(), type: 'vente', produitId: produit.id, produit: produit.nom,
      quantite: qte, prixUnitaire: parseFloat(prixUnitaire), total, date,
    });
    onClose();
  }

  if (products.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '10px 0' }}>
        <Package size={36} color="#8a8570" style={{ marginBottom: 10 }} />
        <p style={{ color: '#5c5748', fontSize: 14, marginBottom: 18 }}>
          Tu n'as encore aucun produit. Ajoute-en un pour pouvoir enregistrer une vente et suivre ton stock.
        </p>
        <button onClick={onOpenProductModal}
          style={{
            width: '100%', padding: '14px', borderRadius: 12, border: 'none',
            background: '#3D5A3D', color: '#F7F0E3', fontSize: 15, fontWeight: 700, cursor: 'pointer',
            fontFamily: "'Barlow Condensed', sans-serif",
          }}>
          + AJOUTER UN PRODUIT
        </button>
      </div>
    );
  }

  return (
    <div>
      <FieldLabel>Produit</FieldLabel>
      <select style={{ ...inputStyle, appearance: 'none' }} value={produitId} onChange={(e) => choisirProduit(e.target.value)}>
        {products.map(p => (
          <option key={p.id} value={p.id}>{p.nom} — stock: {p.stock}</option>
        ))}
      </select>

      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <FieldLabel>Quantité</FieldLabel>
          <input style={inputStyle} type="number" min="0" step="1" value={quantite} onChange={(e) => setQuantite(e.target.value)} />
        </div>
        <div style={{ flex: 1.4 }}>
          <FieldLabel>Prix unitaire (FCFA)</FieldLabel>
          <input style={inputStyle} type="number" min="0" step="1" value={prixUnitaire} onChange={(e) => setPrixUnitaire(e.target.value)} />
        </div>
      </div>
      <FieldLabel>Date</FieldLabel>
      <input style={inputStyle} type="date" value={date} onChange={(e) => setDate(e.target.value)} />

      {stockInsuffisant && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: '#fdf0e5', border: '1.5px solid #e0a458', borderRadius: 10, padding: '10px 12px', marginBottom: 16 }}>
          <AlertTriangle size={16} color="#b2661e" />
          <span style={{ fontSize: 12.5, color: '#8a4e15' }}>
            Stock insuffisant ({produit.stock} disponible{produit.stock > 1 ? 's' : ''}). Tu peux quand même enregistrer.
          </span>
        </div>
      )}

      <div style={{ background: '#efe4c8', borderRadius: 10, padding: '12px 14px', marginBottom: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 13, color: '#5c5748', fontWeight: 600 }}>Total vente</span>
        <span style={{ fontSize: 20, fontWeight: 700, color: '#8B1E3F', fontFamily: "'Barlow Condensed', sans-serif" }}>{formatFCFA(total)}</span>
      </div>

      <button onClick={submit} disabled={!produit || !prixUnitaire || qte <= 0}
        style={{
          width: '100%', padding: '14px', borderRadius: 12, border: 'none',
          background: (!produit || !prixUnitaire || qte <= 0) ? '#c9c0a8' : '#8B1E3F', color: '#F7F0E3',
          fontSize: 16, fontWeight: 700, cursor: (!produit || !prixUnitaire || qte <= 0) ? 'default' : 'pointer',
          fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 0.5,
        }}>
        ENREGISTRER LA VENTE
      </button>
    </div>
  );
}

// ---------- Depense Form ----------
function DepenseForm({ onSave, onClose }) {
  const [categorie, setCategorie] = useState(CATEGORIES_DEPENSES[0]);
  const [description, setDescription] = useState('');
  const [montant, setMontant] = useState('');
  const [date, setDate] = useState(todayStr());

  function submit() {
    if (!montant) return;
    onSave({
      id: uid(), type: 'depense', categorie, description: description.trim(),
      montant: parseFloat(montant), date,
    });
    onClose();
  }

  return (
    <div>
      <FieldLabel>Catégorie</FieldLabel>
      <select style={{ ...inputStyle, appearance: 'none' }} value={categorie} onChange={(e) => setCategorie(e.target.value)}>
        {CATEGORIES_DEPENSES.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
      <FieldLabel>Description (optionnel)</FieldLabel>
      <input style={inputStyle} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex: Farine + sucre au marché" />
      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <FieldLabel>Montant (FCFA)</FieldLabel>
          <input style={inputStyle} type="number" min="0" step="1" value={montant} onChange={(e) => setMontant(e.target.value)} placeholder="0" />
        </div>
        <div style={{ flex: 1 }}>
          <FieldLabel>Date</FieldLabel>
          <input style={inputStyle} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>
      <button onClick={submit} disabled={!montant}
        style={{
          width: '100%', padding: '14px', borderRadius: 12, border: 'none',
          background: !montant ? '#c9c0a8' : '#3D5A3D', color: '#F7F0E3',
          fontSize: 16, fontWeight: 700, cursor: !montant ? 'default' : 'pointer',
          fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 0.5, marginTop: 4,
        }}>
        ENREGISTRER LA DÉPENSE
      </button>
    </div>
  );
}

// ---------- Ticket ----------
function Ticket({ solde, mois }) {
  const positif = solde >= 0;
  const bg = positif ? '#8B1E3F' : '#3D5A3D';
  return (
    <div style={{
      background: bg, color: '#F7F0E3', padding: '26px 22px 22px', margin: '0 16px 20px', position: 'relative',
      clipPath: 'polygon(0% 4%, 3% 0%, 7% 3%, 11% 0%, 15% 3%, 19% 0%, 23% 3%, 27% 0%, 31% 3%, 35% 0%, 39% 3%, 43% 0%, 47% 3%, 51% 0%, 55% 3%, 59% 0%, 63% 3%, 67% 0%, 71% 3%, 75% 0%, 79% 3%, 83% 0%, 87% 3%, 91% 0%, 95% 3%, 100% 0%, 100% 96%, 97% 100%, 93% 97%, 89% 100%, 85% 97%, 81% 100%, 77% 97%, 73% 100%, 69% 97%, 65% 100%, 61% 97%, 57% 100%, 53% 97%, 49% 100%, 45% 97%, 41% 100%, 37% 97%, 33% 100%, 29% 97%, 25% 100%, 21% 97%, 17% 100%, 13% 97%, 9% 100%, 5% 97%, 0% 100%)',
      boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', opacity: 0.75, marginBottom: 4 }}>Solde — {monthLabel(mois)}</div>
      <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 44, fontWeight: 700, letterSpacing: 0.5, lineHeight: 1.1 }}>
        {positif ? '' : '-'}{formatFCFA(Math.abs(solde))}
      </div>
      <div style={{ fontSize: 13, marginTop: 6, opacity: 0.85 }}>{positif ? 'Ça tient bon 👍' : 'Serré ce mois-ci'}</div>
    </div>
  );
}

// ---------- Mini bar chart ----------
function MiniBarChart({ data }) {
  if (data.length === 0) return null;
  const max = Math.max(...data.map(d => Math.max(d.ventes, d.depenses)), 1);
  const w = 320, h = 130, barW = Math.min(28, (w / data.length) - 14);
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h + 24}`} style={{ display: 'block' }}>
      {data.map((d, i) => {
        const gap = w / data.length;
        const x = i * gap + gap / 2 - barW - 3;
        const hv = (d.ventes / max) * h;
        const hd = (d.depenses / max) * h;
        return (
          <g key={d.mois}>
            <rect x={x} y={h - hv} width={barW} height={hv} fill="#8B1E3F" rx={3} />
            <rect x={x + barW + 6} y={h - hd} width={barW} height={hd} fill="#3D5A3D" rx={3} />
            <text x={x + barW + 3} y={h + 16} textAnchor="middle" fontSize="10" fill="#5c5748" fontFamily="Inter, sans-serif">
              {monthLabel(d.mois).split(' ')[0]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ---------- Main App ----------
export default function App() {
  const [session, setSession] = useState(undefined); // undefined = pas encore vérifié, null = pas connecté
  const [entries, setEntries] = useState([]);
  const [products, setProducts] = useState([]);
  const [ingredients, setIngredients] = useState([]);
  const [recettes, setRecettes] = useState([]); // [{id, produitId, ingredientId, quantite}]
  const [loaded, setLoaded] = useState(false);
  const [modal, setModal] = useState(null); // 'vente' | 'depense' | 'produit' | 'ingredient'
  const [editingProduct, setEditingProduct] = useState(null);
  const [editingIngredient, setEditingIngredient] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(todayStr().slice(0, 7));
  const [tab, setTab] = useState('overview'); // overview | produits | historique | recap
  const [exportToast, setExportToast] = useState(null);
  const [phone, setPhone] = useState('');
  const [lastSentDate, setLastSentDate] = useState(null);
  const [isOffline, setIsOffline] = useState(typeof navigator !== 'undefined' && !navigator.onLine);
  const [pendingSync, setPendingSync] = useState(0);

  // ---------- Authentification ----------
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  // ---------- Chargement des données distantes (Supabase) ----------
  useEffect(() => {
    if (!session?.user) return;
    setLoaded(false);
    loadAllData(session.user.id).then(({ entries, products, phone, ingredients, recettes }) => {
      setEntries(entries);
      setProducts(products);
      setPhone(phone);
      setIngredients(ingredients || []);
      setRecettes(recettes || []);
      const savedLastSent = storageGet('lastSentDate');
      if (savedLastSent) setLastSentDate(savedLastSent);
      setLoaded(true);
    });
  }, [session?.user?.id]);

  // lastSentDate reste local (juste un rappel visuel, pas critique à synchroniser)
  useEffect(() => { if (loaded && lastSentDate) storageSet('lastSentDate', lastSentDate); }, [lastSentDate, loaded]);

  // Garde le cache local à jour à chaque changement (utile si on repasse hors-ligne)
  useEffect(() => { if (loaded) updateCacheAfterChange(entries, products, phone, ingredients, recettes); }, [entries, products, phone, ingredients, recettes, loaded]);

  // Détection réseau + rejeu automatique de la file d'attente hors-ligne
  useEffect(() => {
    setPendingSync(getQueueLength());

    async function trySync() {
      const remaining = await flushQueue(buildFlushHandlers());
      setPendingSync(remaining ?? 0);
    }

    function handleOnline() {
      setIsOffline(false);
      trySync();
    }
    function handleOffline() {
      setIsOffline(true);
    }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    if (navigator.onLine) trySync();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  function handleExport() {
    exportMonthToExcel(monthLabel(selectedMonth), monthEntries, {
      totalVentes, totalDepenses, solde,
      margeTotale: margeStats.margeTotale, coutTotal: margeStats.coutTotal, margePercent: margeStats.margePercent,
    });
    setExportToast(`Rapport de ${monthLabel(selectedMonth)} téléchargé ✓`);
    setTimeout(() => setExportToast(null), 2800);
  }

  function addEntry(e) {
    setEntries(prev => [...prev, e]);
    if (e.type === 'vente') {
      insertVente(session.user.id, e);
      if (e.produitId) {
        setProducts(prev => prev.map(p => {
          if (p.id !== e.produitId) return p;
          const nouveauStock = Math.max(0, p.stock - e.quantite);
          updateProduitStockRemote(p.id, nouveauStock);
          return { ...p, stock: nouveauStock };
        }));
      }
    } else {
      insertDepense(session.user.id, e);
    }
  }

  function deleteEntry(id) {
    const e = entries.find(x => x.id === id);
    if (!e) return;
    if (e.type === 'vente' && e.produitId) {
      setProducts(prev => prev.map(p => {
        if (p.id !== e.produitId) return p;
        const nouveauStock = p.stock + e.quantite;
        updateProduitStockRemote(p.id, nouveauStock);
        return { ...p, stock: nouveauStock };
      }));
    }
    deleteEntryRemote(e);
    setEntries(prev => prev.filter(e => e.id !== id));
  }

  function saveProduct(p) {
    setProducts(prev => {
      const exists = prev.some(x => x.id === p.id);
      return exists ? prev.map(x => x.id === p.id ? p : x) : [...prev, p];
    });
    upsertProduitRemote(session.user.id, p);
  }

  function deleteProduct(id) {
    setProducts(prev => prev.filter(p => p.id !== id));
    setRecettes(prev => prev.filter(r => r.produitId !== id));
    deleteProduitRemote(id);
  }

  function saveIngredient(ing) {
    setIngredients(prev => {
      const exists = prev.some(x => x.id === ing.id);
      return exists ? prev.map(x => x.id === ing.id ? ing : x) : [...prev, ing];
    });
    upsertIngredientRemote(session.user.id, ing);
  }

  function deleteIngredient(id) {
    setIngredients(prev => prev.filter(i => i.id !== id));
    setRecettes(prev => prev.filter(r => r.ingredientId !== id));
    deleteIngredientRemote(id);
  }

  // lignes = [{ id, ingredientId, quantite }]
  function saveRecette(produitId, lignes) {
    setRecettes(prev => [...prev.filter(r => r.produitId !== produitId), ...lignes.map(l => ({ ...l, produitId }))]);
    replaceRecetteRemote(session.user.id, produitId, lignes);
  }

  function coutRevientProduit(produitId) {
    return recettes
      .filter(r => r.produitId === produitId)
      .reduce((sum, r) => {
        const ing = ingredients.find(i => i.id === r.ingredientId);
        return sum + (ing ? ing.prixUnitaire * r.quantite : 0);
      }, 0);
  }

  function updatePhone(newPhone) {
    setPhone(newPhone);
    if (session?.user) updatePhoneRemote(session.user.id, newPhone);
  }

  function sendWhatsAppSummary(dateStr) {
    const text = buildDailySummaryText(dateStr, entries, products);
    window.open(waLink(phone, text), '_blank');
    setLastSentDate(dateStr);
  }

  const months = useMemo(() => {
    const set = new Set(entries.map(e => monthKey(e.date)));
    set.add(selectedMonth);
    return Array.from(set).sort().reverse();
  }, [entries, selectedMonth]);

  const monthEntries = entries.filter(e => monthKey(e.date) === selectedMonth);
  const ventes = monthEntries.filter(e => e.type === 'vente');
  const depenses = monthEntries.filter(e => e.type === 'depense');
  const totalVentes = ventes.reduce((s, e) => s + e.total, 0);
  const totalDepenses = depenses.reduce((s, e) => s + e.montant, 0);
  const solde = totalVentes - totalDepenses;

  const parProduit = useMemo(() => {
    const map = {};
    ventes.forEach(v => {
      if (!map[v.produit]) map[v.produit] = { produit: v.produit, quantite: 0, total: 0 };
      map[v.produit].quantite += v.quantite;
      map[v.produit].total += v.total;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [ventes]);

  const margeStats = useMemo(() => {
    let margeTotale = 0;
    let coutTotal = 0;
    const parProduitMarge = {};
    ventes.forEach(v => {
      const cout = v.produitId ? coutRevientProduit(v.produitId) * v.quantite : 0;
      const marge = v.total - cout;
      margeTotale += marge;
      coutTotal += cout;
      const key = v.produit || 'Sans nom';
      if (!parProduitMarge[key]) parProduitMarge[key] = { produit: key, marge: 0, quantite: 0 };
      parProduitMarge[key].marge += marge;
      parProduitMarge[key].quantite += v.quantite;
    });
    const margePercent = totalVentes > 0 ? (margeTotale / totalVentes) * 100 : 0;
    const top = Object.values(parProduitMarge).sort((a, b) => b.marge - a.marge).slice(0, 5);
    return { margeTotale, coutTotal, margePercent, top };
  }, [ventes, ingredients, recettes, totalVentes]);

  const chartData = useMemo(() => {
    const map = {};
    entries.forEach(e => {
      const mk = monthKey(e.date);
      if (!map[mk]) map[mk] = { mois: mk, ventes: 0, depenses: 0 };
      if (e.type === 'vente') map[mk].ventes += e.total;
      else map[mk].depenses += e.montant;
    });
    return Object.values(map).sort((a, b) => a.mois.localeCompare(b.mois)).slice(-6);
  }, [entries]);

  const historique = [...monthEntries].sort((a, b) => b.date.localeCompare(a.date));

  const yEntries = entries.filter(e => e.date === yesterdayStr());
  const yesterdayNotSent = yEntries.length > 0 && lastSentDate !== yesterdayStr();

  if (session === undefined) return <div style={{ minHeight: '100vh', background: '#1A1F16' }} />;
  if (session === null) return <Auth />;
  if (!loaded) return <div style={{ minHeight: '100vh', background: '#1A1F16' }} />;

  return (
    <div style={{ minHeight: '100vh', background: '#1A1F16', fontFamily: "'Inter', sans-serif", paddingBottom: 100 }}>
      {/* Header */}
      <div style={{ padding: '28px 20px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 11, color: '#8a8570', fontWeight: 600, letterSpacing: 1.2, textTransform: 'uppercase' }}>🍰 Atelier Manager</div>
          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 26, fontWeight: 700, color: '#F7F0E3' }}>Trésorerie</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {(isOffline || pendingSync > 0) && (
            <div title={isOffline ? 'Hors-ligne — les données seront synchronisées au retour du réseau' : `${pendingSync} élément(s) en attente de synchronisation`}
              style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#3a2f1a', border: '1px solid #6b5424', borderRadius: 10, padding: '6px 10px', fontSize: 11, color: '#E8B94A', fontWeight: 600 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#E8B94A' }} />
              {isOffline ? 'Hors-ligne' : `Sync… (${pendingSync})`}
            </div>
          )}
          <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}
            style={{ background: '#262c1e', color: '#F7F0E3', border: '1.5px solid #3a3f2e', borderRadius: 10, padding: '8px 30px 8px 12px', fontSize: 14, fontWeight: 600, appearance: 'none', cursor: 'pointer' }}>
            {months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
          <button onClick={() => supabase.auth.signOut()} title="Se déconnecter"
            style={{ background: '#262c1e', border: '1.5px solid #3a3f2e', borderRadius: 10, padding: '9px', cursor: 'pointer', display: 'flex' }}>
            <LogOut size={16} color="#a8a38e" />
          </button>
        </div>
      </div>

      {yesterdayNotSent && (
        <button onClick={() => setTab('recap')} style={{ margin: '0 16px 12px', width: 'calc(100% - 32px)', background: '#20301f', border: '1.5px solid #3D5A3D', borderRadius: 12, padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', textAlign: 'left' }}>
          <MessageCircle size={15} color="#8fae8f" />
          <span style={{ color: '#c9e0c9', fontSize: 12.5, flex: 1 }}>
            Le récap d'hier n'a pas été envoyé — tape ici pour l'envoyer par WhatsApp
          </span>
        </button>
      )}

      <Ticket solde={solde} mois={selectedMonth} />

      {/* Quick stats */}
      <div style={{ display: 'flex', gap: 10, padding: '0 16px 20px' }}>
        <div style={{ flex: 1, background: '#262c1e', borderRadius: 12, padding: '14px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#8B1E3F', marginBottom: 4 }}>
            <TrendingUp size={14} />
            <span style={{ fontSize: 11, fontWeight: 700, color: '#c98a9e', textTransform: 'uppercase', letterSpacing: 0.5 }}>Ventes</span>
          </div>
          <div style={{ color: '#F7F0E3', fontSize: 17, fontWeight: 700 }}>{formatFCFA(totalVentes)}</div>
        </div>
        <div style={{ flex: 1, background: '#262c1e', borderRadius: 12, padding: '14px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#3D5A3D', marginBottom: 4 }}>
            <TrendingDown size={14} />
            <span style={{ fontSize: 11, fontWeight: 700, color: '#8fae8f', textTransform: 'uppercase', letterSpacing: 0.5 }}>Dépenses</span>
          </div>
          <div style={{ color: '#F7F0E3', fontSize: 17, fontWeight: 700 }}>{formatFCFA(totalDepenses)}</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, padding: '0 16px 16px', overflowX: 'auto' }}>
        {[['overview', 'Vue d’ensemble'], ['produits', 'Produits'], ['ingredients', 'Ingrédients'], ['historique', 'Historique'], ['recap', 'Récap WhatsApp']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{ padding: '8px 14px', borderRadius: 20, border: 'none', cursor: 'pointer', background: tab === key ? '#E8B94A' : '#262c1e', color: tab === key ? '#1A1F16' : '#a8a38e', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}>
            {label}
          </button>
        ))}
      </div>

      <div style={{ padding: '0 16px' }}>
        {tab === 'overview' && (
          <div style={{ background: '#262c1e', borderRadius: 14, padding: '18px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ color: '#F7F0E3', fontSize: 14, fontWeight: 700 }}>Ventes vs dépenses — 6 derniers mois</div>
              <button onClick={handleExport} style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#3a3f2e', border: 'none', borderRadius: 8, padding: '5px 9px', color: '#E8B94A', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>
                <Download size={12} /> Exporter
              </button>
            </div>
            {chartData.length === 0 ? (
              <div style={{ color: '#8a8570', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
                Aucune donnée pour l'instant. Ajoute ta première vente ci-dessous.
              </div>
            ) : (
              <>
                <MiniBarChart data={chartData} />
                <div style={{ display: 'flex', gap: 16, marginTop: 8, justifyContent: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}><div style={{ width: 10, height: 10, borderRadius: 3, background: '#8B1E3F' }} /><span style={{ fontSize: 12, color: '#a8a38e' }}>Ventes</span></div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}><div style={{ width: 10, height: 10, borderRadius: 3, background: '#3D5A3D' }} /><span style={{ fontSize: 12, color: '#a8a38e' }}>Dépenses</span></div>
                </div>
              </>
            )}
          </div>
        )}

        {tab === 'overview' && (
          <div style={{ background: '#262c1e', borderRadius: 14, padding: '18px 16px', marginTop: 12 }}>
            <div style={{ color: '#F7F0E3', fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Rentabilité — {monthLabel(selectedMonth)}</div>
            <div style={{ display: 'flex', gap: 10, marginBottom: margeStats.top.length > 0 ? 14 : 0 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10.5, color: '#8a8570', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 }}>Marge brute</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: margeStats.margeTotale >= 0 ? '#8fae8f' : '#e08a8a' }}>{formatFCFA(margeStats.margeTotale)}</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10.5, color: '#8a8570', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 }}>Coût des ingrédients</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#F7F0E3' }}>{formatFCFA(margeStats.coutTotal)}</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10.5, color: '#8a8570', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 }}>Marge %</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#E8B94A' }}>{margeStats.margePercent.toFixed(0)}%</div>
              </div>
            </div>
            {margeStats.top.length > 0 && (
              <div>
                <div style={{ fontSize: 11.5, color: '#8a8570', marginBottom: 8 }}>Produits les plus rentables</div>
                {margeStats.top.map((p, idx) => (
                  <div key={p.produit} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: idx > 0 ? '1px solid #333a28' : 'none' }}>
                    <span style={{ fontSize: 13, color: '#c9c4b0' }}>{p.produit} <span style={{ color: '#5c5748' }}>×{p.quantite}</span></span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#8fae8f' }}>{formatFCFA(p.marge)}</span>
                  </div>
                ))}
              </div>
            )}
            {ingredients.length === 0 && (
              <div style={{ fontSize: 12, color: '#8a8570', marginTop: 10 }}>
                Ajoute tes ingrédients dans l'onglet "Ingrédients" et relie-les à tes produits pour voir ton coût de revient réel.
              </div>
            )}
          </div>
        )}

        {tab === 'produits' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button onClick={() => { setEditingProduct(null); setModal('produit'); }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: '#262c1e', border: '1.5px dashed #4a4636', borderRadius: 12, padding: '13px', color: '#E8B94A', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
              <Plus size={16} /> Ajouter un produit
            </button>
            {products.length === 0 ? (
              <div style={{ background: '#262c1e', borderRadius: 14, padding: '24px 16px', color: '#8a8570', fontSize: 13, textAlign: 'center' }}>
                Aucun produit pour l'instant.
              </div>
            ) : products.map(p => {
              const stockBas = p.stock <= p.seuilAlerte;
              const cout = coutRevientProduit(p.id);
              const aRecette = recettes.some(r => r.produitId === p.id);
              const marge = p.prixVente - cout;
              return (
                <div key={p.id} onClick={() => { setEditingProduct(p); setModal('produit'); }}
                  style={{ background: '#262c1e', borderRadius: 12, padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                  <div>
                    <div style={{ color: '#F7F0E3', fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                      {p.nom}
                      <Pencil size={11} color="#5c5748" />
                    </div>
                    <div style={{ color: '#8a8570', fontSize: 12 }}>{formatFCFA(p.prixVente)} / unité</div>
                    {aRecette && (
                      <div style={{ color: '#6b8f6b', fontSize: 11.5, marginTop: 2 }}>
                        Coût: {formatFCFA(cout)} · Marge: {formatFCFA(marge)}
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 700,
                      color: stockBas ? '#e0a458' : '#8fae8f',
                    }}>
                      {stockBas && <AlertTriangle size={13} />}
                      Stock: {p.stock}
                    </div>
                    {stockBas && <div style={{ fontSize: 10.5, color: '#8a8570' }}>Seuil: {p.seuilAlerte}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === 'ingredients' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button onClick={() => { setEditingIngredient(null); setModal('ingredient'); }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: '#262c1e', border: '1.5px dashed #4a4636', borderRadius: 12, padding: '13px', color: '#E8B94A', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
              <Plus size={16} /> Ajouter un ingrédient
            </button>
            {ingredients.length === 0 ? (
              <div style={{ background: '#262c1e', borderRadius: 14, padding: '24px 16px', color: '#8a8570', fontSize: 13, textAlign: 'center' }}>
                Aucun ingrédient pour l'instant. Ajoute la farine, le beurre, le sucre... pour calculer ton coût de revient.
              </div>
            ) : ingredients.map(i => {
              const stockBas = i.stock <= i.seuilAlerte;
              return (
                <div key={i.id} onClick={() => { setEditingIngredient(i); setModal('ingredient'); }}
                  style={{ background: '#262c1e', borderRadius: 12, padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                  <div>
                    <div style={{ color: '#F7F0E3', fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                      {i.nom}
                      <Pencil size={11} color="#5c5748" />
                    </div>
                    <div style={{ color: '#8a8570', fontSize: 12 }}>{formatFCFA(i.prixUnitaire)} / {i.unite}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 700, color: stockBas ? '#e0a458' : '#8fae8f' }}>
                      {stockBas && <AlertTriangle size={13} />}
                      {i.stock} {i.unite}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === 'historique' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {historique.length === 0 ? (
              <div style={{ background: '#262c1e', borderRadius: 14, padding: '24px 16px', color: '#8a8570', fontSize: 13, textAlign: 'center' }}>Rien d'enregistré ce mois-ci.</div>
            ) : historique.map(e => (
              <div key={e.id}
                style={{ background: '#262c1e', borderRadius: 12, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div onClick={() => { if (window.confirm('Supprimer cette entrée ?')) deleteEntry(e.id); }} style={{ cursor: 'pointer', flex: 1 }}>
                  <div style={{ color: '#F7F0E3', fontSize: 14, fontWeight: 600 }}>{e.type === 'vente' ? e.produit : (e.description || e.categorie)}</div>
                  <div style={{ color: '#8a8570', fontSize: 12 }}>{dateLabel(e.date)} {e.type === 'depense' ? `· ${e.categorie}` : `· ${e.quantite} unité(s)`}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {e.type === 'vente' && (
                    <button onClick={(ev) => { ev.stopPropagation(); generateInvoicePDF(e, { telephone: phone }); }}
                      title="Générer la facture PDF"
                      style={{ background: '#1e2318', border: '1px solid #3a3f2e', borderRadius: 8, padding: 6, cursor: 'pointer', display: 'flex' }}>
                      <FileText size={14} color="#E8B94A" />
                    </button>
                  )}
                  <div style={{ color: e.type === 'vente' ? '#c98a9e' : '#8fae8f', fontSize: 15, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif" }}>
                    {e.type === 'vente' ? '+' : '-'}{formatFCFA(e.type === 'vente' ? e.total : e.montant)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'recap' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ background: '#262c1e', borderRadius: 14, padding: '16px' }}>
              <FieldLabel>Numéro WhatsApp du commerçant</FieldLabel>
              <input style={{ ...inputStyle, marginBottom: 6, background: '#1A1F16', color: '#F7F0E3', border: '1.5px solid #3a3f2e' }}
                value={phone} onChange={(e) => setPhone(e.target.value)} onBlur={(e) => updatePhone(e.target.value)} placeholder="Ex: 237699112233 (avec indicatif pays)" />
              <div style={{ fontSize: 11.5, color: '#8a8570' }}>Format international sans le "+", ex: 237XXXXXXXXX</div>
            </div>

            <div style={{ background: '#262c1e', borderRadius: 14, padding: '16px' }}>
              <div style={{ color: '#F7F0E3', fontSize: 14, fontWeight: 700, marginBottom: 10 }}>
                Aperçu du récap — aujourd'hui ({dateLabel(todayStr())})
              </div>
              <pre style={{ whiteSpace: 'pre-wrap', color: '#c9c4ae', fontSize: 12.5, fontFamily: "'Inter', sans-serif", background: '#1A1F16', borderRadius: 10, padding: 12, margin: 0, marginBottom: 14 }}>
                {buildDailySummaryText(todayStr(), entries, products)}
              </pre>
              <button onClick={() => sendWhatsAppSummary(todayStr())} disabled={!phone}
                style={{
                  width: '100%', padding: '14px', borderRadius: 12, border: 'none',
                  background: !phone ? '#3a3f2e' : '#25D366', color: !phone ? '#8a8570' : '#0b2312',
                  fontSize: 15, fontWeight: 700, cursor: !phone ? 'default' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 0.3,
                }}>
                <MessageCircle size={17} /> ENVOYER PAR WHATSAPP
              </button>
              {!phone && <div style={{ fontSize: 11.5, color: '#8a8570', marginTop: 8, textAlign: 'center' }}>Ajoute d'abord un numéro ci-dessus</div>}
            </div>

            <div style={{ background: '#20261a', border: '1.5px solid #3a4030', borderRadius: 14, padding: '14px 16px' }}>
              <div style={{ color: '#E8B94A', fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>ℹ️ À savoir</div>
              <p style={{ color: '#a8a38e', fontSize: 12.5, lineHeight: 1.5, margin: 0 }}>
                Cette appli tourne dans ton navigateur : elle ne peut pas envoyer le récap toute seule à minuit si le téléphone est éteint.
                Le bouton ci-dessus ouvre WhatsApp avec le message déjà prêt — un vrai envoi automatique à 00h nécessite un petit bot connecté (Node.js/Baileys) tournant sur un serveur ou VPS, qui pourrait déclencher cet envoi tout seul chaque nuit.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Floating action buttons */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, display: 'flex', gap: 10, padding: '14px 16px calc(14px + env(safe-area-inset-bottom))', background: 'linear-gradient(to top, #1A1F16 60%, transparent)' }}>
        <button onClick={() => setModal('depense')} style={{ flex: 1, padding: '15px', borderRadius: 14, border: '1.5px solid #3D5A3D', background: '#1A1F16', color: '#8fae8f', fontSize: 15, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 0.3 }}>
          <Plus size={18} /> DÉPENSE
        </button>
        <button onClick={() => setModal('vente')} style={{ flex: 1, padding: '15px', borderRadius: 14, border: 'none', background: '#8B1E3F', color: '#F7F0E3', fontSize: 15, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 0.3, boxShadow: '0 4px 14px rgba(139,30,63,0.4)' }}>
          <Plus size={18} /> VENTE
        </button>
      </div>

      {modal === 'vente' && (
        <Modal title="Nouvelle vente" onClose={() => setModal(null)}>
          <VenteForm onSave={addEntry} onClose={() => setModal(null)} products={products} onOpenProductModal={() => { setModal('produit'); setEditingProduct(null); }} />
        </Modal>
      )}
      {modal === 'depense' && (
        <Modal title="Nouvelle dépense" onClose={() => setModal(null)}>
          <DepenseForm onSave={addEntry} onClose={() => setModal(null)} />
        </Modal>
      )}
      {modal === 'produit' && (
        <Modal title={editingProduct ? 'Modifier le produit' : 'Nouveau produit'} onClose={() => setModal(null)}>
          <ProductForm
            initial={editingProduct}
            onSave={saveProduct}
            onDelete={deleteProduct}
            onClose={() => setModal(null)}
            ingredients={ingredients}
            recetteLignes={editingProduct ? recettes.filter(r => r.produitId === editingProduct.id) : []}
            onSaveRecette={saveRecette}
          />
        </Modal>
      )}
      {modal === 'ingredient' && (
        <Modal title={editingIngredient ? "Modifier l'ingrédient" : 'Nouvel ingrédient'} onClose={() => setModal(null)}>
          <IngredientForm initial={editingIngredient} onSave={saveIngredient} onDelete={deleteIngredient} onClose={() => setModal(null)} />
        </Modal>
      )}

      {exportToast && (
        <div style={{ position: 'fixed', bottom: 92, left: '50%', transform: 'translateX(-50%)', background: '#E8B94A', color: '#1A1F16', padding: '10px 18px', borderRadius: 30, fontSize: 13, fontWeight: 700, boxShadow: '0 6px 20px rgba(0,0,0,0.35)', zIndex: 70, display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
          <Check size={14} /> {exportToast}
        </div>
      )}
    </div>
  );
}
