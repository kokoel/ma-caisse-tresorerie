import { supabase } from './supabaseClient';
import { enqueue, isOffline } from './offlineQueue';

const CACHE_KEY = 'atelier:dataCache';

function cacheData(data) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('Impossible de mettre les données en cache local.', e);
  }
}

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------
// Chargement initial : essaie Supabase, retombe sur le cache local
// (dernières données connues) si le téléphone est hors-ligne.
// ------------------------------------------------------------------
export async function loadAllData(userId) {
  if (isOffline()) {
    const cached = readCache();
    if (cached) return cached;
  }

  try {
    const [{ data: ventesData, error: ventesErr }, { data: depensesData, error: depensesErr },
      { data: produitsData, error: produitsErr }, { data: profileData, error: profileErr },
      { data: ingredientsData, error: ingredientsErr }, { data: recetteData, error: recetteErr }] =
      await Promise.all([
        supabase.from('ventes').select('*').eq('user_id', userId),
        supabase.from('depenses').select('*').eq('user_id', userId),
        supabase.from('produits').select('*').eq('user_id', userId),
        supabase.from('profiles').select('*').eq('id', userId).single(),
        supabase.from('ingredients').select('*').eq('user_id', userId),
        supabase.from('recette_lignes').select('*').eq('user_id', userId),
      ]);

    if (ventesErr) throw ventesErr;
    if (depensesErr) throw depensesErr;
    if (produitsErr) throw produitsErr;
    if (profileErr) console.warn('Profil non trouvé (pas bloquant):', profileErr);
    if (ingredientsErr) throw ingredientsErr;
    if (recetteErr) throw recetteErr;

    const entries = [
      ...(ventesData || []).map((v) => ({
        id: v.id,
        type: 'vente',
        produitId: v.produit_id,
        produit: v.produit_nom,
        quantite: v.quantite,
        prixUnitaire: v.prix_unitaire,
        total: v.montant,
        date: v.date_vente,
      })),
      ...(depensesData || []).map((d) => ({
        id: d.id,
        type: 'depense',
        categorie: d.categorie,
        description: d.description,
        montant: d.montant,
        date: d.date_depense,
      })),
    ];

    const products = (produitsData || []).map((p) => ({
      id: p.id,
      nom: p.nom,
      prixVente: p.prix,
      stock: p.stock,
      seuilAlerte: p.seuil_alerte,
    }));

    const phone = profileData?.whatsapp_numero || '';

    const ingredients = (ingredientsData || []).map((i) => ({
      id: i.id,
      nom: i.nom,
      prixUnitaire: i.prix_unitaire,
      unite: i.unite,
      stock: i.stock,
      seuilAlerte: i.seuil_alerte,
    }));

    const recettes = (recetteData || []).map((r) => ({
      id: r.id,
      produitId: r.produit_id,
      ingredientId: r.ingredient_id,
      quantite: r.quantite,
    }));

    const result = { entries, products, phone, ingredients, recettes };
    cacheData(result);
    return result;
  } catch (err) {
    console.error('Erreur chargement des données, utilisation du cache local:', err);
    const cached = readCache();
    return cached || { entries: [], products: [], phone: '', ingredients: [], recettes: [] };
  }
}

export function updateCacheAfterChange(entries, products, phone, ingredients, recettes) {
  cacheData({ entries, products, phone, ingredients, recettes });
}

// ------------------------------------------------------------------
// Écritures : chacune tente Supabase directement ; si ça échoue
// (hors-ligne ou coupure réseau), l'action est mise en file d'attente
// et rejouée automatiquement plus tard (voir offlineQueue.js).
// ------------------------------------------------------------------

async function withOfflineFallback(type, payload, run) {
  if (isOffline()) {
    enqueue(type, payload);
    return;
  }
  try {
    await run();
  } catch (error) {
    console.warn(`Écriture "${type}" impossible en ligne, mise en file d'attente.`, error);
    enqueue(type, payload);
  }
}

export async function insertVente(userId, entry) {
  const payload = { userId, entry };
  await withOfflineFallback('insertVente', payload, async () => {
    const { error } = await supabase.from('ventes').insert({
      id: entry.id,
      user_id: userId,
      produit_id: entry.produitId,
      produit_nom: entry.produit,
      quantite: entry.quantite,
      prix_unitaire: entry.prixUnitaire,
      montant: entry.total,
      date_vente: entry.date,
    });
    if (error) throw error;
  });
}

export async function insertDepense(userId, entry) {
  const payload = { userId, entry };
  await withOfflineFallback('insertDepense', payload, async () => {
    const { error } = await supabase.from('depenses').insert({
      id: entry.id,
      user_id: userId,
      categorie: entry.categorie,
      description: entry.description,
      montant: entry.montant,
      date_depense: entry.date,
    });
    if (error) throw error;
  });
}

export async function deleteEntryRemote(entry) {
  const payload = { entry };
  await withOfflineFallback('deleteEntry', payload, async () => {
    const table = entry.type === 'vente' ? 'ventes' : 'depenses';
    const { error } = await supabase.from(table).delete().eq('id', entry.id);
    if (error) throw error;
  });
}

export async function upsertProduitRemote(userId, product) {
  const payload = { userId, product };
  await withOfflineFallback('upsertProduit', payload, async () => {
    const { error } = await supabase.from('produits').upsert({
      id: product.id,
      user_id: userId,
      nom: product.nom,
      prix: product.prixVente,
      stock: product.stock,
      seuil_alerte: product.seuilAlerte,
    });
    if (error) throw error;
  });
}

export async function updateProduitStockRemote(productId, stock) {
  const payload = { productId, stock };
  await withOfflineFallback('updateProduitStock', payload, async () => {
    const { error } = await supabase.from('produits').update({ stock }).eq('id', productId);
    if (error) throw error;
  });
}

export async function deleteProduitRemote(productId) {
  const payload = { productId };
  await withOfflineFallback('deleteProduit', payload, async () => {
    const { error } = await supabase.from('produits').delete().eq('id', productId);
    if (error) throw error;
  });
}

export async function updatePhoneRemote(userId, phone) {
  const payload = { userId, phone };
  await withOfflineFallback('updatePhone', payload, async () => {
    const { error } = await supabase.from('profiles').upsert({ id: userId, whatsapp_numero: phone });
    if (error) throw error;
  });
}

export async function upsertIngredientRemote(userId, ingredient) {
  const payload = { userId, ingredient };
  await withOfflineFallback('upsertIngredient', payload, async () => {
    const { error } = await supabase.from('ingredients').upsert({
      id: ingredient.id,
      user_id: userId,
      nom: ingredient.nom,
      prix_unitaire: ingredient.prixUnitaire,
      unite: ingredient.unite,
      stock: ingredient.stock,
      seuil_alerte: ingredient.seuilAlerte,
    });
    if (error) throw error;
  });
}

export async function deleteIngredientRemote(ingredientId) {
  const payload = { ingredientId };
  await withOfflineFallback('deleteIngredient', payload, async () => {
    const { error } = await supabase.from('ingredients').delete().eq('id', ingredientId);
    if (error) throw error;
  });
}

// Remplace toutes les lignes de recette d'un produit (plus simple/robuste que de differ ligne par ligne)
export async function replaceRecetteRemote(userId, produitId, lignes) {
  const payload = { userId, produitId, lignes };
  await withOfflineFallback('replaceRecette', payload, async () => {
    const { error: delError } = await supabase.from('recette_lignes').delete().eq('produit_id', produitId);
    if (delError) throw delError;
    if (lignes.length > 0) {
      const { error: insError } = await supabase.from('recette_lignes').insert(
        lignes.map((l) => ({
          id: l.id,
          user_id: userId,
          produit_id: produitId,
          ingredient_id: l.ingredientId,
          quantite: l.quantite,
        }))
      );
      if (insError) throw insError;
    }
  });
}

// ------------------------------------------------------------------
// Rejeu de la file d'attente (appelé au retour de connexion)
// ------------------------------------------------------------------
export function buildFlushHandlers() {
  return {
    insertVente: ({ userId, entry }) => insertVente(userId, entry),
    insertDepense: ({ userId, entry }) => insertDepense(userId, entry),
    deleteEntry: ({ entry }) => deleteEntryRemote(entry),
    upsertProduit: ({ userId, product }) => upsertProduitRemote(userId, product),
    updateProduitStock: ({ productId, stock }) => updateProduitStockRemote(productId, stock),
    deleteProduit: ({ productId }) => deleteProduitRemote(productId),
    updatePhone: ({ userId, phone }) => updatePhoneRemote(userId, phone),
    upsertIngredient: ({ userId, ingredient }) => upsertIngredientRemote(userId, ingredient),
    deleteIngredient: ({ ingredientId }) => deleteIngredientRemote(ingredientId),
    replaceRecette: ({ userId, produitId, lignes }) => replaceRecetteRemote(userId, produitId, lignes),
  };
}
