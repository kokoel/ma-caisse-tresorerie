-- ============================================================
-- Atelier Manager — Phase 3 : Ingrédients, recettes, coût de revient
-- À exécuter après supabase-schema.sql et supabase-schema-update.sql
-- ============================================================

-- ------------------------------------------------------------
-- Table : ingredients
-- ------------------------------------------------------------
create table if not exists ingredients (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users on delete cascade not null,
  nom text not null,
  prix_unitaire numeric(12,2) not null default 0, -- prix pour 1 unité (ex: prix au gramme, au litre...)
  unite text not null default 'unite', -- g | kg | ml | l | unite
  stock numeric(12,2) not null default 0,
  seuil_alerte numeric(12,2) not null default 0,
  created_at timestamp with time zone default now()
);

alter table ingredients enable row level security;

create policy "Un utilisateur gère uniquement ses ingrédients"
  on ingredients for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ------------------------------------------------------------
-- Table : recette_lignes
-- Une ligne = "il faut X grammes/unités de tel ingrédient pour faire ce produit"
-- ------------------------------------------------------------
create table if not exists recette_lignes (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users on delete cascade not null,
  produit_id uuid references produits on delete cascade not null,
  ingredient_id uuid references ingredients on delete cascade not null,
  quantite numeric(12,3) not null default 0
);

alter table recette_lignes enable row level security;

create policy "Un utilisateur gère uniquement ses recettes"
  on recette_lignes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists idx_recette_lignes_produit on recette_lignes (produit_id);
create index if not exists idx_ingredients_user on ingredients (user_id);
