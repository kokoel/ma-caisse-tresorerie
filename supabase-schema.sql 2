-- ============================================================
-- Atelier Manager — Schéma Supabase (Phase 1)
-- À exécuter dans : Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- Extension nécessaire pour les UUID
create extension if not exists "uuid-ossp";

-- ------------------------------------------------------------
-- Table : profiles
-- Un profil par utilisateur (créé automatiquement à l'inscription)
-- ------------------------------------------------------------
create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  nom_atelier text default 'Mon Atelier',
  whatsapp_numero text,
  created_at timestamp with time zone default now()
);

alter table profiles enable row level security;

create policy "Un utilisateur voit/modifie uniquement son profil"
  on profiles for all
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Création automatique du profil à l'inscription
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, nom_atelier)
  values (new.id, 'Mon Atelier');
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ------------------------------------------------------------
-- Table : produits (catalogue + stock)
-- ------------------------------------------------------------
create table if not exists produits (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users on delete cascade not null,
  nom text not null,
  prix numeric(12,2) not null default 0,
  stock integer not null default 0,
  seuil_alerte integer not null default 5,
  created_at timestamp with time zone default now()
);

alter table produits enable row level security;

create policy "Un utilisateur gère uniquement ses produits"
  on produits for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ------------------------------------------------------------
-- Table : ventes
-- ------------------------------------------------------------
create table if not exists ventes (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users on delete cascade not null,
  produit_id uuid references produits on delete set null,
  description text,
  montant numeric(12,2) not null,
  quantite integer default 1,
  moyen_paiement text default 'especes', -- especes | orange_money | mtn_momo
  date_vente date not null default current_date,
  created_at timestamp with time zone default now()
);

alter table ventes enable row level security;

create policy "Un utilisateur gère uniquement ses ventes"
  on ventes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ------------------------------------------------------------
-- Table : depenses
-- ------------------------------------------------------------
create table if not exists depenses (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users on delete cascade not null,
  description text,
  montant numeric(12,2) not null,
  date_depense date not null default current_date,
  created_at timestamp with time zone default now()
);

alter table depenses enable row level security;

create policy "Un utilisateur gère uniquement ses dépenses"
  on depenses for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ------------------------------------------------------------
-- Index utiles
-- ------------------------------------------------------------
create index if not exists idx_ventes_user_date on ventes (user_id, date_vente);
create index if not exists idx_depenses_user_date on depenses (user_id, date_depense);
create index if not exists idx_produits_user on produits (user_id);
