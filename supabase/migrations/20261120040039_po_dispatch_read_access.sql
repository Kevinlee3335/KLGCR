-- The server dispatch worker must read the approved PO before sending it.
-- Keep browser permissions, approval writes and row policies unchanged.
grant select on table public.inventory_purchase_orders to service_role;
