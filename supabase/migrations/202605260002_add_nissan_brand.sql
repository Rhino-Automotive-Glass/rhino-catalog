insert into public.brands (name)
select 'Nissan'
where not exists (
  select 1
  from public.brands
  where public.normalize_brand_name(name) = public.normalize_brand_name('Nissan')
);
