-- IMRECALL — 001: Estensioni & Tipi
create extension if not exists "uuid-ossp";
create extension if not exists vector;

create type memory_type as enum ('text', 'audio', 'image', 'link', 'deadline');
create type memory_status as enum ('processing', 'ready', 'error');
create type entity_type as enum ('person', 'place', 'organization', 'date', 'other');
create type subscription_tier as enum ('free', 'premium', 'family', 'professional');
create type chat_role as enum ('user', 'assistant');

-- Stato di una intenzione aperta ("volevo andare a...")
create type intention_status as enum ('pending', 'done', 'dismissed');

-- Categoria di una scadenza
create type deadline_category as enum ('bollo', 'assicurazione', 'fiscale', 'abbonamento', 'documento', 'altro');
create type deadline_recurrence as enum ('none', 'annual', 'biennial', 'monthly');

-- Tipo di resurfacing (per il motore di priorità notifiche)
create type resurface_type as enum ('on_this_day', 'proximity', 'pre_trip', 'people', 'deadline', 'manual_recall');
