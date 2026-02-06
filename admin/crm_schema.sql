-- CRM Module Tables

-- 1. CRM Clients Table
-- Stores internal client data, distinct from the public website 'clients' (partners) table.
create table if not exists public.crm_clients (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  client_name text not null,
  business_name text not null,
  whatsapp_number text not null,
  phone_number text,
  email text,
  location text,
  service_type text, -- 'Website', 'App', 'Digital Marketing', 'Civil', 'UI/UX'
  status text default 'New', -- 'New', 'In Discussion', 'Confirmed', 'In Progress', 'Completed'
  last_called_at timestamp with time zone,
  next_follow_up date
);

-- 2. CRM Notes Table
-- Stores chronological notes and requirements for each client.
create table if not exists public.crm_notes (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  client_id uuid references public.crm_clients(id) on delete cascade not null,
  content text not null,
  note_type text default 'General' -- 'Requirement', 'Payment', 'General'
);

-- 3. CRM Call Logs Table
-- Tracks history of calls made to clients.
create table if not exists public.crm_call_logs (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  client_id uuid references public.crm_clients(id) on delete cascade not null,
  call_status text, -- 'Called', 'Callback Pending', 'Not Responding', 'Follow-up Needed'
  call_notes text
);

-- 4. Enable RLS
alter table public.crm_clients enable row level security;
alter table public.crm_notes enable row level security;
alter table public.crm_call_logs enable row level security;

-- 5. RLS Policies (Allow authenticated admin access only)
-- CRM Clients
create policy "Auth Read CRM Clients" on public.crm_clients for select using (auth.role() = 'authenticated');
create policy "Auth Insert CRM Clients" on public.crm_clients for insert with check (auth.role() = 'authenticated');
create policy "Auth Update CRM Clients" on public.crm_clients for update using (auth.role() = 'authenticated');
create policy "Auth Delete CRM Clients" on public.crm_clients for delete using (auth.role() = 'authenticated');

-- CRM Notes
create policy "Auth Read CRM Notes" on public.crm_notes for select using (auth.role() = 'authenticated');
create policy "Auth Insert CRM Notes" on public.crm_notes for insert with check (auth.role() = 'authenticated');
create policy "Auth Delete CRM Notes" on public.crm_notes for delete using (auth.role() = 'authenticated');

-- CRM Call Logs
create policy "Auth Read CRM Logs" on public.crm_call_logs for select using (auth.role() = 'authenticated');
create policy "Auth Insert CRM Logs" on public.crm_call_logs for insert with check (auth.role() = 'authenticated');
create policy "Auth Delete CRM Logs" on public.crm_call_logs for delete using (auth.role() = 'authenticated');
